import { and, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm';
import { db } from '../db';
import { notifications, type DbNewNotification } from '../db/schema';
import { sendToUser, sendToRoles } from '../ws';
import { getPermissions } from './permissionsService';
import type { NotificationCreatedPayload } from '@servio/shared';

type Audience = 'system' | 'email' | 'invoiceEmail';

// Which permissions.notifications.* entry decides who sees a shared notification
function audienceOf(type: DbNewNotification['type'], entityType: string | null | undefined): Audience {
  if (type === 'smb_failed' || type === 'backup_failed') return 'system';
  if (type === 'email_bounced' && entityType === 'invoice') return 'invoiceEmail';
  return 'email';
}

function rolesFor(audience: Audience): string[] {
  const perms = getPermissions() as unknown as Record<string, Record<string, string[]>>;
  return perms.notifications?.[audience] ?? ['admin'];
}

function payloadOf(notif: typeof notifications.$inferSelect, personal: boolean): NotificationCreatedPayload {
  return {
    id: notif.id,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    entityType: notif.entityType,
    entityId: notif.entityId,
    personal,
  };
}

// Creates a personal notification and pushes it live to that user's open sessions
export async function notifyUser(userId: string, n: Omit<DbNewNotification, 'userId'>): Promise<void> {
  const [notif] = await db.insert(notifications).values({ ...n, userId }).returning();
  sendToUser(userId, 'notification_created', payloadOf(notif, true));
}

// Creates a shared system notification and pushes it live only to the roles allowed to see it
export async function notifySystem(n: Omit<DbNewNotification, 'userId'>): Promise<void> {
  const [notif] = await db.insert(notifications).values({ ...n, userId: null }).returning();
  sendToRoles(rolesFor(audienceOf(notif.type, notif.entityType)), 'notification_created', payloadOf(notif, false));
}

// Notifications a user may see: their personal ones, plus shared ones their role is allowed to see
export function notificationsVisibleTo(userId: string, role: string): SQL {
  const allowed = (audience: Audience) => rolesFor(audience).includes(role);
  const shared: SQL[] = [];
  if (allowed('system')) shared.push(inArray(notifications.type, ['smb_failed', 'backup_failed']));
  if (allowed('email')) {
    shared.push(and(
      inArray(notifications.type, ['email_failed', 'email_bounced', 'review_overdue']),
      or(isNull(notifications.entityType), ne(notifications.entityType, 'invoice')),
    )!);
  }
  if (allowed('invoiceEmail')) shared.push(and(eq(notifications.type, 'email_bounced'), eq(notifications.entityType, 'invoice'))!);

  const own = eq(notifications.userId, userId);
  return shared.length > 0 ? or(own, and(isNull(notifications.userId), or(...shared)))! : own;
}
