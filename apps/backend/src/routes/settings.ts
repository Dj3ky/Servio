import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { eq } from 'drizzle-orm';
import cron from 'node-cron';

const execFileAsync = promisify(execFile);
import {
  updateGeneralSettingsSchema,
  updateSmtpSettingsSchema,
  updateSmbSettingsSchema,
  updateBackupSettingsSchema,
  updateAlertsSettingsSchema,
  testSmtpSchema,
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  userRoleSchema,
  permissions as defaultPermissions,
  type UserRole,
} from '@servio/shared';
import { createBackup, rescheduleBackup } from '../services/backup';
import { db } from '../db';
import { settings, emailTemplates } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { imageUpload, sqlUpload } from '../middleware/upload';
import { encrypt, decrypt } from '../utils/crypto';
import { testSmtpConnection, sendDigestEmail } from '../services/email';
import { createAuditLog, diffRecords } from '../utils/audit';
import { getPermissions, loadPermissions } from '../services/permissionsService';
import { loadUserAccess } from '../services/userAccessService';
import { broadcast } from '../ws';

const router = Router();

// Saves one settings section and logs exactly which of its fields changed
async function updateSettingsAudited(req: Request, section: string, updates: Partial<typeof settings.$inferInsert>): Promise<void> {
  const [before] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  const [after] = await db.update(settings).set(updates).where(eq(settings.id, 1)).returning();
  await createAuditLog({
    userId: req.auth!.userId,
    userEmail: req.auth!.email,
    action: 'update',
    entityType: 'settings',
    payload: { section, changes: diffRecords(before, after ?? updates, Object.keys(updates)) },
    req,
  });
}

// Short-lived one-time tokens for PWA/browser-navigation downloads (30s TTL)
const downloadTokens = new Map<string, { filename: string; expires: number }>();

router.get('/public', async (_req: Request, res: Response): Promise<void> => {
  const s = await db.query.settings.findFirst();
  const extCfg = (s?.extensionsConfig ?? {}) as Record<string, { enabled: boolean }>;
  const { isExtensionLicensed } = await import('../middleware/license');
  const projectsLicensed = isExtensionLicensed('projects_extension');
  const changelogLicensed = isExtensionLicensed('changelog_extension');
  res.json({
    appName: s?.appName ?? 'Servio',
    logoUrl: s?.logoUrl ?? null,
    defaultLanguage: s?.defaultLanguage ?? 'sl',
    extensions: {
      projects: {
        licensed: projectsLicensed,
        enabled: projectsLicensed && extCfg?.projects?.enabled === true,
      },
      changelog: {
        licensed: changelogLicensed,
        enabled: changelogLicensed && extCfg?.changelog?.enabled === true,
      },
    },
  });
});

// Token-authenticated download — no Bearer header needed, secured by one-time token.
// Must be registered BEFORE router.use(requireAuth) so browser navigations work.
router.get('/backup/file/:filename', async (req: Request, res: Response): Promise<void> => {
  const { filename } = req.params;
  const { token } = req.query as { token?: string };

  if ((!filename.endsWith('.sql') && !filename.endsWith('.tar.gz')) || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }

  if (!token) { res.status(401).json({ error: 'errors.unauthorized' }); return; }

  const entry = downloadTokens.get(token);
  downloadTokens.delete(token);
  if (!entry || entry.filename !== filename || entry.expires < Date.now()) {
    res.status(401).json({ error: 'errors.unauthorized' });
    return;
  }

  const s = await db.query.settings.findFirst();
  const backupPath = path.resolve(s?.backupPath ?? './backups');
  const filePath = path.join(backupPath, filename);

  try {
    await fs.access(filePath);
    res.download(filePath, filename);
  } catch {
    res.status(404).json({ error: 'errors.not_found' });
  }
});

router.use(requireAuth);

