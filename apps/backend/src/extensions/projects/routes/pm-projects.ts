import { Router, Request, Response } from 'express';
import { eq, ne, ilike, sql, and, or, desc, inArray } from 'drizzle-orm';
import { createPmProjectSchema, updatePmProjectSchema, createPmPhaseSchema, updatePmPhaseSchema, createPmInvoiceSchema, updatePmInvoiceSchema, updatePmEmployeeOrderSchema, swapPmProjectOrderSchema, createPmTaskSchema, updatePmTaskSchema } from '@servio/shared';
import { db } from '../../../db';
import { pmProjects, pmProjectPhases, pmProjectDocuments, pmProjectInvoices, pmEmployeeOrder, pmProjectTasks } from '../schema';
import { selectTasks } from '../tasks';
import { notifyTasksAssigned } from '../taskNotifications';
import { users } from '../../../db/schema/users';
import { requireRole } from '../../../middleware/role';
import { documentUpload } from '../../../middleware/upload';
import { readCsvRows, escapeCsv } from '../../../utils/csv';
import path from 'path';
import fs from 'fs/promises';

const router = Router();
router.use(requireRole('projects', 'access'));

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'pm-documents');

async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

// Filters shared by the project list and the CSV export: archived, search, status, priority, employeeId, customer
function projectFilters(query: Request['query']) {
  const search = query.search as string | undefined;
  const status = query.status as string | undefined;
  const priority = query.priority as string | undefined;
  const employeeId = query.employeeId as string | undefined;
  const archived = query.archived as string | undefined;

  const conditions = [];
  if (archived === 'true') {
    conditions.push(eq(pmProjects.status, 'completed'));
  } else if (archived === 'false') {
    conditions.push(ne(pmProjects.status, 'completed'));
  }
  if (search) {
    // Escape LIKE wildcards so "%" and "_" are matched literally
    const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(
      ilike(pmProjects.name, pattern),
      ilike(pmProjects.projectNumber, pattern),
      ilike(pmProjects.customerName, pattern),
      ilike(pmProjects.facilityName, pattern),
    ));
  }
  if (status && archived !== 'true') conditions.push(eq(pmProjects.status, status));
  if (priority) conditions.push(eq(pmProjects.priority, priority));
  if (employeeId) conditions.push(eq(pmProjects.employeeId, employeeId));
  // Exact customer, ignoring case and surrounding spaces (same rule as the reports)
  const customer = typeof query.customer === 'string' ? query.customer.trim() : '';
  if (customer) conditions.push(sql`lower(trim(${pmProjects.customerName})) = lower(${customer})`);

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// Order shared by the project list and the CSV export: the archive by completion date, the rest in manual order
function projectListOrder(query: Request['query']) {
  return query.archived === 'true' ? desc(pmProjects.completedAt) : pmProjects.sortIndex;
}

