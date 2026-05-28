import { Router, Request, Response } from 'express';
import { eq, sql, and, gte, lte } from 'drizzle-orm';
import { auditLogQuerySchema } from '@servio/shared';
import { db } from '../db';
import { auditLogs } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin', 'manager'));

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = auditLogQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const { page, limit, action, entityType, userId, from, to } = parsed.data;
  const offset = (page - 1) * limit;

  const data = await db.query.auditLogs.findMany({
    where: (log, { eq, and, gte, lte }) => {
      const conditions = [];
      if (action) conditions.push(eq(log.action, action));
      if (entityType) conditions.push(eq(log.entityType, entityType));
      if (userId) conditions.push(eq(log.userId, userId));
      if (from) conditions.push(gte(log.createdAt, new Date(from)));
      if (to) conditions.push(lte(log.createdAt, new Date(to)));
      return conditions.length > 0 ? and(...conditions) : undefined;
    },
    with: { user: { columns: { id: true, name: true } } },
    limit,
    offset,
    orderBy: (log, { desc }) => [desc(log.createdAt)],
  });

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs);

  res.json({ data, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

export default router;