router.get('/', requireRole('settings', 'view'), async (_req: Request, res: Response): Promise<void> => {
  const s = await db.query.settings.findFirst();
  if (!s) { res.status(404).json({ error: 'errors.not_found' }); return; }

  res.json({
    appName: s.appName,
    logoUrl: s.logoUrl,
    smtpHost: s.smtpHost,
    smtpPort: s.smtpPort,
    smtpUser: s.smtpUser,
    smtpFrom: s.smtpFrom,
    smtpSecure: s.smtpSecure,
    imapPort: s.imapPort,
    smtpPassSet: !!s.smtpPassEncrypted,
    smbHost: s.smbHost,
    smbShare: s.smbShare,
    smbUsername: s.smbUsername,
    smbBasePath: s.smbBasePath,
    smbPathTemplate: s.smbPathTemplate,
    smbPassSet: !!s.smbPassEncrypted,
    defaultLanguage: s.defaultLanguage,
    backupEnabled: s.backupEnabled,
    backupSchedule: s.backupSchedule,
    backupPath: s.backupPath,
    backupToNas: s.backupToNas,
    backupNasPath: s.backupNasPath,
    backupKeepRecent: s.backupKeepRecent,
    backupKeepMonthly: s.backupKeepMonthly,
    auditLogRetentionMonths: s.auditLogRetentionMonths,
    accountingEmail: s.accountingEmail,
    digestEnabled: s.digestEnabled,
    digestFrequency: s.digestFrequency,
    digestEmail: s.digestEmail,
    escalationEnabled: s.escalationEnabled,
    escalationDays: s.escalationDays,
    updatedAt: s.updatedAt.toISOString(),
  });
});

router.patch('/general', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateGeneralSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  await updateSettingsAudited(req, 'general', {
    appName: parsed.data.appName,
    defaultLanguage: parsed.data.defaultLanguage,
    accountingEmail: parsed.data.accountingEmail || null,
    updatedAt: new Date(),
  });
  res.json({ success: true });
});

router.patch('/smtp', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateSmtpSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const updates: Partial<typeof settings.$inferInsert> = {
    smtpHost: parsed.data.smtpHost,
    smtpPort: parsed.data.smtpPort,
    smtpUser: parsed.data.smtpUser,
    smtpFrom: parsed.data.smtpFrom,
    smtpSecure: parsed.data.smtpSecure,
    imapPort: parsed.data.imapPort ?? null,
    updatedAt: new Date(),
  };

  if (parsed.data.smtpPass) {
    updates.smtpPassEncrypted = encrypt(parsed.data.smtpPass);
  }

  await updateSettingsAudited(req, 'smtp', updates);
  res.json({ success: true });
});

// Turns email off: without host, user and password the email and inbox services treat SMTP as not configured.
// Port and SSL are kept so setting it up again starts from the same values.
router.delete('/smtp', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  await updateSettingsAudited(req, 'smtp', {
    smtpHost: null,
    smtpUser: null,
    smtpPassEncrypted: null,
    smtpFrom: null,
    imapPort: null,
    updatedAt: new Date(),
  });
  res.json({ success: true });
});

router.post('/smtp/test', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = testSmtpSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const result = await testSmtpConnection(parsed.data.recipient);
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'test_smtp', payload: { success: result.success }, req });
  res.json(result);
});

router.patch('/smb', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateSmbSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const updates: Partial<typeof settings.$inferInsert> = {
    smbHost: parsed.data.smbHost,
    smbShare: parsed.data.smbShare,
    smbUsername: parsed.data.smbUsername,
    smbBasePath: parsed.data.smbBasePath,
    smbPathTemplate: parsed.data.smbPathTemplate,
    updatedAt: new Date(),
  };

  if (parsed.data.smbPassword) {
    updates.smbPassEncrypted = encrypt(parsed.data.smbPassword);
  }

  await updateSettingsAudited(req, 'smb', updates);
  res.json({ success: true });
});

// Turns the NAS connection off. Base path and path template are kept for a later setup.
// NAS backups are switched off too, since every one of them would now fail.
router.delete('/smb', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  await updateSettingsAudited(req, 'smb', {
    smbHost: null,
    smbShare: null,
    smbUsername: null,
    smbPassEncrypted: null,
    backupToNas: false,
    updatedAt: new Date(),
  });
  res.json({ success: true });
});

