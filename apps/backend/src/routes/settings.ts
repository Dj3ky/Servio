import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { eq } from 'drizzle-orm';
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
import { createBackup } from '../services/backup';
import { db } from '../db';
import { settings, emailTemplates } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { imageUpload } from '../middleware/upload';
import { encrypt, decrypt } from '../utils/crypto';
import { testSmtpConnection } from '../services/email';
import { createAuditLog } from '../utils/audit';

const router = Router();

router.get('/public', async (_req: Request, res: Response): Promise<void> => {
  const s = await db.query.settings.findFirst();
  res.json({
    appName: s?.appName ?? 'Servio',
    logoUrl: s?.logoUrl ?? null,
    defaultLanguage: s?.defaultLanguage ?? 'sl',
  });
});

router.use(requireAuth);

router.get('/', requireRole('admin', 'manager'), async (_req: Request, res: Response): Promise<void> => {
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
    smbHost: s.smbHost,
    smbShare: s.smbShare,
    smbUsername: s.smbUsername,
    smbBasePath: s.smbBasePath,
    defaultLanguage: s.defaultLanguage,
    backupEnabled: s.backupEnabled,
    backupSchedule: s.backupSchedule,
    backupPath: s.backupPath,
    accountingEmail: s.accountingEmail,
    digestEnabled: s.digestEnabled,
    digestFrequency: s.digestFrequency,
    digestEmail: s.digestEmail,
    escalationEnabled: s.escalationEnabled,
    escalationDays: s.escalationDays,
    updatedAt: s.updatedAt.toISOString(),
  });
});

router.patch('/general', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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

router.patch('/smtp', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateSmtpSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const updates: Partial<typeof settings.$inferInsert> = {
    smtpHost: parsed.data.smtpHost,
    smtpPort: parsed.data.smtpPort,
    smtpUser: parsed.data.smtpUser,
    smtpFrom: parsed.data.smtpFrom,
    smtpSecure: parsed.data.smtpSecure,
    updatedAt: new Date(),
  };

  if (parsed.data.smtpPass) {
    updates.smtpPassEncrypted = encrypt(parsed.data.smtpPass);
  }

  await db.update(settings).set(updates).where(eq(settings.id, 1));
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'smtp' }, req });
  res.json({ success: true });
});

router.post('/smtp/test', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const parsed = testSmtpSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const result = await testSmtpConnection(parsed.data.recipient);
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'test_smtp', payload: { success: result.success }, req });
  res.json(result);
});

router.patch('/smb', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateSmbSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const updates: Partial<typeof settings.$inferInsert> = {
    smbHost: parsed.data.smbHost,
    smbShare: parsed.data.smbShare,
    smbUsername: parsed.data.smbUsername,
    smbBasePath: parsed.data.smbBasePath,
    updatedAt: new Date(),
  };

  if (parsed.data.smbPassword) {
    updates.smbPassEncrypted = encrypt(parsed.data.smbPassword);
  }

  await db.update(settings).set(updates).where(eq(settings.id, 1));
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'smb' }, req });
  res.json({ success: true });
});

router.patch('/backup', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateBackupSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  await db.update(settings).set({ backupEnabled: parsed.data.backupEnabled, backupSchedule: parsed.data.backupSchedule, backupPath: parsed.data.backupPath, updatedAt: new Date() }).where(eq(settings.id, 1));
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'backup' }, req });
  res.json({ success: true });
});

router.patch('/alerts', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
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

router.post('/logo', requireRole('admin'), imageUpload.single('logo'), async (req: Request, res: Response): Promise<void> => {
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

router.post('/templates', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createEmailTemplateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [template] = await db.insert(emailTemplates).values(parsed.data).returning();
  res.status(201).json(template);
});

router.patch('/templates/:id', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateEmailTemplateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(emailTemplates).set({ ...parsed.data, updatedAt: new Date() }).where(eq(emailTemplates.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(updated);
});

router.delete('/templates/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  await db.delete(emailTemplates).where(eq(emailTemplates.id, req.params.id));
  res.json({ success: true });
});

router.post('/backup/create', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const filePath = await createBackup();
    await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create_backup', payload: { filePath }, req });
    res.json({ success: true, filePath });
  } catch (err) {
    res.status(500).json({ error: 'errors.internal', message: err instanceof Error ? err.message : 'Backup failed' });
  }
});

router.get('/backup/list', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
  const s = await db.query.settings.findFirst();
  const backupPath = s?.backupPath ?? './backups';

  try {
    await fs.mkdir(backupPath, { recursive: true });
    const files = await fs.readdir(backupPath);
    const backups = await Promise.all(
      files
        .filter((f) => f.endsWith('.sql'))
        .map(async (filename) => {
          const stat = await fs.stat(path.join(backupPath, filename));
          return { filename, size: stat.size, createdAt: stat.mtime.toISOString() };
        }),
    );
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(backups);
  } catch {
    res.json([]);
  }
});

export default router;
