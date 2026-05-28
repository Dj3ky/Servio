import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { testSmbConnection } from '../services/smb';
import { createAuditLog } from '../utils/audit';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin'));

router.post('/test', async (req: Request, res: Response): Promise<void> => {
  const result = await testSmbConnection();
  try {
    await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'test_smb', payload: { success: result.success }, req });
  } catch {
    // audit log failure must not block the test result
  }
  res.json(result);
});

export default router;
