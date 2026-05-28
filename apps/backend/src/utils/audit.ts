import { Request } from 'express';
import { db } from '../db';
import { auditLogs } from '../db/schema';
import { AuditAction } from '@servio/shared';

export interface AuditParams {
  userId?: string;
  userEmail?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  req?: Request;
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: params.userId ?? null,
      userEmail: params.userEmail ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      payload: params.payload ?? null,
      ipAddress: params.req
        ? (params.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
          params.req.socket.remoteAddress ??
          null
        : null,
    });
  } catch (err) {
    console.error('Failed to create audit log:', err);
  }
}
