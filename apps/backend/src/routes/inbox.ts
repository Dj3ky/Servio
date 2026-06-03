import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getInboxStatus, markMessageSeen } from '../services/imap';

const router = Router();

router.use(requireAuth);

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const result = await getInboxStatus();
  if (!result) {
    res.json({ enabled: false, unreadCount: 0, messages: [] });
    return;
  }
  res.json({ enabled: true, unreadCount: result.unreadCount, messages: result.messages });
});

router.post('/:uid/read', async (req: Request, res: Response): Promise<void> => {
  const uid = parseInt(req.params.uid, 10);
  if (isNaN(uid)) { res.status(400).json({ error: 'errors.validation' }); return; }
  await markMessageSeen(uid);
  res.json({ success: true });
});

export default router;
