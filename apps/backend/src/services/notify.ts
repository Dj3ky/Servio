import { db } from '../db';
import { notifications, type DbNewNotification } from '../db/schema';
import { sendToUser } from '../ws';
import type { NotificationCreatedPayload } from '@servio/shared';

// Creates a personal notification and pushes it live to that user's open sessions
export async function notifyUser(userId: string, n: Omit<DbNewNotification, 'userId'>): Promise<void> {
  const [notif] = await db.insert(notifications).values({ ...n, userId }).returning();
  sendToUser<NotificationCreatedPayload>(userId, 'notification_created', {
    personal: true,
    id: notif.id,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    entityType: notif.entityType,
    entityId: notif.entityId,
  });
}