router.patch('/backup', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateBackupSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }
  // An invalid expression would otherwise save fine and backups would silently never run
  if (!cron.validate(parsed.data.backupSchedule)) { res.status(400).json({ error: 'errors.invalid_cron' }); return; }

  await updateSettingsAudited(req, 'backup', { backupEnabled: parsed.data.backupEnabled, backupSchedule: parsed.data.backupSchedule, backupPath: parsed.data.backupPath, backupToNas: parsed.data.backupToNas, backupNasPath: parsed.data.backupNasPath || null, backupKeepRecent: parsed.data.backupKeepRecent, backupKeepMonthly: parsed.data.backupKeepMonthly, auditLogRetentionMonths: parsed.data.auditLogRetentionMonths, updatedAt: new Date() });
  rescheduleBackup().catch(console.error);
  res.json({ success: true });
});

router.patch('/alerts', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateAlertsSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  await updateSettingsAudited(req, 'alerts', {
    digestEnabled: parsed.data.digestEnabled,
    digestFrequency: parsed.data.digestFrequency,
    digestEmail: parsed.data.digestEmail || null,
    escalationEnabled: parsed.data.escalationEnabled,
    escalationDays: parsed.data.escalationDays,
    updatedAt: new Date(),
  });
  res.json({ success: true });
});

// Sends the digest right now to the saved recipient, regardless of the on/off switch or schedule
router.post('/alerts/test-digest', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const recipient = await sendDigestEmail({ test: true });
    await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'test_digest', payload: { recipient }, req });
    res.json({ success: true, recipient });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'errors.digest_no_recipient') { res.status(400).json({ error: message }); return; }
    res.json({ success: false, error: message });
  }
});

router.post('/logo', requireRole('settings', 'manage'), imageUpload.single('logo'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'errors.file_required' }); return; }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  // Extension from the actual bytes, not the uploaded name — "x.svg" holding a PNG must not be served as SVG
  const buf = req.file.buffer;
  const isPng = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!isPng && !isJpeg) { res.status(400).json({ error: 'errors.logo_format' }); return; }
  const filename = isPng ? 'logo.png' : 'logo.jpg';
  await removeLogoFiles(uploadsDir, filename);
  await fs.writeFile(path.join(uploadsDir, filename), req.file.buffer);

  // The file name never changes, so the version query makes browsers fetch the new image
  const logoUrl = `/uploads/${filename}?v=${Date.now()}`;
  await updateSettingsAudited(req, 'logo', { logoUrl, updatedAt: new Date() });
  res.json({ logoUrl });
});

router.delete('/logo', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  await removeLogoFiles(path.join(process.cwd(), 'uploads'));
  await updateSettingsAudited(req, 'logo', { logoUrl: null, updatedAt: new Date() });
  res.json({ success: true });
});

// Deletes uploads/logo.* (except `keep`), so a logo replaced by another format doesn't linger
async function removeLogoFiles(uploadsDir: string, keep?: string): Promise<void> {
  const files = await fs.readdir(uploadsDir).catch(() => [] as string[]);
  await Promise.all(files
    .filter((f) => /^logo\.[a-z0-9]+$/i.test(f) && f !== keep)
    .map((f) => fs.unlink(path.join(uploadsDir, f)).catch(() => {})));
}

// Readable by every signed-in user on purpose: the review upload, invoice email and
// send-to-accounting dialogs pick a template from this list. Changing templates is permission-checked.
router.get('/templates', async (_req: Request, res: Response): Promise<void> => {
  const templates = await db.query.emailTemplates.findMany({ orderBy: (t, { asc }) => [asc(t.name)] });
  res.json(templates);
});

router.post('/templates', requireRole('settings', 'manageTemplates'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createEmailTemplateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [template] = await db.insert(emailTemplates).values(parsed.data).returning();
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'email_template', entityId: template.id, payload: { name: template.name, language: template.language, templateType: template.templateType }, req });
  res.status(201).json(template);
});

