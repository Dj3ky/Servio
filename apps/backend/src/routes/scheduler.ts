import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { createPendingReviews } from '../services/scheduler';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin'));

router.post('/trigger-reviews', async (req: Request, res: Response): Promise<void> => {
  const count = await createPendingReviews();
  res.json({ success: true, created: count });
});

export default router;
