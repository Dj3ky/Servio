import { Router, Request, Response } from 'express';
import { eq, sql, desc, and, or, ilike, inArray } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';
import { createClProjectSchema, updateClProjectSchema, createClEntrySchema, updateClEntrySchema } from '@servio/shared';
import { db } from '../../../db';
import { clProjects, clEntries, clEntryAttachments } from '../schema';
import { users } from '../../../db/schema/users';
import { requireRole } from '../../../middleware/role';
import { changelogAttachmentUpload } from '../../../middleware/upload';
import { getPermissions } from '../../../services/permissionsService';

const router = Router();
router.use(requireRole('changelog', 'access'));

function canManage(role: string) {
  return getPermissions().changelog.manage.includes(role as any);
}

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'changelog-attachments');

async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

async function saveAttachments(entryId: string, files: Express.Multer.File[], uploadedById: string) {
  if (files.length === 0) return;
  await ensureUploadsDir();

  for (const file of files) {
    const filename = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await fs.writeFile(path.join(UPLOADS_DIR, filename), file.buffer);
    await db.insert(clEntryAttachments).values({
      entryId,
      filename,
      originalName: file.originalname,
      filePath: `/uploads/changelog-attachments/${filename}`,
      fileSize: file.size,
      uploadedById,
    });
  }
}

async function attachmentsByEntryId(entryIds: string[]) {
  if (entryIds.length === 0) return new Map<string, any[]>();
  const rows = await db.select({
    id: clEntryAttachments.id,
    entryId: clEntryAttachments.entryId,
    originalName: clEntryAttachments.originalName,
    filePath: clEntryAttachments.filePath,
    fileSize: clEntryAttachments.fileSize,
    uploadedById: clEntryAttachments.uploadedById,
    uploaderName: users.name,
    createdAt: clEntryAttachments.createdAt,
  })
    .from(clEntryAttachments)
    .leftJoin(users, eq(clEntryAttachments.uploadedById, users.id))
    .where(inArray(clEntryAttachments.entryId, entryIds))
    .orderBy(clEntryAttachments.createdAt);

  const map = new Map<string, any[]>();
  for (const row of rows) {
    if (!map.has(row.entryId)) map.set(row.entryId, []);
    map.get(row.entryId)!.push(row);
  }
  return map;
}

// List projects, with entry count + last activity
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const search = req.query.search as string | undefined;
  const conditions = [];
  if (search) conditions.push(or(ilike(clProjects.name, `%${search}%`), ilike(clProjects.description, `%${search}%`)));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const data = await db.select({
    id: clProjects.id,
    name: clProjects.name,
    description: clProjects.description,
    status: clProjects.status,
    nasPath: clProjects.nasPath,
    createdAt: clProjects.createdAt,
    updatedAt: clProjects.updatedAt,
    updatedByName: clProjects.updatedByName,
    entryCount: sql<number>`count(${clEntries.id})`,
    lastActivityAt: sql<string | null>`max(${clEntries.createdAt})`,
  })
    .from(clProjects)
    .leftJoin(clEntries, eq(clEntries.projectId, clProjects.id))
    .where(where)
    .groupBy(clProjects.id)
    .orderBy(desc(clProjects.createdAt));

  res.json(data.map(p => ({ ...p, entryCount: Number(p.entryCount) })));
});

// Create project — anyone with changelog access
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = createClProjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [project] = await db.insert(clProjects).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    nasPath: parsed.data.nasPath ?? null,
    createdById: req.auth!.userId,
  }).returning();

  res.status(201).json(project);
});

// Get single project
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const [project] = await db.select().from(clProjects).where(eq(clProjects.id, req.params.id)).limit(1);
  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(project);
});

// Update project
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = updateClProjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [project] = await db.update(clProjects)
    .set({ ...parsed.data, updatedById: req.auth!.userId, updatedByName: req.auth!.name, updatedAt: new Date() })
    .where(eq(clProjects.id, req.params.id))
    .returning();

  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(project);
});

