import { pgTable, text, timestamp, uuid, boolean, pgEnum } from 'drizzle-orm/pg-core';

export const notificationTypeEnum = pgEnum('notification_type', [
  'smb_failed',
  'email_failed',
  'backup_failed',
  'review_overdue',
  'invoice_waiting',
  'review_completed',
]);

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type DbNotification = typeof notifications.$inferSelect;
export type DbNewNotification = typeof notifications.$inferInsert;
