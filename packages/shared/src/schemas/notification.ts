import { z } from 'zod';

export const notificationTypeSchema = z.enum([
  'smb_failed',
  'email_failed',
  'backup_failed',
  'review_overdue',
  'invoice_waiting',
  'review_completed',
]);

export const notificationSchema = z.object({
  id: z.string().uuid(),
  type: notificationTypeSchema,
  title: z.string(),
  message: z.string(),
  isRead: z.boolean(),
  entityType: z.string().nullable(),
  entityId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type Notification = z.infer<typeof notificationSchema>;