// List entries for a project
router.get('/:id/entries', async (req: Request, res: Response): Promise<void> => {
  const categoryId = req.query.categoryId as string | undefined;
  const search = req.query.search as string | undefined;
  const conditions = [eq(clEntries.projectId, req.params.id)];
  if (categoryId) conditions.push(eq(clEntries.categoryId, categoryId));
  if (search) conditions.push(ilike(clEntries.note, `%${search}%`));

  const entries = await db.select()
    .from(clEntries)
    .where(and(...conditions))
    .orderBy(desc(clEntries.createdAt));

  const attachmentsMap = await attachmentsByEntryId(entries.map(e => e.id));
  res.json(entries.map(e => ({ ...e, attachments: attachmentsMap.get(e.id) ?? [] })));
});

// Add entry — anyone with changelog access, optionally with small file attachments
router.post('/:id/entries', changelogAttachmentUpload.array('files', 10), async (req: Request, res: Response): Promise<void> => {
  const parsed = createClEntrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [project] = await db.select({ id: clProjects.id }).from(clProjects).where(eq(clProjects.id, req.params.id)).limit(1);
  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const [entry] = await db.insert(clEntries).values({
    projectId: req.params.id,
    categoryId: parsed.data.categoryId ?? null,
    note: parsed.data.note,
    authorId: req.auth!.userId,
    authorName: req.auth!.name,
  }).returning();

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  await saveAttachments(entry.id, files, req.auth!.userId);

  const attachmentsMap = await attachmentsByEntryId([entry.id]);
  res.status(201).json({ ...entry, attachments: attachmentsMap.get(entry.id) ?? [] });
});

// Edit entry — author, or anyone with changelog 'manage' — may also add more attachments
router.patch('/:id/entries/:entryId', changelogAttachmentUpload.array('files', 10), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateClEntrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [existing] = await db.select().from(clEntries).where(eq(clEntries.id, req.params.entryId)).limit(1);
  if (!existing || existing.projectId !== req.params.id) { res.status(404).json({ error: 'errors.not_found' }); return; }
  if (existing.authorId !== req.auth!.userId && !canManage(req.auth!.role)) {
    res.status(403).json({ error: 'errors.forbidden' });
    return;
  }

  const [entry] = await db.update(clEntries)
    .set({ ...parsed.data, editedById: req.auth!.userId, editedByName: req.auth!.name, editedAt: new Date() })
    .where(eq(clEntries.id, req.params.entryId))
    .returning();

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  await saveAttachments(entry.id, files, req.auth!.userId);

  const attachmentsMap = await attachmentsByEntryId([entry.id]);
  res.json({ ...entry, attachments: attachmentsMap.get(entry.id) ?? [] });
});

// Delete entry — author, or anyone with changelog 'manage'
router.delete('/:id/entries/:entryId', async (req: Request, res: Response): Promise<void> => {
  const [existing] = await db.select().from(clEntries).where(eq(clEntries.id, req.params.entryId)).limit(1);
  if (!existing || existing.projectId !== req.params.id) { res.status(404).json({ error: 'errors.not_found' }); return; }
  if (existing.authorId !== req.auth!.userId && !canManage(req.auth!.role)) {
    res.status(403).json({ error: 'errors.forbidden' });
    return;
  }

  const attachments = await db.select().from(clEntryAttachments).where(eq(clEntryAttachments.entryId, req.params.entryId));
  await db.delete(clEntries).where(eq(clEntries.id, req.params.entryId));
  await Promise.all(attachments.map(a => fs.unlink(path.join(UPLOADS_DIR, a.filename)).catch(() => {})));

  res.json({ success: true });
});

// Delete a single attachment — author, or anyone with changelog 'manage'
router.delete('/:id/entries/:entryId/attachments/:attachmentId', async (req: Request, res: Response): Promise<void> => {
  const [entry] = await db.select().from(clEntries).where(eq(clEntries.id, req.params.entryId)).limit(1);
  if (!entry || entry.projectId !== req.params.id) { res.status(404).json({ error: 'errors.not_found' }); return; }
  if (entry.authorId !== req.auth!.userId && !canManage(req.auth!.role)) {
    res.status(403).json({ error: 'errors.forbidden' });
    return;
  }

  const [attachment] = await db.delete(clEntryAttachments)
    .where(and(eq(clEntryAttachments.id, req.params.attachmentId), eq(clEntryAttachments.entryId, req.params.entryId)))
    .returning();
  if (!attachment) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await fs.unlink(path.join(UPLOADS_DIR, attachment.filename)).catch(() => {});
  res.json({ success: true });
});

export default router;
