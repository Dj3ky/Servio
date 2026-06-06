import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { eq } from 'drizzle-orm';

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
} from '@servio/shared';
import { createBackup, rescheduleBackup } from '../services/backup';
import { db } from '../db';
import { settings, emailTemplates } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { imageUpload, sqlUpload } from '../middleware/upload';
import { encrypt, decrypt } from '../utils/crypto';
import { testSmtpConnection } from '../services/email';
import { createAuditLog } from '../utils/audit';
import { getPermissions, loadPermissions } from '../services/permissionsService';

const router = Router();

// Short-lived one-time tokens for PWA/browser-navigation downloads (30s TTL)
const downloadTokens = new Map<string, { filename: string; expires: number }>();

router.get('/public', async (_req: Request, res: Response): Promise<void> => {
  const s = await db.query.settings.findFirst();
  const extCfg = (s?.extensionsConfig ?? {}) as Record<string, { enabled: boolean }>;
  const { isExtensionLicensed } = await import('../middleware/license');
  const projectsLicensed = isExtensionLicensed('projects_extension');
  res.json({
    appName: s?.appName ?? 'Servio',
    logoUrl: s?.logoUrl ?? null,
    defaultLanguage: s?.defaultLanguage ?? 'sl',
    extensions: {
      projects: {
        licensed: projectsLicensed,
        enabled: projectsLicensed && extCfg?.projects?.enabled === true,
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

  await db.update(settings).set({
    appName: parsed.data.appName,
    defaultLanguage: parsed.data.defaultLanguage,
    accountingEmail: parsed.data.accountingEmail || null,
    updatedAt: new Date(),
  }).where(eq(settings.id, 1));
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'general' }, req });
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

  await db.update(settings).set(updates).where(eq(settings.id, 1));
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'smtp' }, req });
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

  await db.update(settings).set(updates).where(eq(settings.id, 1));
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'smb' }, req });
  res.json({ success: true });
});

router.patch('/backup', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateBackupSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  await db.update(settings).set({ backupEnabled: parsed.data.backupEnabled, backupSchedule: parsed.data.backupSchedule, backupPath: parsed.data.backupPath, backupToNas: parsed.data.backupToNas, backupNasPath: parsed.data.backupNasPath || null, updatedAt: new Date() }).where(eq(settings.id, 1));
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'backup' }, req });
  rescheduleBackup().catch(console.error);
  res.json({ success: true });
});

router.patch('/alerts', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateAlertsSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  await db.update(settings).set({
    digestEnabled: parsed.data.digestEnabled,
    digestFrequency: parsed.data.digestFrequency,
    digestEmail: parsed.data.digestEmail || null,
    escalationEnabled: parsed.data.escalationEnabled,
    escalationDays: parsed.data.escalationDays,
    updatedAt: new Date(),
  }).where(eq(settings.id, 1));
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'alerts' }, req });
  res.json({ success: true });
});

router.post('/logo', requireRole('settings', 'manage'), imageUpload.single('logo'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'errors.file_required' }); return; }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  const ext = path.extname(req.file.originalname) || '.png';
  const filename = `logo${ext}`;
  const filePath = path.join(uploadsDir, filename);
  await fs.writeFile(filePath, req.file.buffer);

  const logoUrl = `/uploads/${filename}`;
  await db.update(settings).set({ logoUrl, updatedAt: new Date() }).where(eq(settings.id, 1));
  res.json({ logoUrl });
});

router.get('/templates', async (_req: Request, res: Response): Promise<void> => {
  const templates = await db.query.emailTemplates.findMany({ orderBy: (t, { asc }) => [asc(t.name)] });
  res.json(templates);
});

router.post('/templates', requireRole('settings', 'manageTemplates'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createEmailTemplateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [template] = await db.insert(emailTemplates).values(parsed.data).returning();
  res.status(201).json(template);
});