router.patch('/templates/:id', requireRole('settings', 'manageTemplates'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateEmailTemplateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [before] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, req.params.id)).limit(1);
  if (!before) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const [updated] = await db.update(emailTemplates).set({ ...parsed.data, updatedAt: new Date() }).where(eq(emailTemplates.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'email_template', entityId: updated.id, payload: { name: updated.name, changes: diffRecords(before, updated, Object.keys(parsed.data)) }, req });
  res.json(updated);
});

router.delete('/templates/:id', requireRole('settings', 'deleteTemplates'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.delete(emailTemplates).where(eq(emailTemplates.id, req.params.id)).returning();
  if (deleted) {
    await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'delete', entityType: 'email_template', entityId: deleted.id, payload: { name: deleted.name, language: deleted.language, templateType: deleted.templateType }, req });
  }
  res.json({ success: true });
});

router.post('/backup/create', requireRole('settings', 'backup'), async (req: Request, res: Response): Promise<void> => {
  try {
    const filePath = await createBackup();
    await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create_backup', payload: { filePath }, req });
    res.json({ success: true, filePath });
  } catch (err) {
    res.status(500).json({ error: 'errors.internal', message: err instanceof Error ? err.message : 'Backup failed' });
  }
});

router.get('/backup/list', requireRole('settings', 'backup'), async (_req: Request, res: Response): Promise<void> => {
  const s = await db.query.settings.findFirst();
  const backupPath = path.resolve(s?.backupPath ?? './backups');

  try {
    await fs.mkdir(backupPath, { recursive: true });
    const files = await fs.readdir(backupPath);
    const backups = await Promise.all(
      files
        .filter((f) => f.endsWith('.sql') || f.endsWith('.tar.gz'))
        .map(async (filename) => {
          const stat = await fs.stat(path.join(backupPath, filename));
          // Parse timestamp from filename (backup_YYYY-MM-DD_HH-mm-ss.*) so the
          // displayed time always matches the name, regardless of server timezone.
          const m = filename.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
          const createdAt = m
            ? new Date(Number(m[1].slice(0,4)), Number(m[1].slice(5,7))-1, Number(m[1].slice(8,10)), Number(m[2]), Number(m[3]), Number(m[4])).toISOString()
            : stat.mtime.toISOString();
          return { filename, size: stat.size, createdAt };
        }),
    );
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(backups);
  } catch {
    res.json([]);
  }
});

router.get('/backup/download/:filename', requireRole('settings', 'backup'), async (req: Request, res: Response): Promise<void> => {
  const { filename } = req.params;
  if ((!filename.endsWith('.sql') && !filename.endsWith('.tar.gz')) || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }

  const s = await db.query.settings.findFirst();
  const backupPath = path.resolve(s?.backupPath ?? './backups');
  const filePath = path.join(backupPath, filename);

  try {
    await fs.access(filePath);
    res.download(filePath, filename);
  } catch {
    res.status(404).json({ error: 'errors.not_found' });
  }
});

// Issues a one-time 30-second token so PWA can open the download via window.open()
router.post('/backup/download-token/:filename', requireRole('settings', 'backup'), (req: Request, res: Response): void => {
  const { filename } = req.params;
  if ((!filename.endsWith('.sql') && !filename.endsWith('.tar.gz')) || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }
  const token = crypto.randomUUID();
  downloadTokens.set(token, { filename, expires: Date.now() + 30_000 });
  res.json({ token });
});

router.delete('/backup/:filename', requireRole('settings', 'backup'), async (req: Request, res: Response): Promise<void> => {
  const { filename } = req.params;
  if ((!filename.endsWith('.sql') && !filename.endsWith('.tar.gz')) || filename.includes('/') || filename.includes('..')) {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }
  const s = await db.query.settings.findFirst();
  const backupPath = path.resolve(s?.backupPath ?? './backups');
  const filePath = path.join(backupPath, filename);
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch {
    res.status(404).json({ error: 'errors.not_found' });
  }
});

router.post('/backup/restore', requireRole('settings', 'backup'), sqlUpload.single('backup'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'errors.file_required' }); return; }
  await handleRestore(req, res, req.file.buffer, req.file.originalname);
});

