import { Router, Request, Response, NextFunction } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { settings } from '../../db/schema';
import { clCategories } from './schema';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/role';
import { isExtensionLicensed } from '../../middleware/license';
import { updateExtensionConfigSchema } from '@servio/shared';
import clProjectsRoutes from './routes/cl-projects';
import clCategoriesRoutes from './routes/cl-categories';
import clActivityRoutes from './routes/cl-activity';

const FEATURE_KEY = 'changelog_extension';

// Ensures cl_* tables exist at startup — mirrors ensurePmTables() in extensions/projects/index.ts
// `name` here is just a DB fallback; the frontend looks up translationKey first so these
// show translated (sl/en) instead of always English.
const DEFAULT_CATEGORIES: { name: string; color: string; orderIndex: number; translationKey: string }[] = [
  { name: 'Electrical schema', color: '#3b82f6', orderIndex: 0, translationKey: 'electrical_schema' },
  { name: 'PLC program', color: '#8b5cf6', orderIndex: 1, translationKey: 'plc_program' },
  { name: 'Mechanical', color: '#f59e0b', orderIndex: 2, translationKey: 'mechanical' },
  { name: 'General', color: '#64748b', orderIndex: 3, translationKey: 'general' },
  { name: 'Other', color: '#94a3b8', orderIndex: 4, translationKey: 'other' },
];

async function ensureChangelogTables() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cl_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#64748b',
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE cl_categories ADD COLUMN IF NOT EXISTS translation_key TEXT`);
    // Backfill translation_key on rows seeded before this column existed, so they
    // pick up translated labels instead of staying stuck on their literal English name.
    for (const def of DEFAULT_CATEGORIES) {
      await db.execute(sql`
        UPDATE cl_categories SET translation_key = ${def.translationKey}
        WHERE translation_key IS NULL AND name = ${def.name}
      `);
    }
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cl_projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE cl_projects ADD COLUMN IF NOT EXISTS nas_path TEXT`);
    await db.execute(sql`ALTER TABLE cl_projects ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE cl_projects ADD COLUMN IF NOT EXISTS updated_by_name TEXT`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cl_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES cl_projects(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        author_id UUID REFERENCES users(id) ON DELETE SET NULL,
        author_name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        edited_at TIMESTAMP
      )
    `);
    await db.execute(sql`ALTER TABLE cl_entries DROP COLUMN IF EXISTS category`);
    await db.execute(sql`ALTER TABLE cl_entries ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES cl_categories(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE cl_entries ADD COLUMN IF NOT EXISTS edited_by_id UUID REFERENCES users(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE cl_entries ADD COLUMN IF NOT EXISTS edited_by_name TEXT`);
    await db.execute(sql`ALTER TABLE cl_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cl_entry_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entry_id UUID NOT NULL REFERENCES cl_entries(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        uploaded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(clCategories);
    if (Number(count) === 0) {
      await db.insert(clCategories).values(DEFAULT_CATEGORIES);
    }

    console.log('[changelog-extension] Tables ensured.');
  } catch (err) {
    console.error('[changelog-extension] Failed to ensure tables:', err);
  }
}

ensureChangelogTables();

async function isEnabled(): Promise<boolean> {
  if (!isExtensionLicensed(FEATURE_KEY)) return false;
  const [s] = await db.select({ extensionsConfig: settings.extensionsConfig }).from(settings).where(eq(settings.id, 1)).limit(1);
  const cfg = s?.extensionsConfig as Record<string, { enabled: boolean }> | null;
  return cfg?.changelog?.enabled === true;
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

// Remove all extension data — drops all cl_ tables and disables the extension
// This is irreversible. Admin only.
router.delete('/extension-data', requireAuth, requireRole('settings', 'manage'), async (_req: Request, res: Response): Promise<void> => {
  await db.execute(sql`DROP TABLE IF EXISTS cl_entry_attachments CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS cl_entries CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS cl_projects CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS cl_categories CASCADE`);

  const [current] = await db.select({ extensionsConfig: settings.extensionsConfig }).from(settings).where(eq(settings.id, 1)).limit(1);
  const existing = (current?.extensionsConfig ?? {}) as Record<string, { enabled: boolean }>;
  const updated: Record<string, { enabled: boolean }> = { ...existing, changelog: { enabled: false } };
  await db.update(settings).set({ extensionsConfig: updated, updatedAt: new Date() }).where(eq(settings.id, 1));

  res.json({ success: true });
});

// All data routes — gated behind requireExtension
router.use('/projects', requireExtension, clProjectsRoutes);
router.use('/categories', requireExtension, clCategoriesRoutes);
router.use('/activity', requireExtension, clActivityRoutes);

export default router;
