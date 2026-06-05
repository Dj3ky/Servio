import { ImapFlow } from 'imapflow';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { reviews, invoices, notifications } from '../db/schema';
import { decrypt } from '../utils/crypto';
import { broadcast } from '../ws';

const BOUNCE_FROM_PATTERNS = [/mailer-daemon/i, /postmaster/i, /mail delivery/i, /mail system/i];
const BOUNCE_SUBJECT_PATTERNS = [
  /undeliverable/i, /delivery (status notification|failure|failed)/i,
  /returned mail/i, /failure notice/i, /mail delivery/i, /undelivered/i,
];

function isBounceMail(from: string, subject: string): boolean {
  return BOUNCE_FROM_PATTERNS.some((p) => p.test(from)) ||
    BOUNCE_SUBJECT_PATTERNS.some((p) => p.test(subject));
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(matches.map((e) => e.toLowerCase()))];
}

export interface InboxMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  seen: boolean;
}

async function createImapClient(): Promise<ImapFlow | null> {
  const s = await db.query.settings.findFirst();
  if (!s?.imapPort || !s.smtpHost || !s.smtpUser || !s.smtpPassEncrypted) return null;

  return new ImapFlow({
    host: s.smtpHost,
    port: s.imapPort,
    secure: s.imapPort === 993,
    auth: {
      user: s.smtpUser,
      pass: decrypt(s.smtpPassEncrypted),
    },
    logger: false,
  });
}

export async function getInboxStatus(): Promise<{ unreadCount: number; messages: InboxMessage[] } | null> {
  const client = await createImapClient();
  if (!client) return null;

  try {
    await client.connect();
    const status = await client.status('INBOX', { messages: true, unseen: true });
    const total = status.messages ?? 0;
    const unreadCount = status.unseen ?? 0;

    const messages: InboxMessage[] = [];
    if (total > 0) {
      const start = Math.max(1, total - 29);
      await client.mailboxOpen('INBOX');
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true, uid: true })) {
        const env = msg.envelope;
        const from = env?.from?.[0]
          ? (env.from[0].name || env.from[0].address || '')
          : '';
        messages.push({
          uid: msg.uid,
          from,
          subject: env?.subject ?? '(no subject)',
          date: (env?.date ?? new Date()).toISOString(),
          seen: msg.flags?.has('\\Seen') ?? false,
        });
      }
      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return { unreadCount, messages };
  } catch (err) {
    console.error('[imap] Failed to fetch inbox:', err);
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function detectAndProcessBounces(): Promise<string[]> {
  const client = await createImapClient();
  if (!client) return [];

  const bouncedEmails: string[] = [];

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    // Only check unread messages. Once a bounce is processed it is marked
    // as read so it is never picked up again.
    const uids = await client.search({ seen: false }, { uid: true });
    if (!uids || uids.length === 0) return [];

    const bouncedAddresses = new Set<string>();
    const bounceUidsByAddress = new Map<string, number[]>();

    for await (const msg of client.fetch(uids, { envelope: true, uid: true, source: true }, { uid: true })) {
      const env = msg.envelope;
      const from = (env?.from?.[0]?.name ?? '') + ' ' + (env?.from?.[0]?.address ?? '');
      const subject = env?.subject ?? '';
      if (!isBounceMail(from, subject)) continue;

      const bodyText = msg.source ? msg.source.toString() : '';
      const found = extractEmails(bodyText);
      for (const email of found) {
        bouncedAddresses.add(email);
        const existing = bounceUidsByAddress.get(email) ?? [];
        existing.push(msg.uid);
        bounceUidsByAddress.set(email, existing);
      }
    }

    if (bouncedAddresses.size === 0) return [];

    // Load reviews that were sent but not yet bounced, with their contract's email
    const candidates = await db.query.reviews.findMany({
      where: (r, { and, eq }) => and(eq(r.emailSent, true), eq(r.emailBounced, false)),
      columns: { id: true, contractId: true },
      with: {
        contract: {
          columns: { customerEmail: true },
          with: { customer: { columns: { email: true } } },
        },
      },
    });

    for (const review of candidates) {
      const recipientEmail = (
        (review as any).contract?.customerEmail ?? (review as any).contract?.customer?.email ?? ''
      ).toLowerCase();
      if (!recipientEmail || !bouncedAddresses.has(recipientEmail)) continue;

      await db.update(reviews).set({ emailBounced: true }).where(eq(reviews.id, review.id));
      bouncedEmails.push(recipientEmail);

      try {
        const [notif] = await db.insert(notifications).values({
          type: 'email_bounced',
          title: 'Email Bounced',
          message: `Review email to ${recipientEmail} was returned.`,
          entityType: 'review',
          entityId: review.id,
        }).returning();
        broadcast('notification_created', { id: notif.id, type: notif.type, title: notif.title, message: notif.message });
      } catch {}

      for (const uid of bounceUidsByAddress.get(recipientEmail) ?? []) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
    }

    // Check invoices — recipient is contract.invoiceEmail
    const invoiceCandidates = await db.query.invoices.findMany({
      where: (inv, { and, eq }) => and(eq(inv.emailBounced, false), eq(inv.status, 'completed')),
      columns: { id: true },
      with: { contract: { columns: { invoiceEmail: true } } },
    });

    for (const invoice of invoiceCandidates) {
      const recipientEmail = ((invoice as any).contract?.invoiceEmail ?? '').toLowerCase();
      if (!recipientEmail || !bouncedAddresses.has(recipientEmail)) continue;

      await db.update(invoices).set({ emailBounced: true }).where(eq(invoices.id, invoice.id));
      bouncedEmails.push(recipientEmail);

      try {
        const [notif] = await db.insert(notifications).values({
          type: 'email_bounced',
          title: 'Email Bounced',
          message: `Invoice email to ${recipientEmail} was returned.`,
          entityType: 'invoice',
          entityId: invoice.id,
        }).returning();
        broadcast('notification_created', { id: notif.id, type: notif.type, title: notif.title, message: notif.message });
      } catch {}

      for (const uid of bounceUidsByAddress.get(recipientEmail) ?? []) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
    }
  } catch (err) {
    console.error('[imap] Bounce detection failed:', err);
  } finally {
    await client.logout().catch(() => {});
  }

  return bouncedEmails;
}

