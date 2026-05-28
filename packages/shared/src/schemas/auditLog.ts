import { z } from 'zod';

export const auditActionSchema = z.enum([
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'upload',
  'complete_review',
  'complete_invoice',
  'send_email',
  'test_smb',
  'test_smtp',
  'create_backup',
  'restore_backup',
  'deactivate_user',
  'reset_password',
]);

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  userEmail: z.string().nullable(),
  action: auditActionSchema,
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  payload: z.record(z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: auditActionSchema.optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
