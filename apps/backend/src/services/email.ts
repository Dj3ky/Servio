import nodemailer from 'nodemailer';
import { resolveMx } from 'dns/promises';
import { db } from '../db';
import { decrypt } from '../utils/crypto';
import { format } from 'date-fns';

async function validateEmailDomain(email: string): Promise<void> {
  const domain = email.split('@')[1];
  if (!domain) throw new Error(`Invalid email address: ${email}`);
  try {
    await resolveMx(domain);
  } catch (err: any) {
    // Only reject when the domain provably doesn't exist.
    // ENODATA means no MX records but the domain may still receive mail via A-record fallback (RFC 5321).
    // ESERVFAIL / other errors are transient — let the SMTP server decide.
    if (err.code === 'ENOTFOUND') {
      throw new Error(`Domain does not exist: ${domain}`);
    }
    // For all other DNS errors, fall through and let SMTP handle it.
  }
}

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content?: Buffer; path?: string; contentType?: string }>;
}

async function getTransporter() {
  const s = await db.query.settings.findFirst();
  if (!s?.smtpHost || !s.smtpUser || !s.smtpPassEncrypted) {
    throw new Error('SMTP not configured');
  }

  return nodemailer.createTransport({
    host: s.smtpHost,
    port: s.smtpPort ?? 587,
    secure: s.smtpSecure,
    auth: {
      user: s.smtpUser,
      pass: decrypt(s.smtpPassEncrypted),
    },
  });
}

export async function sendMail(options: MailOptions): Promise<void> {
  await validateEmailDomain(options.to);

  const s = await db.query.settings.findFirst();
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: s?.smtpFrom ?? options.to,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      path: a.path,
      contentType: a.contentType,
    })),
  });

  if (info.rejected && info.rejected.length > 0) {
    throw new Error(`Email address rejected by server: ${info.rejected.join(', ')}`);
  }
}

export async function testSmtpConnection(recipient: string): Promise<{ success: boolean; error?: string }> {
  try {
    const s = await db.query.settings.findFirst();
    if (!s?.appName) throw new Error('Settings not loaded');

    const transporter = await getTransporter();
    await transporter.verify();

    await sendMail({
      to: recipient,
      subject: `${s.appName} – SMTP Test`,
      html: `<p>SMTP connection test from ${s.appName} was successful.</p>`,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template,
  );
}

export async function sendDigestEmail(): Promise<void> {
  const s = await db.query.settings.findFirst();
  if (!s?.digestEnabled) return;

  const recipient = s.digestEmail || s.accountingEmail;
  if (!recipient) return;

  const appName = s.appName ?? 'Servio';

  const [pendingReviews, pendingInvoices] = await Promise.all([
    db.query.reviews.findMany({
      where: (r, { inArray }) => inArray(r.status, ['pending', 'in_progress']),
      with: { contract: { with: { facility: true, customer: true } } },
      orderBy: (r, { asc }) => [asc(r.scheduledMonth)],
      limit: 50,
    }),
    db.query.invoices.findMany({
      where: (inv, { eq }) => eq(inv.status, 'pending'),
      with: { review: { with: { contract: { with: { facility: true, customer: true } } } } },
      orderBy: (inv, { asc }) => [asc(inv.createdAt)],
      limit: 50,
    }),
  ]);

  if (pendingReviews.length === 0 && pendingInvoices.length === 0) return;

  const reviewRows = pendingReviews.map((r) =>
    `<tr><td>${(r as any).contract?.customer?.name ?? ''}</td><td>${(r as any).contract?.facility?.name ?? ''}</td><td>${r.scheduledMonth.slice(0, 7)}</td><td>${r.status}</td></tr>`,
  ).join('');

  const invoiceRows = pendingInvoices.map((inv) =>
    `<tr><td>${(inv as any).review?.contract?.customer?.name ?? ''}</td><td>${(inv as any).review?.contract?.facility?.name ?? ''}</td><td>${(inv as any).review?.contract?.contractNumber ?? ''}</td><td>${format(new Date(inv.createdAt), 'yyyy-MM-dd')}</td></tr>`,
  ).join('');

  const html = `
    <h2>${appName} — Daily Digest</h2>
    <p>Summary for ${format(new Date(), 'yyyy-MM-dd')}</p>

    ${pendingReviews.length > 0 ? `
    <h3>Pending Reviews (${pendingReviews.length})</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
      <thead><tr><th>Customer</th><th>Facility</th><th>Month</th><th>Status</th></tr></thead>
      <tbody>${reviewRows}</tbody>
    </table>` : '<p>No pending reviews.</p>'}

    ${pendingInvoices.length > 0 ? `
    <h3>Pending Invoices (${pendingInvoices.length})</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
      <thead><tr><th>Customer</th><th>Facility</th><th>Contract</th><th>Created</th></tr></thead>
      <tbody>${invoiceRows}</tbody>
    </table>` : '<p>No pending invoices.</p>'}
  `;

  await sendMail({ to: recipient, subject: `${appName} – Daily Digest ${format(new Date(), 'yyyy-MM-dd')}`, html });
}

export async function sendEscalationAlerts(): Promise<void> {
  const s = await db.query.settings.findFirst();
  if (!s?.escalationEnabled) return;

  const days = s.escalationDays ?? 3;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = format(cutoff, 'yyyy-MM-dd');

  const overdueReviews = await db.query.reviews.findMany({
    where: (r, { inArray, and, lt }) => and(
      inArray(r.status, ['pending', 'in_progress']),
      lt(r.scheduledMonth, cutoffStr),
    ),
    with: { contract: { with: { facility: true, customer: true } } },
    orderBy: (r, { asc }) => [asc(r.scheduledMonth)],
  });

  if (overdueReviews.length === 0) return;

  // Collect manager + admin emails
  const managers = await db.query.users.findMany({
    where: (u, { inArray, and, eq }) => and(
      inArray(u.role, ['admin', 'manager']),
      eq(u.isActive, true),
    ),
    columns: { email: true, name: true },
  });

  if (managers.length === 0) return;

  const appName = s.appName ?? 'Servio';
  const rows = overdueReviews.map((r) =>
    `<tr><td>${(r as any).contract?.customer?.name ?? ''}</td><td>${(r as any).contract?.facility?.name ?? ''}</td><td>${r.scheduledMonth.slice(0, 7)}</td><td>${r.status}</td></tr>`,
  ).join('');

  const html = `
    <h2>${appName} — Escalation Alert</h2>
    <p>The following reviews have been pending for more than <strong>${days} days</strong>:</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
      <thead><tr><th>Customer</th><th>Facility</th><th>Month</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Please take action to complete or escalate these reviews.</p>
  `;

  for (const manager of managers) {
    await sendMail({
      to: manager.email,
      subject: `${appName} – ${overdueReviews.length} overdue review(s) require attention`,
      html,
    }).catch((err) => console.error(`[escalation] Failed to email ${manager.email}:`, err));
  }
}
