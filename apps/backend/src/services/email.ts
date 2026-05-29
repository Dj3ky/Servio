import nodemailer from 'nodemailer';
import { db } from '../db';
import { decrypt } from '../utils/crypto';

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
  const s = await db.query.settings.findFirst();
  const transporter = await getTransporter();

  await transporter.sendMail({
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
