import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { notifications } from '../db/schema';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const unreadOnly = req.query.unread === 'true';
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));

  const data = await db.query.notifications.findMany({
    where: unreadOnly ? (n, { eq }) => eq(n.isRead, false) : undefined,
    limit,
    orderBy: (n, { desc }) => [desc(n.createdAt)],
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.isRead, false));

  res.json({ data, unreadCount: Number(count) });
});

router.post('/:id/read', async (req: Request, res: Response): Promise<void> => {
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, req.params.id));
  res.json({ success: true });
});

router.post('/read-all', async (_req: Request, res: Response): Promise<void> => {
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.isRead, false));
  res.json({ success: true });
});

export default router;
