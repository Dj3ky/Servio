import { Router, Request, Response, NextFunction } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { settings } from '../../db/schema';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import { isExtensionLicensed } from '../../middleware/license';
import { updateExtensionConfigSchema } from '@servio/shared';
import pmCustomersRoutes from './routes/pm-customers';
import pmFacilitiesRoutes from './routes/pm-facilities';
import pmProjectsRoutes from './routes/pm-projects';
import pmMeetingsRoutes from './routes/pm-meetings';
import pmReportsRoutes from './routes/pm-reports';

const FEATURE_KEY = 'projects_extension';

async function isEnabled(): Promise<boolean> {
  if (!isExtensionLicensed(FEATURE_KEY)) return false;
  const [s] = await db.select({ extensionsConfig: settings.extensionsConfig }).from(settings).where(eq(settings.id, 1)).limit(1);
  const cfg = s?.extensionsConfig as Record<string, { enabled: boolean }> | null;
  return cfg?.projects?.enabled === true;
}

async function requireExtension(req: Request, res: Response, next: NextFunction): Promise<void> {
  const enabled = await isEnabled();
  if (!enabled) { res.status(403).json({ error: 'Extension not enabled' }); return; }
  next();
}

const router = Router();

// Extension status — no gate needed, used by frontend to show/hide nav + settings UI
router.get('/status', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const licensed = isExtensionLicensed(FEATURE_KEY);
  const enabled = licensed ? await isEnabled() : false;
  res.json({ licensed, enabled });
});

// Toggle extension on/off — admin only, requires license
router.patch('/config', requireAuth, requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  if (!isExtensionLicensed(FEATURE_KEY)) {
    res.status(403).json({ error: 'Extension not licensed' });
    return;
  }

  const parsed = updateExtensionConfigSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [current] = await db.select({ extensionsConfig: settings.extensionsConfig }).from(settings).where(eq(settings.id, 1)).limit(1);
  const existing = (current?.extensionsConfig as Record<string, unknown>) ?? {};

  const updated = {
    ...existing,
    [parsed.data.extension]: { enabled: parsed.data.enabled },
  };

  await db.update(settings).set({ extensionsConfig: updated, updatedAt: new Date() }).where(eq(settings.id, 1));
  res.json({ success: true, extensions: updated });
});

// Remove all extension data — drops all pm_ tables and disables the extension
// This is irreversible. Admin only.
router.delete('/extension-data', requireAuth, requireRole('settings', 'manage'), async (_req: Request, res: Response): Promise<void> => {
  // Drop in child-first order
  await db.execute(sql`DROP TABLE IF EXISTS pm_project_documents CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS pm_meeting_entries CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS pm_project_phases CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS pm_weekly_meetings CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS pm_projects CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS pm_facilities CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS pm_customers CASCADE`);

  // Clear extension config
  const [current] = await db.select({ extensionsConfig: settings.extensionsConfig }).from(settings).where(eq(settings.id, 1)).limit(1);
  const existing = (current?.extensionsConfig as Record<string, unknown>) ?? {};
  const updated = { ...existing, projects: { enabled: false } };
  await db.update(settings).set({ extensionsConfig: updated, updatedAt: new Date() }).where(eq(settings.id, 1));

  res.json({ success: true });
});

// All data routes — gated behind requireExtension
router.use('/customers', requireExtension, pmCustomersRoutes);
router.use('/facilities', requireExtension, pmFacilitiesRoutes);
router.use('/projects', requireExtension, pmProjectsRoutes);
router.use('/meetings', requireExtension, pmMeetingsRoutes);
router.use('/reports', requireExtension, pmReportsRoutes);

export default router;