router.patch('/templates/:id', requireRole('settings', 'manageTemplates'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateEmailTemplateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(emailTemplates).set({ ...parsed.data, updatedAt: new Date() }).where(eq(emailTemplates.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(updated);
});

router.delete('/templates/:id', requireRole('settings', 'deleteTemplates'), async (req: Request, res: Response): Promise<void> => {
  await db.delete(emailTemplates).where(eq(emailTemplates.id, req.params.id));
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

  // Validate file magic bytes — reject anything that doesn't match its claimed type
  const buf = req.file.buffer;
  if (req.file.originalname.endsWith('.tar.gz')) {
    if (buf.length < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) {
      res.status(400).json({ error: 'errors.validation' });
      return;
    }
  } else {
    // Plain SQL must be text — null bytes indicate binary content
    if (buf.includes(0x00)) {
      res.status(400).json({ error: 'errors.validation' });
      return;
    }
  }

  const tmpDir = path.join(os.tmpdir(), `servio-restore-${Date.now()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });

    let sqlFilePath: string;

    if (req.file.originalname.endsWith('.tar.gz')) {
      // Bundled backup — extract, locate the SQL file, optionally restore uploads
      const tarPath = path.join(tmpDir, 'backup.tar.gz');
      await fs.writeFile(tarPath, req.file.buffer);
      await execFileAsync('tar', ['-xzf', tarPath, '-C', tmpDir]);

      const entries = await fs.readdir(tmpDir);
      const sqlEntry = entries.find((f) => f.endsWith('.sql'));
      if (!sqlEntry) { res.status(400).json({ error: 'errors.validation' }); return; }
      sqlFilePath = path.join(tmpDir, sqlEntry);

      // Restore uploads directory if it was included in the bundle
      const extractedUploads = path.join(tmpDir, 'uploads');
      try {
        await fs.access(extractedUploads);
        const uploadsTarget = path.resolve('./uploads');
        await fs.mkdir(uploadsTarget, { recursive: true });
        await fs.cp(extractedUploads, uploadsTarget, { recursive: true, force: true });
      } catch {
        // no uploads in bundle — DB-only restore
      }
    } else {
      // Legacy plain SQL upload
      sqlFilePath = path.join(tmpDir, 'restore.sql');
      await fs.writeFile(sqlFilePath, req.file.buffer);
    }

    const dbUrl = new URL(process.env.DATABASE_URL!);
    const host = dbUrl.hostname;
    const port = dbUrl.port || '5432';
    const database = dbUrl.pathname.slice(1);
    const username = dbUrl.username;
    const env = { ...process.env, PGPASSWORD: dbUrl.password };
    const psqlBase = ['-h', host, '-p', port, '-U', username, '-d', database];

    // Wipe the existing schema so the backup restores cleanly whether it was
    // created with --clean (new format) or without (old format).
    const cleanupSql = [
      'DROP TABLE IF EXISTS reviews CASCADE',
      'DROP TABLE IF EXISTS invoices CASCADE',
      'DROP TABLE IF EXISTS audit_logs CASCADE',
      'DROP TABLE IF EXISTS notifications CASCADE',
      'DROP TABLE IF EXISTS contracts CASCADE',
      'DROP TABLE IF EXISTS email_templates CASCADE',
      'DROP TABLE IF EXISTS facilities CASCADE',
      'DROP TABLE IF EXISTS customers CASCADE',
      'DROP TABLE IF EXISTS settings CASCADE',
      'DROP TABLE IF EXISTS users CASCADE',
      'DROP TABLE IF EXISTS __drizzle_migrations CASCADE',
      'DROP TYPE IF EXISTS user_role CASCADE',
      'DROP TYPE IF EXISTS review_frequency CASCADE',
      'DROP TYPE IF EXISTS invoice_delivery CASCADE',
      'DROP TYPE IF EXISTS review_status CASCADE',
      'DROP TYPE IF EXISTS invoice_status CASCADE',
      'DROP TYPE IF EXISTS notification_type CASCADE',
      'DROP TYPE IF EXISTS notification_type_new CASCADE',
    ].map((s) => `${s};`).join('\n');

    const cleanupFile = path.join(tmpDir, 'cleanup.sql');
    await fs.writeFile(cleanupFile, cleanupSql);
    await execFileAsync('psql', [...psqlBase, '-f', cleanupFile], { env });

    await execFileAsync('psql', [...psqlBase, '-f', sqlFilePath], { env });

    await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'restore_backup', payload: { filename: req.file.originalname }, req });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'errors.internal', message: err instanceof Error ? err.message : 'Restore failed' });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

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

router.get('/permissions', requireRole('settings', 'view'), (_req: Request, res: Response): void => {
  res.json(getPermissions());
});

router.patch('/permissions', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const config = req.body as Record<string, Record<string, string[]>>;
  if (typeof config !== 'object' || config === null) {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }
  await db.update(settings).set({ permissionsConfig: config });
  await loadPermissions();
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'permissions', payload: config, req });
  res.json({ success: true });
});

router.delete('/permissions', requireRole('settings', 'manage'), async (req: Request, res: Response): Promise<void> => {
  await db.update(settings).set({ permissionsConfig: null });
  await loadPermissions();
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'permissions', payload: { reset: true }, req });
  res.json({ success: true });
});

export default router;
