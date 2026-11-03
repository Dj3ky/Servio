import { Router, Request, Response } from 'express';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { notifications } from '../db/schema';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// Shared system notifications plus the user's own personal ones
const visibleTo = (userId: string) => or(isNull(notifications.userId), eq(notifications.userId, userId));

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const unreadOnly = req.query.unread === 'true';
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const visible = visibleTo(req.auth!.userId);

  const data = await db.select().from(notifications)
    .where(unreadOnly ? and(visible, eq(notifications.isRead, false)) : visible)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(visible, eq(notifications.isRead, false)));

  res.json({ data, unreadCount: Number(count) });
});

router.post('/:id/read', async (req: Request, res: Response): Promise<void> => {
  await db.update(notifications).set({ isRead: true })
    .where(and(eq(notifications.id, req.params.id), visibleTo(req.auth!.userId)));
  res.json({ success: true });
});

router.post('/read-all', async (req: Request, res: Response): Promise<void> => {
  await db.update(notifications).set({ isRead: true })
    .where(and(eq(notifications.isRead, false), visibleTo(req.auth!.userId)));
  res.json({ success: true });
});

export default router;
