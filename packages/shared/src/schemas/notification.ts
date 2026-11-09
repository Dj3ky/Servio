import { z } from 'zod';

export const notificationTypeSchema = z.enum([
  'smb_failed',
  'email_failed',
  'backup_failed',
  'review_overdue',
  'email_bounced',
  'pm_task_assigned',
  'pm_task_due',
  'pm_task_overdue',
  'pm_task_done',
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

export type Notification = z.infer<typeof notificationSchema>;