// List projects
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;

  const where = projectFilters(req.query);

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
    completedAt: pmProjects.completedAt,
    createdAt: pmProjects.createdAt,
    updatedAt: pmProjects.updatedAt,
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
    customerName: pmProjects.customerName,
    facilityName: pmProjects.facilityName,
    openTaskCount: sql<number>`(select count(*)::int from pm_project_tasks t where t.project_id = ${pmProjects.id} and t.status = 'open')`,
    overdueTaskCount: sql<number>`(select count(*)::int from pm_project_tasks t where t.project_id = ${pmProjects.id} and t.status = 'open' and t.due_date < current_date)`,
  };

  const [data, [{ count }]] = await Promise.all([
    db.select(baseSelect)
      .from(pmProjects)
      .leftJoin(users, eq(pmProjects.employeeId, users.id))
      .where(where)
      .orderBy(projectListOrder(req.query))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(pmProjects).where(where),
  ]);

  res.json({ data, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

// Manual order of employee groups — returns user ids in display order
router.get('/employee-order', async (_req: Request, res: Response): Promise<void> => {
  const rows = await db.select({ userId: pmEmployeeOrder.userId })
    .from(pmEmployeeOrder)
    .orderBy(pmEmployeeOrder.sortIndex);
  res.json(rows.map((r) => r.userId));
});

router.put('/employee-order', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmEmployeeOrderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const userIds = [...new Set(parsed.data.userIds)];
  await db.transaction(async (tx) => {
    await tx.delete(pmEmployeeOrder);
    if (userIds.length > 0) {
      await tx.insert(pmEmployeeOrder).values(userIds.map((userId, sortIndex) => ({ userId, sortIndex })));
    }
  });
  res.json(userIds);
});

// Manual project order — swaps two projects, so projects hidden by filters keep their position
router.put('/swap-order', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = swapPmProjectOrderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const swapped = await db.transaction(async (tx) => {
    const rows = await tx.select({ id: pmProjects.id, sortIndex: pmProjects.sortIndex })
      .from(pmProjects)
      .where(inArray(pmProjects.id, [parsed.data.projectId, parsed.data.otherProjectId]))
      .orderBy(pmProjects.id)
      .for('update');
    if (rows.length !== 2) return false;
    await tx.update(pmProjects).set({ sortIndex: rows[1].sortIndex }).where(eq(pmProjects.id, rows[0].id));
    await tx.update(pmProjects).set({ sortIndex: rows[0].sortIndex }).where(eq(pmProjects.id, rows[1].id));
    return true;
  });
  if (!swapped) { res.status(404).json({ error: 'errors.not_found' }); return; }

  res.json({ success: true });
});

// Distinct customer / facility names already used on projects, for form autocomplete
router.get('/suggestions', async (_req: Request, res: Response): Promise<void> => {
  const rows = await db.selectDistinct({ customerName: pmProjects.customerName, facilityName: pmProjects.facilityName })
    .from(pmProjects)
    .where(or(sql`${pmProjects.customerName} <> ''`, sql`${pmProjects.facilityName} <> ''`));

  const customers = [...new Set(rows.map((r) => r.customerName?.trim()).filter((n): n is string => !!n))]
    .sort((a, b) => a.localeCompare(b, 'sl'));
  const facilities = rows
    .filter((r) => r.facilityName?.trim())
    .map((r) => ({ name: r.facilityName!.trim(), customerName: r.customerName?.trim() || null }));

  res.json({ customers, facilities });
});

const CSV_HEADER ='project_number;name;customer_name;facility_name;employee_name;employee_email;priority;status;order_date;start_date;end_date;contract_value;invoiced_amount;received_amount;notes';

