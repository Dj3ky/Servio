import { Router, Request, Response, NextFunction } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { settings } from '../../db/schema';
import { users } from '../../db/schema/users';
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

// Ensures pm_* tables exist at startup — mirrors the ensureSettingsColumns() pattern in server.ts.
// This runs once when the module is first imported (i.e., on every server start).
async function ensurePmTables() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pm_customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        address TEXT,
        email TEXT,
        phone TEXT,
        contact_name TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pm_facilities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pm_customer_id UUID REFERENCES pm_customers(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        address TEXT,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pm_projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_number TEXT NOT NULL,
        name TEXT NOT NULL,
        order_date DATE,
        employee_id UUID REFERENCES users(id) ON DELETE SET NULL,
        customer_name TEXT,
        facility_name TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'active',
        start_date DATE,
        end_date DATE,
        contract_value NUMERIC(12,2),
        invoiced_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Ensure text columns exist on tables that may have been created with the old FK structure
    await db.execute(sql`ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS customer_name TEXT`);
    await db.execute(sql`ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS facility_name TEXT`);
    await db.execute(sql`ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pm_project_phases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pm_weekly_meetings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_date DATE NOT NULL,
        notes TEXT,
        created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pm_meeting_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        meeting_id UUID NOT NULL REFERENCES pm_weekly_meetings(id) ON DELETE CASCADE,
        project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
        entry_status TEXT NOT NULL DEFAULT 'in_progress',
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(meeting_id, project_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pm_project_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        uploaded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pm_project_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
        invoice_date DATE NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[pm-extension] Tables ensured.');
  } catch (err) {
    console.error('[pm-extension] Failed to ensure tables:', err);
  }
}

ensurePmTables();

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
  const existing = (current?.extensionsConfig ?? {}) as Record<string, { enabled: boolean }>;

  const updated: Record<string, { enabled: boolean }> = {
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
  const existing = (current?.extensionsConfig ?? {}) as Record<string, { enabled: boolean }>;
  const updated: Record<string, { enabled: boolean }> = { ...existing, projects: { enabled: false } };
  await db.update(settings).set({ extensionsConfig: updated, updatedAt: new Date() }).where(eq(settings.id, 1));

  res.json({ success: true });
});

// Employees list for project assignment — any authenticated user can read this
router.get('/employees', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const result = await db.select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(users.name);
  res.json(result);
});

// All data routes — gated behind requireExtension
router.use('/customers', requireExtension, pmCustomersRoutes);
router.use('/facilities', requireExtension, pmFacilitiesRoutes);
router.use('/projects', requireExtension, pmProjectsRoutes);
router.use('/meetings', requireExtension, pmMeetingsRoutes);
router.use('/reports', requireExtension, pmReportsRoutes);

export default router;
