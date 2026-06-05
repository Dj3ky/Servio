import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { checkForUpdates, startUpdate, getUpdateStatus, getUpdateLog } from '../services/update';
import { createAuditLog } from '../utils/audit';

const router = Router();

router.use(requireAuth, requireRole('update', 'access'));

router.get('/status', (_req: Request, res: Response): void => {
  res.json(getUpdateStatus());
});

router.post('/check', async (_req: Request, res: Response): Promise<void> => {
  const status = await checkForUpdates();
  res.json(status);
});

router.get('/log', (_req: Request, res: Response): void => {
  res.json(getUpdateLog());
});

router.post('/apply', async (req: Request, res: Response): Promise<void> => {
  const status = getUpdateStatus();
  if (!status.updateAvailable) {
    res.status(400).json({ error: 'errors.no_update_available' });
    return;
  }
  if (status.applying) {
    res.status(409).json({ error: 'errors.update_in_progress' });
    return;
  }

  await createAuditLog({
    userId: (req as any).user?.id,
    userEmail: (req as any).user?.email,
    action: 'update',
    entityType: 'system',
    entityId: 'server',
    payload: { fromCommit: status.currentCommit, toCommit: status.remoteCommit },
    req,
  });

  // Fire-and-forget — pm2 will kill this process during restart,
  // so we must respond before the script reaches that step.
  startUpdate();
  res.json({ started: true });
});

export default router;
