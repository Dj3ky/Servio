import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { getLicenseStatus, setLicenseTokenFromDb } from '../middleware/license';
import { db } from '../db';
import { settings } from '../db/schema';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 } });

const LICENSE_KEY_PATH = process.env.LICENSE_KEY_PATH ?? path.join(process.cwd(), 'license.key');

router.get('/status', requireAuth, (_req: Request, res: Response) => {
  res.json(getLicenseStatus());
});

router.post('/upload', requireAuth, requireRole('admin'), upload.single('license'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'errors.file_required' });
    return;
  }

  const content = req.file.buffer.toString('utf8').trim();

  // Validate before persisting
  setLicenseTokenFromDb(content);
  const status = getLicenseStatus();

  if (!status.valid) {
    setLicenseTokenFromDb(null);
    res.status(400).json({ error: 'errors.license_invalid' });
    return;
  }

  // Persist to DB (survives container restarts) and file (bare-metal fallback)
  await db.update(settings).set({ licenseKey: content }).where(eq(settings.id, 1));
  try { fs.writeFileSync(LICENSE_KEY_PATH, content, 'utf8'); } catch { /* ignore on read-only fs */ }

  res.json(status);
});

export default router;