// Exports the projects matching the same filters as the list
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const data = await db.select({
    projectNumber: pmProjects.projectNumber,
    name: pmProjects.name,
    customerName: pmProjects.customerName,
    facilityName: pmProjects.facilityName,
    employeeName: users.name,
    employeeEmail: users.email,
    priority: pmProjects.priority,
    status: pmProjects.status,
    orderDate: pmProjects.orderDate,
    startDate: pmProjects.startDate,
    endDate: pmProjects.endDate,
    contractValue: pmProjects.contractValue,
    invoicedAmount: pmProjects.invoicedAmount,
    receivedAmount: pmProjects.receivedAmount,
    notes: pmProjects.notes,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .where(projectFilters(req.query))
    .orderBy(projectListOrder(req.query));

  const rows = data.map((p) => [
    p.projectNumber, p.name, p.customerName, p.facilityName, p.employeeName, p.employeeEmail,
    p.priority, p.status, p.orderDate, p.startDate, p.endDate,
    p.contractValue, p.invoicedAmount, p.receivedAmount, p.notes,
  ].map(escapeCsv).join(';'));

  // BOM so Excel opens the file as UTF-8 (keeps č, š, ž intact)
  const csv = '﻿' + [CSV_HEADER, ...rows].join('\r\n');
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="projects-${today}.csv"`);
  res.send(csv);
});

// Accepts yyyy-MM-dd or Slovenian d.M.yyyy (what Excel writes back on sl-SI locale)
function parseCsvDate(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  throw new Error(`invalid date "${v}"`);
}

// Accepts 1234.56 or Slovenian 1.234,56
function parseCsvAmount(v: string): string | null {
  if (!v) return null;
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
  const cleaned = normalized.replace(/[\s€]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`invalid amount "${v}"`);
  return cleaned;
}

router.post('/import', requireRole('projects', 'manage'), documentUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'errors.file_required' }); return; }

  const lines = readCsvRows(req.file.buffer);
  if (lines.length < 2) { res.status(400).json({ error: 'errors.validation', details: { file: ['CSV must have a header row and at least one data row'] } }); return; }

  const headers = lines[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const required = ['project_number', 'name'];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length > 0) { res.status(400).json({ error: 'errors.validation', details: { file: [`Missing columns: ${missing.join(', ')}`] } }); return; }

  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  // Project numbers may repeat, so a row is only a duplicate if number + name both match
  const projectKey = (n: string, name: string) => `${n.trim().toLowerCase()}\u0000${name.trim().toLowerCase()}`;
  const existingKeys = new Set((await db.select({ n: pmProjects.projectNumber, name: pmProjects.name }).from(pmProjects)).map((r) => projectKey(r.n, r.name)));

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

    const projectNumber = row['project_number'];
    if (!projectNumber) { errors.push(`Row ${i}: missing project_number`); continue; }
    if (!row['name']) { errors.push(`Row ${i} (${projectNumber}): missing name`); continue; }
    const key = projectKey(projectNumber, row['name']);
    if (existingKeys.has(key)) { skipped.push(`${projectNumber} (${row['name']})`); continue; }

    try {
      // Match project manager by email first, then by exact name
      const email = row['employee_email']?.toLowerCase();
      const empName = row['employee_name'];
      const employee = (email && allUsers.find((u) => u.email.toLowerCase() === email))
        || (empName && allUsers.find((u) => u.name === empName))
        || null;
      if ((email || empName) && !employee) throw new Error(`unknown employee "${email || empName}"`);

      const priority = ['high', 'medium', 'low'].includes(row['priority']) ? row['priority'] : 'medium';
      const status = ['active', 'on_hold', 'completed'].includes(row['status']) ? row['status'] : 'active';

      const orderDate = parseCsvDate(row['order_date']);
      const invoicedAmount = parseCsvAmount(row['invoiced_amount']) ?? '0';
      const receivedAmount = parseCsvAmount(row['received_amount']) ?? '0';

      await db.transaction(async (tx) => {
        const [project] = await tx.insert(pmProjects).values({
          projectNumber,
          name: row['name'],
          customerName: row['customer_name'] || null,
          facilityName: row['facility_name'] || null,
          employeeId: employee?.id ?? null,
          priority,
          status,
          orderDate,
          startDate: parseCsvDate(row['start_date']),
          endDate: parseCsvDate(row['end_date']),
          contractValue: parseCsvAmount(row['contract_value']),
          invoicedAmount,
          receivedAmount,
          notes: row['notes'] || null,
          completedAt: status === 'completed' ? new Date() : null,
        }).returning({ id: pmProjects.id });

        // Totals are recalculated from invoice rows, so imported amounts need
        // an opening invoice each or the first real invoice would wipe them
        const opening = ([['issued', invoicedAmount], ['received', receivedAmount]] as const)
          .filter(([, amount]) => Number(amount) !== 0)
          .map(([direction, amount]) => ({
            projectId: project.id,
            direction,
            invoiceDate: orderDate ?? new Date().toISOString().slice(0, 10),
            amount,
            notes: 'Začetno stanje (uvoz CSV)',
          }));
        if (opening.length > 0) await tx.insert(pmProjectInvoices).values(opening);
      });

      existingKeys.add(key);
      created.push(projectNumber);
    } catch (err) {
      errors.push(`Row ${i} (${projectNumber}): ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  res.json({ created, skipped, errors });
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
    receivedAmount: pmProjects.receivedAmount,
    notes: pmProjects.notes,
    completedAt: pmProjects.completedAt,
    createdAt: pmProjects.createdAt,
    updatedAt: pmProjects.updatedAt,
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
    customerName: pmProjects.customerName,
    facilityName: pmProjects.facilityName,
    kimaiProjectId: pmProjects.kimaiProjectId,
    kimaiProjectName: pmProjects.kimaiProjectName,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
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
router.post('/', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createPmProjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [project] = await db.insert(pmProjects).values({
    projectNumber: parsed.data.projectNumber,
    name: parsed.data.name,
    orderDate: parsed.data.orderDate ?? null,
    employeeId: parsed.data.employeeId ?? null,
    customerName: parsed.data.customerName ?? null,
    facilityName: parsed.data.facilityName ?? null,
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
router.patch('/:id', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmProjectSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const { invoicedAmount, ...rest } = parsed.data;
  const completedAtUpdate = 'status' in parsed.data
    ? { completedAt: parsed.data.status === 'completed' ? new Date() : null }
    : {};
  const [updated] = await db.update(pmProjects).set({
    ...rest,
    ...(invoicedAmount != null ? { invoicedAmount } : {}),
    ...completedAtUpdate,
    updatedAt: new Date(),
  }).where(eq(pmProjects.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  res.json(updated);
});

// Delete project
router.delete('/:id', requireRole('projects', 'delete'), async (req: Request, res: Response): Promise<void> => {
  // The cascade removes the document rows, so read the filenames first to clean up the files
  const documents = await db.select({ filename: pmProjectDocuments.filename })
    .from(pmProjectDocuments)
    .where(eq(pmProjectDocuments.projectId, req.params.id));

  const [deleted] = await db.delete(pmProjects).where(eq(pmProjects.id, req.params.id)).returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await Promise.all(documents.map(doc => fs.unlink(path.join(UPLOADS_DIR, doc.filename)).catch(() => {})));

  res.json({ success: true });
});

// --- Phases ---

router.post('/:id/phases', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
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

router.patch('/:id/phases/:phaseId', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmPhaseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(pmProjectPhases)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(pmProjectPhases.id, req.params.phaseId), eq(pmProjectPhases.projectId, req.params.id)))
    .returning();

  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(updated);
});

router.delete('/:id/phases/:phaseId', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.delete(pmProjectPhases)
    .where(and(eq(pmProjectPhases.id, req.params.phaseId), eq(pmProjectPhases.projectId, req.params.id)))
    .returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
});

// --- Documents ---

router.post('/:id/documents', requireRole('projects', 'manage'), documentUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [project] = await db.select({ id: pmProjects.id }).from(pmProjects).where(eq(pmProjects.id, req.params.id)).limit(1);
  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }

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

router.delete('/:id/documents/:docId', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const [doc] = await db.delete(pmProjectDocuments)
    .where(and(eq(pmProjectDocuments.id, req.params.docId), eq(pmProjectDocuments.projectId, req.params.id)))
    .returning();
  if (!doc) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const filePath = path.join(process.cwd(), 'uploads', 'pm-documents', doc.filename);
  await fs.unlink(filePath).catch(() => {});

  res.json({ success: true });
});

// --- Invoices ---

router.get('/:id/invoices', async (req: Request, res: Response): Promise<void> => {
  const invoices = await db.select()
    .from(pmProjectInvoices)
    .where(eq(pmProjectInvoices.projectId, req.params.id))
    .orderBy(desc(pmProjectInvoices.invoiceDate));
  res.json(invoices);
});

async function recalculateInvoiceTotals(projectId: string) {
  const [{ issued, received }] = await db.select({
    issued: sql<string>`coalesce(sum(amount) filter (where direction = 'issued'), '0')`,
    received: sql<string>`coalesce(sum(amount) filter (where direction = 'received'), '0')`,
  }).from(pmProjectInvoices).where(eq(pmProjectInvoices.projectId, projectId));
  await db.update(pmProjects).set({ invoicedAmount: issued, receivedAmount: received, updatedAt: new Date() })
    .where(eq(pmProjects.id, projectId));
}

router.post('/:id/invoices', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createPmInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [invoice] = await db.insert(pmProjectInvoices).values({
    projectId: req.params.id,
    direction: parsed.data.direction,
    invoiceDate: parsed.data.invoiceDate,
    amount: parsed.data.amount,
    notes: parsed.data.notes ?? null,
  }).returning();

  await recalculateInvoiceTotals(req.params.id);

  res.status(201).json(invoice);
});

router.patch('/:id/invoices/:invoiceId', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(pmProjectInvoices)
    .set(parsed.data)
    .where(and(eq(pmProjectInvoices.id, req.params.invoiceId), eq(pmProjectInvoices.projectId, req.params.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await recalculateInvoiceTotals(req.params.id);

  res.json(updated);
});

router.delete('/:id/invoices/:invoiceId', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.delete(pmProjectInvoices)
    .where(and(eq(pmProjectInvoices.id, req.params.invoiceId), eq(pmProjectInvoices.projectId, req.params.id)))
    .returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await recalculateInvoiceTotals(req.params.id);

  res.json({ success: true });
});

// --- Tasks ---

router.get('/:id/tasks', async (req: Request, res: Response): Promise<void> => {
  res.json(await selectTasks(eq(pmProjectTasks.projectId, req.params.id)));
});

router.post('/:id/tasks', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createPmTaskSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [project] = await db.select({ id: pmProjects.id }).from(pmProjects).where(eq(pmProjects.id, req.params.id)).limit(1);
  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const [task] = await db.insert(pmProjectTasks).values({
    projectId: req.params.id,
    title: parsed.data.title,
    assigneeId: parsed.data.assigneeId ?? null,
    dueDate: parsed.data.dueDate || null,
    createdById: req.auth!.userId,
  }).returning();

  await notifyTasksAssigned([task.id], req.auth!.userId);
  res.status(201).json(task);
});

router.patch('/:id/tasks/:taskId', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmTaskSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const where = and(eq(pmProjectTasks.id, req.params.taskId), eq(pmProjectTasks.projectId, req.params.id));
  const [before] = await db.select().from(pmProjectTasks).where(where).limit(1);
  if (!before) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const { status, dueDate, ...rest } = parsed.data;
  const newDueDate = dueDate !== undefined ? dueDate || null : before.dueDate;
  // A new due date or a reopened task should get its reminders again
  const resetReminders = newDueDate !== before.dueDate || (status === 'open' && before.status !== 'open');
  const [updated] = await db.update(pmProjectTasks)
    .set({
      ...rest,
      dueDate: newDueDate,
      // Closed outside a meeting, so no completedMeetingId
      ...(status ? { status, completedAt: status === 'done' ? new Date() : null, completedMeetingId: null } : {}),
      ...(resetReminders ? { dueNotifiedAt: null, overdueNotifiedAt: null } : {}),
      updatedAt: new Date(),
    })
    .where(where)
    .returning();

  if (updated.assigneeId && updated.assigneeId !== before.assigneeId) {
    await notifyTasksAssigned([updated.id], req.auth!.userId);
  }
  res.json(updated);
});

router.delete('/:id/tasks/:taskId', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.delete(pmProjectTasks)
    .where(and(eq(pmProjectTasks.id, req.params.taskId), eq(pmProjectTasks.projectId, req.params.id)))
    .returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
});

export default router;
