import { ImapFlow } from 'imapflow';
import { db } from '../db';
import { decrypt } from '../utils/crypto';

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
          seen: msg.flags.has('\\Seen'),
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
