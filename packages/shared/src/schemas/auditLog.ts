import { z } from 'zod';
import { AuditAction } from '../enums';

// Derived from the AuditAction enum so the two can never drift apart
const auditActionValues = Object.values(AuditAction) as [AuditAction, ...AuditAction[]];
export const auditActionSchema = z.enum(auditActionValues);

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

export const auditLogSortFields = ['createdAt', 'userEmail', 'action', 'entityType', 'ipAddress'] as const;

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  // Actions are stored as plain text, so older or extension-specific values are allowed too
  action: z.string().max(64).optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.string().max(128).optional(),
  userId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sortBy: z.enum(auditLogSortFields).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
