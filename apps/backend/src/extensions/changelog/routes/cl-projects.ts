import { Router, Request, Response } from 'express';
import { eq, sql, desc, and } from 'drizzle-orm';
import { createClProjectSchema, updateClProjectSchema, createClEntrySchema, updateClEntrySchema } from '@servio/shared';
import { db } from '../../../db';
import { clProjects, clEntries } from '../schema';
import { requireAuth } from '../../../middleware/auth';

const router = Router();
router.use(requireAuth);

// List projects, with entry count + last activity
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const data = await db.select({
    id: clProjects.id,
    name: clProjects.name,
    description: clProjects.description,
    status: clProjects.status,
    createdAt: clProjects.createdAt,
    updatedAt: clProjects.updatedAt,
    entryCount: sql<number>`count(${clEntries.id})`,
    lastActivityAt: sql<string | null>`max(${clEntries.createdAt})`,
  })
    .from(clProjects)
    .leftJoin(clEntries, eq(clEntries.projectId, clProjects.id))
    .groupBy(clProjects.id)
    .orderBy(desc(clProjects.createdAt));

  res.json(data.map(p => ({ ...p, entryCount: Number(p.entryCount) })));
});

// Create project — any authenticated user
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = createClProjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [project] = await db.insert(clProjects).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
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
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(clProjects.id, req.params.id))
    .returning();

  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(project);
});

// List entries for a project
router.get('/:id/entries', async (req: Request, res: Response): Promise<void> => {
  const category = req.query.category as string | undefined;
  const conditions = [eq(clEntries.projectId, req.params.id)];
  if (category) conditions.push(eq(clEntries.category, category));

  const entries = await db.select()
    .from(clEntries)
    .where(and(...conditions))
    .orderBy(desc(clEntries.createdAt));

  res.json(entries);
});

// Add entry — any authenticated user
router.post('/:id/entries', async (req: Request, res: Response): Promise<void> => {
  const parsed = createClEntrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [project] = await db.select({ id: clProjects.id }).from(clProjects).where(eq(clProjects.id, req.params.id)).limit(1);
  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const [entry] = await db.insert(clEntries).values({
    projectId: req.params.id,
    category: parsed.data.category,
    note: parsed.data.note,
    authorId: req.auth!.userId,
    authorName: req.auth!.name,
  }).returning();

  res.status(201).json(entry);
});

// Edit entry — author or admin only
router.patch('/:id/entries/:entryId', async (req: Request, res: Response): Promise<void> => {
  const parsed = updateClEntrySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [existing] = await db.select().from(clEntries).where(eq(clEntries.id, req.params.entryId)).limit(1);
  if (!existing || existing.projectId !== req.params.id) { res.status(404).json({ error: 'errors.not_found' }); return; }
  if (existing.authorId !== req.auth!.userId && req.auth!.role !== 'admin') {
    res.status(403).json({ error: 'errors.forbidden' });
    return;
  }

  const [entry] = await db.update(clEntries)
    .set({ ...parsed.data, editedAt: new Date() })
    .where(eq(clEntries.id, req.params.entryId))
    .returning();

  res.json(entry);
});

// Delete entry — author or admin only
router.delete('/:id/entries/:entryId', async (req: Request, res: Response): Promise<void> => {
  const [existing] = await db.select().from(clEntries).where(eq(clEntries.id, req.params.entryId)).limit(1);
  if (!existing || existing.projectId !== req.params.id) { res.status(404).json({ error: 'errors.not_found' }); return; }
  if (existing.authorId !== req.auth!.userId && req.auth!.role !== 'admin') {
    res.status(403).json({ error: 'errors.forbidden' });
    return;
  }

  await db.delete(clEntries).where(eq(clEntries.id, req.params.entryId));
  res.json({ success: true });
});

export default router;