function extractTextBody(source: string): string {
  const blankLine = source.indexOf('\r\n\r\n') !== -1 ? source.indexOf('\r\n\r\n') + 4 : source.indexOf('\n\n') + 2;
  const headers = source.substring(0, blankLine);
  const body = source.substring(blankLine);

  const boundaryMatch = headers.match(/boundary="?([^";\r\n]+)"?/i);
  if (boundaryMatch) {
    const boundary = '--' + boundaryMatch[1].trim();
    const parts = body.split(boundary);
    for (const part of parts) {
      if (/content-type:\s*text\/plain/i.test(part)) {
        const partBody = part.indexOf('\r\n\r\n') !== -1
          ? part.substring(part.indexOf('\r\n\r\n') + 4)
          : part.substring(part.indexOf('\n\n') + 2);
        const cleaned = partBody.replace(/--$/, '').trim();
        if (cleaned) return cleaned;
      }
    }
  }

  return body.trim();
}

export async function fetchMessageBody(uid: number): Promise<{ from: string; subject: string; date: string; body: string } | null> {
  const client = await createImapClient();
  if (!client) return null;

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    let result: { from: string; subject: string; date: string; body: string } | null = null;

    for await (const msg of client.fetch(String(uid), { envelope: true, source: true, uid: true }, { uid: true })) {
      const env = msg.envelope;
      const from = env?.from?.[0]
        ? (env.from[0].name ? `${env.from[0].name} <${env.from[0].address}>` : (env.from[0].address ?? ''))
        : '';
      const source = msg.source ? msg.source.toString() : '';
      result = {
        from,
        subject: env?.subject ?? '(no subject)',
        date: (env?.date ?? new Date()).toISOString(),
        body: extractTextBody(source),
      };
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    }

    return result;
  } catch (err) {
    console.error('[imap] Failed to fetch message body:', err);
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function markMessageSeen(uid: number): Promise<void> {
  const client = await createImapClient();
  if (!client) return;

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');
    await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
  } catch (err) {
    console.error('[imap] Failed to mark message as seen:', err);
  } finally {
    await client.logout().catch(() => {});
  }
}
