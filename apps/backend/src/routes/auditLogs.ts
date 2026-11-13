import { Router, Request, Response } from 'express';
import { sql, and, eq, gte, lte, ilike, or, asc, desc, isNotNull, type SQL } from 'drizzle-orm';
import { format } from 'date-fns';
import { auditLogQuerySchema, type AuditLogQuery } from '@servio/shared';
import { db } from '../db';
import { auditLogs, users, contracts, reviews } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { createAuditLog } from '../utils/audit';

const router = Router();
router.use(requireAuth);
router.use(requireRole('auditLog', 'access'));

const EXPORT_MAX_ROWS = 50_000;

const sortColumns = {
  createdAt: auditLogs.createdAt,
  userEmail: auditLogs.userEmail,
  action: auditLogs.action,
  entityType: auditLogs.entityType,
  ipAddress: auditLogs.ipAddress,
} as const;

const selectFields = {
  id: auditLogs.id,
  userId: auditLogs.userId,
  userEmail: auditLogs.userEmail,
  userName: users.name,
  action: auditLogs.action,
  entityType: auditLogs.entityType,
  entityId: auditLogs.entityId,
  payload: auditLogs.payload,
  ipAddress: auditLogs.ipAddress,
  createdAt: auditLogs.createdAt,
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function buildWhere(q: AuditLogQuery): SQL | undefined {
  const conditions: SQL[] = [];
  if (q.action) conditions.push(eq(auditLogs.action, q.action));
  if (q.entityType) conditions.push(eq(auditLogs.entityType, q.entityType));
  if (q.entityId) conditions.push(eq(auditLogs.entityId, q.entityId));
  if (q.userId) conditions.push(eq(auditLogs.userId, q.userId));
  if (q.from) conditions.push(gte(auditLogs.createdAt, new Date(q.from)));
  if (q.to) conditions.push(lte(auditLogs.createdAt, new Date(q.to)));
  if (q.search) {
    const pattern = `%${escapeLike(q.search)}%`;
    conditions.push(or(
      ilike(auditLogs.userEmail, pattern),
      ilike(auditLogs.action, pattern),
      ilike(auditLogs.entityType, pattern),
      ilike(auditLogs.entityId, pattern),
      ilike(auditLogs.ipAddress, pattern),
      sql`${auditLogs.payload}::text ILIKE ${pattern}`,
    )!);
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildOrderBy(q: AuditLogQuery): SQL[] {
  const col = sortColumns[q.sortBy];
  return q.sortDir === 'asc'
    ? [sql`${col} ASC NULLS LAST`, asc(auditLogs.id)]
    : [sql`${col} DESC NULLS LAST`, desc(auditLogs.id)];
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = auditLogQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const q = parsed.data;
  const where = buildWhere(q);

  const [data, [{ count }]] = await Promise.all([
    db.select(selectFields)
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where)
      .orderBy(...buildOrderBy(q))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit),
    db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where),
  ]);

  const total = Number(count);
  res.json({ data, total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) });
});

// CSV of everything matching the current filters (same query params as the list, page/limit ignored)
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const parsed = auditLogQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const q = parsed.data;
  const rows = await db.select(selectFields)
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(buildWhere(q))
    .orderBy(...buildOrderBy(q))
    .limit(EXPORT_MAX_ROWS);

  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = 'timestamp;user_name;user_email;action;entity_type;entity_id;ip_address;details';
  const lines = rows.map((r) => [
    format(r.createdAt, 'yyyy-MM-dd HH:mm:ss'),
    r.userName,
    r.userEmail,
    r.action,
    r.entityType,
    r.entityId,
    r.ipAddress,
    r.payload,
  ].map(cell).join(';'));

  await createAuditLog({
    userId: req.auth!.userId,
    userEmail: req.auth!.email,
    action: 'export_audit_logs',
    entityType: 'audit_log',
    payload: {
      rows: rows.length,
      truncated: rows.length === EXPORT_MAX_ROWS,
      filters: Object.fromEntries(
        Object.entries({ action: q.action, entityType: q.entityType, entityId: q.entityId, userId: q.userId, search: q.search, from: q.from, to: q.to })
          .filter(([, v]) => v !== undefined),
      ),
    },
    req,
  });

  // BOM so Excel opens the file as UTF-8 (keeps č, š, ž intact)
  const csv = '﻿' + [header, ...lines].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
  res.send(csv);
});

// Values that actually occur in the log, for the filter dropdowns
router.get('/filters', async (_req: Request, res: Response): Promise<void> => {
  const [actionRows, entityRows, userRows] = await Promise.all([
    db.selectDistinct({ value: auditLogs.action }).from(auditLogs).orderBy(asc(auditLogs.action)),
    db.selectDistinct({ value: auditLogs.entityType }).from(auditLogs)
      .where(isNotNull(auditLogs.entityType)).orderBy(asc(auditLogs.entityType)),
    db.select({
      id: auditLogs.userId,
      email: sql<string | null>`max(${auditLogs.userEmail})`,
      name: users.name,
    })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(isNotNull(auditLogs.userId))
      .groupBy(auditLogs.userId, users.name),
  ]);

  res.json({
    actions: actionRows.map((r) => r.value),
    entityTypes: entityRows.map((r) => r.value as string),
    users: userRows
      .map((u) => ({ id: u.id as string, email: u.email, name: u.name }))
      .sort((a, b) => (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? '')),
  });
});

// Where in the app an entity lives. Contracts and reviews have no page of their own,
// so they open their facility. Returns { path: null } when the entity no longer exists.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/resolve/:entityType/:entityId', async (req: Request, res: Response): Promise<void> => {
  const { entityType, entityId } = req.params;
  if (!UUID_RE.test(entityId)) { res.json({ path: null }); return; }

  let facilityId: string | undefined;
  if (entityType === 'contract') {
    const [row] = await db.select({ facilityId: contracts.facilityId }).from(contracts).where(eq(contracts.id, entityId)).limit(1);
    facilityId = row?.facilityId;
  } else if (entityType === 'review') {
    const [row] = await db.select({ facilityId: reviews.facilityId }).from(reviews).where(eq(reviews.id, entityId)).limit(1);
    facilityId = row?.facilityId;
  } else {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }

  res.json({ path: facilityId ? `/facilities/${facilityId}` : null });
});

export default router;
