import { Router, Request, Response } from 'express';
import { eq, ilike, sql, and, or } from 'drizzle-orm';
import { createPmProjectSchema, updatePmProjectSchema, createPmPhaseSchema, updatePmPhaseSchema } from '@servio/shared';
import { db } from '../../../db';
import { pmProjects, pmCustomers, pmFacilities, pmProjectPhases, pmProjectDocuments } from '../schema';
import { users } from '../../../db/schema/users';
import { requireAuth } from '../../../middleware/auth';
import { requireRole } from '../../../middleware/role';
import { documentUpload } from '../../../middleware/upload';
import path from 'path';
import fs from 'fs/promises';

const router = Router();
router.use(requireAuth);

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'pm-documents');

async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

// List projects
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const priority = req.query.priority as string | undefined;
  const employeeId = req.query.employeeId as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) conditions.push(or(ilike(pmProjects.name, `%${search}%`), ilike(pmProjects.projectNumber, `%${search}%`)));
  if (status) conditions.push(eq(pmProjects.status, status));
  if (priority) conditions.push(eq(pmProjects.priority, priority));
  if (employeeId) conditions.push(eq(pmProjects.employeeId, employeeId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const baseSelect = {
    id: pmProjects.id,
    projectNumber: pmProjects.projectNumber,
    name: pmProjects.name,
    orderDate: pmProjects.orderDate,
    priority: pmProjects.priority,
    status: pmProjects.status,
    startDate: pmProjects.startDate,
    endDate: pmProjects.endDate,
    contractValue: pmProjects.contractValue,
    invoicedAmount: pmProjects.invoicedAmount,
    notes: pmProjects.notes,
    createdAt: pmProjects.createdAt,
    updatedAt: pmProjects.updatedAt,
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
    pmCustomerId: pmProjects.pmCustomerId,
    customerName: pmCustomers.name,
    pmFacilityId: pmProjects.pmFacilityId,
    facilityName: pmFacilities.name,
  };

  const [data, [{ count }]] = await Promise.all([
    db.select(baseSelect)
      .from(pmProjects)
      .leftJoin(users, eq(pmProjects.employeeId, users.id))
      .leftJoin(pmCustomers, eq(pmProjects.pmCustomerId, pmCustomers.id))
      .leftJoin(pmFacilities, eq(pmProjects.pmFacilityId, pmFacilities.id))
      .where(where)
      .orderBy(pmProjects.createdAt)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(pmProjects).where(where),
  ]);

  res.json({ data, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

// Get single project with phases + documents
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const [project] = await db.select({
    id: pmProjects.id,
    projectNumber: pmProjects.projectNumber,
    name: pmProjects.name,
    orderDate: pmProjects.orderDate,
    priority: pmProjects.priority,
    status: pmProjects.status,
    startDate: pmProjects.startDate,
    endDate: pmProjects.endDate,
    contractValue: pmProjects.contractValue,
    invoicedAmount: pmProjects.invoicedAmount,
    notes: pmProjects.notes,
    createdAt: pmProjects.createdAt,
    updatedAt: pmProjects.updatedAt,
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
    pmCustomerId: pmProjects.pmCustomerId,
    customerName: pmCustomers.name,
    pmFacilityId: pmProjects.pmFacilityId,
    facilityName: pmFacilities.name,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .leftJoin(pmCustomers, eq(pmProjects.pmCustomerId, pmCustomers.id))
    .leftJoin(pmFacilities, eq(pmProjects.pmFacilityId, pmFacilities.id))
    .where(eq(pmProjects.id, req.params.id))
    .limit(1);

  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const [phases, documents] = await Promise.all([
    db.select().from(pmProjectPhases).where(eq(pmProjectPhases.projectId, req.params.id)).orderBy(pmProjectPhases.orderIndex),
    db.select({
      id: pmProjectDocuments.id,
      projectId: pmProjectDocuments.projectId,
      filename: pmProjectDocuments.filename,
      originalName: pmProjectDocuments.originalName,
      filePath: pmProjectDocuments.filePath,
      fileSize: pmProjectDocuments.fileSize,
      uploadedById: pmProjectDocuments.uploadedById,
      uploaderName: users.name,
      createdAt: pmProjectDocuments.createdAt,
    })
      .from(pmProjectDocuments)
      .leftJoin(users, eq(pmProjectDocuments.uploadedById, users.id))
      .where(eq(pmProjectDocuments.projectId, req.params.id))
      .orderBy(pmProjectDocuments.createdAt),
  ]);

  res.json({ ...project, phases, documents });
});

// Create project
router.post('/', requireRole('records', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createPmProjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [project] = await db.insert(pmProjects).values({
    projectNumber: parsed.data.projectNumber,
    name: parsed.data.name,
    orderDate: parsed.data.orderDate ?? null,
    employeeId: parsed.data.employeeId ?? null,
    pmCustomerId: parsed.data.pmCustomerId ?? null,
    pmFacilityId: parsed.data.pmFacilityId ?? null,
    priority: parsed.data.priority,
    status: parsed.data.status,
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
    contractValue: parsed.data.contractValue ?? null,
    invoicedAmount: parsed.data.invoicedAmount ?? '0',
    notes: parsed.data.notes ?? null,
  }).returning();

  res.status(201).json(project);
});

// Update project
router.patch('/:id', requireRole('records', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmProjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const { invoicedAmount, ...rest } = parsed.data;
  const [updated] = await db.update(pmProjects).set({
    ...rest,
    ...(invoicedAmount != null ? { invoicedAmount } : {}),
    updatedAt: new Date(),
  }).where(eq(pmProjects.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  res.json(updated);
});

// Delete project
router.delete('/:id', requireRole('records', 'delete'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.delete(pmProjects).where(eq(pmProjects.id, req.params.id)).returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
});

// --- Phases ---

router.post('/:id/phases', requireRole('records', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createPmPhaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [phase] = await db.insert(pmProjectPhases).values({
    projectId: req.params.id,
    name: parsed.data.name,
    orderIndex: parsed.data.orderIndex,
    status: parsed.data.status,
  }).returning();

  res.status(201).json(phase);
});

router.patch('/:id/phases/:phaseId', requireRole('records', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmPhaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(pmProjectPhases)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(pmProjectPhases.id, req.params.phaseId), eq(pmProjectPhases.projectId, req.params.id)))
    .returning();

  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(updated);
});

router.delete('/:id/phases/:phaseId', requireRole('records', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.delete(pmProjectPhases)
    .where(and(eq(pmProjectPhases.id, req.params.phaseId), eq(pmProjectPhases.projectId, req.params.id)))
    .returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
});

// --- Documents ---

router.post('/:id/documents', requireRole('records', 'manage'), documentUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'errors.validation' }); return; }

  await ensureUploadsDir();

  const filename = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  await fs.writeFile(filePath, req.file.buffer);

  const [doc] = await db.insert(pmProjectDocuments).values({
    projectId: req.params.id,
    filename,
    originalName: req.file.originalname,
    filePath: `/uploads/pm-documents/${filename}`,
    fileSize: req.file.size,
    uploadedById: req.auth!.userId,
  }).returning();

  res.status(201).json(doc);
});

router.delete('/:id/documents/:docId', requireRole('records', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const [doc] = await db.delete(pmProjectDocuments)
    .where(and(eq(pmProjectDocuments.id, req.params.docId), eq(pmProjectDocuments.projectId, req.params.id)))
    .returning();
  if (!doc) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const filePath = path.join(process.cwd(), 'uploads', 'pm-documents', doc.filename);
  await fs.unlink(filePath).catch(() => {});

  res.json({ success: true });
});

export default router;