// Restores a backup that is already in the backup folder, without downloading and re-uploading it
router.post('/backup/restore/:filename', requireRole('settings', 'backup'), async (req: Request, res: Response): Promise<void> => {
  const { filename } = req.params;
  if ((!filename.endsWith('.sql') && !filename.endsWith('.tar.gz')) || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }
  const s = await db.query.settings.findFirst();
  const filePath = path.join(path.resolve(s?.backupPath ?? './backups'), filename);
  // Read it now: the safety backup taken next applies the retention policy, which could delete this file
  const buf = await fs.readFile(filePath).catch(() => null);
  if (!buf) { res.status(404).json({ error: 'errors.not_found' }); return; }
  await handleRestore(req, res, buf, filename);
});

// Shared by both restore routes: validate, take a safety backup of the current data, then restore
async function handleRestore(req: Request, res: Response, buf: Buffer, filename: string): Promise<void> {
  if (!looksLikeBackup(buf, filename)) { res.status(400).json({ error: 'errors.validation' }); return; }

  // Restoring overwrites everything, so first save what is there now. If this fails, nothing is touched.
  let safetyBackup: string;
  try {
    safetyBackup = path.basename(await createBackup());
  } catch (err) {
    res.status(500).json({ error: 'errors.restore_safety_backup_failed', message: err instanceof Error ? err.message : String(err) });
    return;
  }

  try {
    await restoreBackup(buf, filename);
  } catch (err) {
    res.status(500).json({ error: 'errors.restore_failed', safetyBackup, message: err instanceof Error ? err.message : 'Restore failed' });
    return;
  }

  // The restore replaced the tables behind these in-memory copies and the backup schedule
  await loadPermissions();
  await loadUserAccess();
  rescheduleBackup().catch(console.error);

  // No userId: the restoring user may not exist in the restored data, and the entry would be rejected
  await createAuditLog({ userEmail: req.auth!.email, action: 'restore_backup', payload: { filename, safetyBackup }, req });
  res.json({ success: true, safetyBackup });
}

// Checks the file's magic bytes match its claimed type
function looksLikeBackup(buf: Buffer, filename: string): boolean {
  if (filename.endsWith('.tar.gz')) return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  // Plain SQL must be text — null bytes indicate binary content
  return !buf.includes(0x00);
}

// Drops every table, sequence and enum type, whatever features or extensions created them,
// so backups made before --clean was used (or before a table existed) restore without clashes.
const RESTORE_CLEANUP_SQL = `
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.sequencename);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END $$;
`;
// The drizzle schema (migration history) is left alone on purpose: dumps made with --clean
// replace it themselves, and wiping it for an older dump would make startup re-run every migration.

