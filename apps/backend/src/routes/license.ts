import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { getLicenseStatus, invalidateLicenseCache } from '../middleware/license';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 } });

const LICENSE_KEY_PATH = process.env.LICENSE_KEY_PATH ?? path.join(process.cwd(), 'license.key');

router.get('/status', requireAuth, (_req: Request, res: Response) => {
  res.json(getLicenseStatus());
});

router.post('/upload', requireAuth, requireRole('admin'), upload.single('license'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'errors.file_required' });
    return;
  }

  const content = req.file.buffer.toString('utf8').trim();

  fs.writeFileSync(LICENSE_KEY_PATH, content, 'utf8');
  invalidateLicenseCache();

  const status = getLicenseStatus();

  if (!status.valid) {
    try { fs.unlinkSync(LICENSE_KEY_PATH); } catch { /* ignore */ }
    invalidateLicenseCache();
    res.status(400).json({ error: 'errors.license_invalid' });
    return;
  }

  res.json(status);
});

export default router;
