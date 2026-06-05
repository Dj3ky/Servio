import { Router, Request, Response } from 'express';
import { permissions } from '@servio/shared';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { createPendingReviews, backfillMissingReviews } from '../services/scheduler';

const router = Router();
router.use(requireAuth);
router.use(requireRole(...permissions.scheduler.access));

router.post('/trigger-reviews', async (req: Request, res: Response): Promise<void> => {
  const count = await createPendingReviews();
  res.json({ success: true, created: count });
});

router.post('/backfill', async (req: Request, res: Response): Promise<void> => {
  const monthsBack = Math.min(36, Math.max(1, parseInt((req.body as any).monthsBack ?? '12', 10)));
  const count = await backfillMissingReviews(monthsBack);
  res.json({ success: true, created: count });
});

export default router;
