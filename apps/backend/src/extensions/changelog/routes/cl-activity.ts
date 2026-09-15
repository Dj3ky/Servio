import { Router, Request, Response } from 'express';
import { eq, desc, and, ilike, isNull, inArray } from 'drizzle-orm';
import { db } from '../../../db';
import { clProjects, clEntries, clEntryAttachments } from '../schema';
import { requireRole } from '../../../middleware/role';

const router = Router();
router.use(requireRole('changelog', 'access'));

// Latest entries across every changelog project — a cross-project feed for a quick
// "what happened recently" overview, instead of opening each project one by one.
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const categoryId = req.query.categoryId as string | undefined;
  const search = req.query.search as string | undefined;
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));

  const conditions = [isNull(clEntries.deletedAt)];
  if (categoryId) conditions.push(eq(clEntries.categoryId, categoryId));
  if (search) conditions.push(ilike(clEntries.note, `%${search}%`));

  const entries = await db.select({
    id: clEntries.id,
    projectId: clEntries.projectId,
    projectName: clProjects.name,
    categoryId: clEntries.categoryId,
    note: clEntries.note,
    authorId: clEntries.authorId,
    authorName: clEntries.authorName,
    editedById: clEntries.editedById,
    editedByName: clEntries.editedByName,
    createdAt: clEntries.createdAt,
    editedAt: clEntries.editedAt,
  })
    .from(clEntries)
    .innerJoin(clProjects, eq(clEntries.projectId, clProjects.id))
    .where(and(...conditions))
    .orderBy(desc(clEntries.createdAt))
    .limit(limit);

  if (entries.length === 0) { res.json([]); return; }

  const attachmentRows = await db.select({
    id: clEntryAttachments.id,
    entryId: clEntryAttachments.entryId,
    originalName: clEntryAttachments.originalName,
    filePath: clEntryAttachments.filePath,
    fileSize: clEntryAttachments.fileSize,
    createdAt: clEntryAttachments.createdAt,
  })
    .from(clEntryAttachments)
    .where(inArray(clEntryAttachments.entryId, entries.map(e => e.id)));

  const attachmentsMap = new Map<string, typeof attachmentRows>();
  for (const row of attachmentRows) {
    if (!attachmentsMap.has(row.entryId)) attachmentsMap.set(row.entryId, []);
    attachmentsMap.get(row.entryId)!.push(row);
  }

  res.json(entries.map(e => ({ ...e, attachments: attachmentsMap.get(e.id) ?? [] })));
});

export default router;
