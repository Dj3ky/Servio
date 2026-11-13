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

export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

const MASK = '•••';
const SECRET_KEY = /pass|secret|token|apikey|encrypted/i;
const MAX_TEXT = 2000;
const IGNORED_KEYS = new Set(['updatedAt', 'createdAt']);

function comparable(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function storable(v: unknown): unknown {
  if (v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' && v.length > MAX_TEXT) return `${v.slice(0, MAX_TEXT)}…`;
  return v;
}

/**
 * Field-level differences between two versions of a record, for the audit log.
 * Only keys whose value actually changed are included. Secret-looking keys are masked,
 * so the log shows that they changed without storing them. Null, undefined and '' count as equal.
 */
export function diffRecords(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
  keys: Iterable<string> = Object.keys(after),
): AuditChanges {
  const changes: AuditChanges = {};
  for (const key of keys) {
    if (IGNORED_KEYS.has(key)) continue;
    const from = before?.[key];
    const to = after[key];
    if (comparable(from) === comparable(to)) continue;
    changes[key] = SECRET_KEY.test(key)
      ? { from: from ? MASK : null, to: to ? MASK : null }
      : { from: storable(from), to: storable(to) };
  }
  return changes;
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