async function restoreBackup(buf: Buffer, filename: string): Promise<void> {
  const tmpDir = path.join(os.tmpdir(), `servio-restore-${Date.now()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });

    let sqlFilePath: string;
    let extractedUploads: string | null = null;

    if (filename.endsWith('.tar.gz')) {
      // Bundled backup — extract and locate the SQL file
      const tarPath = path.join(tmpDir, 'backup.tar.gz');
      await fs.writeFile(tarPath, buf);
      await execFileAsync('tar', ['-xzf', tarPath, '-C', tmpDir]);

      const sqlEntry = (await fs.readdir(tmpDir)).find((f) => f.endsWith('.sql'));
      if (!sqlEntry) throw new Error('The archive contains no .sql file');
      sqlFilePath = path.join(tmpDir, sqlEntry);
      extractedUploads = path.join(tmpDir, 'uploads');
    } else {
      // Legacy plain SQL upload
      sqlFilePath = path.join(tmpDir, 'restore.sql');
      await fs.writeFile(sqlFilePath, buf);
    }

    const dbUrl = new URL(process.env.DATABASE_URL!);
    const env = { ...process.env, PGPASSWORD: dbUrl.password };
    // -q keeps psql from echoing every statement; a big dump would otherwise overflow the output buffer
    const psqlBase = ['-q', '-h', dbUrl.hostname, '-p', dbUrl.port || '5432', '-U', dbUrl.username, '-d', dbUrl.pathname.slice(1)];
    const opts = { env, maxBuffer: 64 * 1024 * 1024 };

    const cleanupFile = path.join(tmpDir, 'cleanup.sql');
    await fs.writeFile(cleanupFile, RESTORE_CLEANUP_SQL);
    await execFileAsync('psql', [...psqlBase, '-v', 'ON_ERROR_STOP=1', '-f', cleanupFile], opts);
    await execFileAsync('psql', [...psqlBase, '-f', sqlFilePath], opts);

    // Restore uploaded files (logo, documents, attachments) if the bundle has them
    if (extractedUploads) {
      try {
        await fs.access(extractedUploads);
        const uploadsTarget = path.resolve('./uploads');
        await fs.mkdir(uploadsTarget, { recursive: true });
        await fs.cp(extractedUploads, uploadsTarget, { recursive: true, force: true });
      } catch {
        // no uploads in bundle — DB-only restore
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

router.post('/backup/restart', requireRole('settings', 'backup'), async (req: Request, res: Response): Promise<void> => {
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'restart_services', payload: {}, req });
  res.json({ success: true });
  // Delay restart so the response is delivered first
  setTimeout(() => {
    execFile('pm2', ['reload', 'servio-backend'], (err) => {
      if (err) console.error('[restart] pm2 reload failed:', err.message);
    });
  }, 500);
});

// { section: { action: roles[] } } → { 'section.action': sortedRoles[] }, so each permission diffs on its own
function flattenPermissions(map: unknown): Record<string, string[]> {
  const flat: Record<string, string[]> = {};
  for (const [section, actions] of Object.entries((map ?? {}) as Record<string, Record<string, string[]>>)) {
    for (const [action, roles] of Object.entries(actions ?? {})) {
      flat[`${section}.${action}`] = Array.isArray(roles) ? [...roles].sort() : [];
    }
  }
  return flat;
}

// Every role reads this — the frontend decides what to show from it
router.get('/permissions', (_req: Request, res: Response): void => {
  res.json(getPermissions());
});

// Keeps only known sections, actions and roles, and always grants admin: the permission check
// has no admin bypass, so a config without admin would lock every admin out of Settings for good.
// Returns null when the body isn't a { section: { action: roles[] } } object at all.
function sanitizePermissions(body: unknown): Record<string, Record<string, UserRole[]>> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const known = defaultPermissions as Record<string, Record<string, UserRole[]>>;
  const out: Record<string, Record<string, UserRole[]>> = {};
  for (const [section, actions] of Object.entries(body as Record<string, unknown>)) {
    if (!known[section] || typeof actions !== 'object' || actions === null || Array.isArray(actions)) continue;
    for (const [action, roles] of Object.entries(actions as Record<string, unknown>)) {
      if (!known[section][action] || !Array.isArray(roles)) continue;
      const valid = roles.filter((r): r is UserRole => userRoleSchema.safeParse(r).success);
      out[section] = { ...out[section], [action]: Array.from(new Set<UserRole>(['admin', ...valid])) };
    }
  }
  return out;
}

router.patch('/permissions', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const config = sanitizePermissions(req.body);
  if (!config) {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }
  const before = flattenPermissions(getPermissions());
  await db.update(settings).set({ permissionsConfig: config });
  await loadPermissions();
  const after = flattenPermissions(getPermissions());
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'permissions', payload: { changes: diffRecords(before, after, new Set([...Object.keys(before), ...Object.keys(after)])) }, req });
  broadcast('permissions_updated', {});
  res.json({ success: true });
});

router.delete('/permissions', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const before = flattenPermissions(getPermissions());
  await db.update(settings).set({ permissionsConfig: null });
  await loadPermissions();
  const after = flattenPermissions(getPermissions());
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'permissions', payload: { reset: true, changes: diffRecords(before, after, new Set([...Object.keys(before), ...Object.keys(after)])) }, req });
  broadcast('permissions_updated', {});
  res.json({ success: true });
});

export default router;
