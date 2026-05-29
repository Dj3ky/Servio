import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { eq, sql } from 'drizzle-orm';
import { createContractSchema, updateContractSchema } from '@servio/shared';
import { db } from '../db';
import { contracts, reviews, invoices, customers, facilities, users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { documentUpload } from '../middleware/upload';
import { createAuditLog } from '../utils/audit';
import { format, startOfMonth } from 'date-fns';
import { shouldCreateReview } from '../services/scheduler';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;
  const activeOnly = req.query.activeOnly !== 'false';

  const now = new Date();
  const currentMonth = format(startOfMonth(now), 'yyyy-MM-dd');
  const currentMonthNumber = now.getMonth() + 1;

  const data = await db.query.contracts.findMany({
    where: activeOnly ? (c, { eq }) => eq(c.isActive, true) : undefined,
    with: {
      customer: true,
      facility: true,
      assignedTechnician: { columns: { id: true, name: true, email: true } },
    },
    limit,
    offset,
    orderBy: (c, { asc }) => [asc(c.contractNumber)],
  });

  const enriched = await Promise.all(
    data.map(async (contract) => {
      const [currentReview, currentInvoice] = await Promise.all([
        db.query.reviews.findFirst({
          where: (r, { eq, and }) => and(eq(r.contractId, contract.id), eq(r.scheduledMonth, currentMonth)),
          columns: { id: true, status: true },
        }),
        db.query.invoices.findFirst({
          where: (inv, { eq }) => eq(inv.contractId, contract.id),
          orderBy: (inv, { desc }) => [desc(inv.createdAt)],
          columns: { id: true, status: true },
        }),
      ]);
      const reviewNeededThisMonth = shouldCreateReview(contract.reviewFrequency, contract.customMonths, currentMonthNumber);
      return { ...contract, currentReview: currentReview ?? null, currentInvoice: currentInvoice ?? null, reviewNeededThisMonth };
    }),
  );

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contracts)
    .where(activeOnly ? eq(contracts.isActive, true) : undefined);

  res.json({ data: enriched, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const data = await db.query.contracts.findMany({
    with: {
      customer: true,
      facility: true,
      assignedTechnician: { columns: { id: true, name: true, email: true } },
    },
    orderBy: (c, { asc }) => [asc(c.contractNumber)],
  });

  const escape = (v: string | null | undefined) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = 'contract_number,customer_name,facility_name,review_frequency,status,technician,start_date,end_date,value_without_vat,value_without_vat_per_year';
  const rows = data.map((c) => [
    escape(c.contractNumber),
    escape(c.customer.name),
    escape(c.facility.name),
    escape(c.reviewFrequency),
    c.isActive ? 'active' : 'inactive',
    escape(c.assignedTechnician?.name),
    escape(c.startDate),
    escape(c.endDate),
    escape(c.valueWithoutVat),
    escape(c.valueWithoutVatPerYear),
  ].join(','));

  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="contracts-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
  res.send(csv);
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const contract = await db.query.contracts.findFirst({
    where: (c, { eq }) => eq(c.id, req.params.id),
    with: {
      customer: true,
      facility: true,
      assignedTechnician: { columns: { id: true, name: true, email: true } },
      emailTemplate: true,
    },
  });
  if (!contract) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(contract);
});

router.post('/', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createContractSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const existing = await db.query.contracts.findFirst({
    where: (c, { eq }) => eq(c.contractNumber, parsed.data.contractNumber),
  });
  if (existing) { res.status(409).json({ error: 'errors.contract_number_taken' }); return; }

  const [contract] = await db.insert(contracts).values({
    facilityId: parsed.data.facilityId,
    customerId: parsed.data.customerId,
    contractNumber: parsed.data.contractNumber,
    assignedTechnicianId: parsed.data.assignedTechnicianId ?? null,
    reviewFrequency: parsed.data.reviewFrequency,
    customMonths: parsed.data.customMonths ?? null,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate ?? null,
    emailTemplateId: parsed.data.emailTemplateId ?? null,
    smbPath: parsed.data.smbPath ?? null,
    valueWithoutVat: parsed.data.valueWithoutVat?.toString() ?? null,
    valueWithoutVatPerYear: parsed.data.valueWithoutVatPerYear?.toString() ?? null,
    customerEmail: parsed.data.customerEmail ?? null,
  }).returning();

  const nowPost = new Date();
  const scheduledMonth = format(startOfMonth(nowPost), 'yyyy-MM-dd');
  if (shouldCreateReview(contract.reviewFrequency, contract.customMonths, nowPost.getMonth() + 1)) {
    await db.insert(reviews).values({
      contractId: contract.id,
      facilityId: contract.facilityId,
      scheduledMonth,
      status: 'pending',
      emailSent: false,
      smbSaved: false,
    });
  }

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'contract', entityId: contract.id, payload: { contractNumber: contract.contractNumber }, req });
  res.status(201).json(contract);
});

router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const contract = await db.query.contracts.findFirst({ where: (c, { eq }) => eq(c.id, req.params.id) });
  if (!contract) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await db.delete(invoices).where(eq(invoices.contractId, req.params.id));
  await db.delete(reviews).where(eq(reviews.contractId, req.params.id));
  await db.delete(contracts).where(eq(contracts.id, req.params.id));

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'delete', entityType: 'contract', entityId: req.params.id, payload: { contractNumber: contract.contractNumber }, req });
  res.json({ success: true });
});

router.patch('/:id', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateContractSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.valueWithoutVat !== undefined) updates.valueWithoutVat = parsed.data.valueWithoutVat?.toString() ?? null;
  if (parsed.data.valueWithoutVatPerYear !== undefined) updates.valueWithoutVatPerYear = parsed.data.valueWithoutVatPerYear?.toString() ?? null;

  const [updated] = await db.update(contracts).set(updates as any).where(eq(contracts.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  // Reconcile pending review for current month when frequency/customMonths changed
  if (parsed.data.reviewFrequency !== undefined || parsed.data.customMonths !== undefined) {
    const nowPatch = new Date();
    const scheduledMonth = format(startOfMonth(nowPatch), 'yyyy-MM-dd');
    const needed = shouldCreateReview(updated.reviewFrequency, updated.customMonths, nowPatch.getMonth() + 1);

    const existingReview = await db.query.reviews.findFirst({
      where: (r, { eq, and }) => and(eq(r.contractId, req.params.id), eq(r.scheduledMonth, scheduledMonth)),
      columns: { id: true, status: true },
    });

    if (!needed && existingReview?.status === 'pending') {
      await db.delete(reviews).where(eq(reviews.id, existingReview.id));
    } else if (needed && !existingReview) {
      await db.insert(reviews).values({
        contractId: updated.id,
        facilityId: updated.facilityId,
        scheduledMonth,
        status: 'pending',
        emailSent: false,
        smbSaved: false,
      });
    }
  }

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'contract', entityId: req.params.id, payload: parsed.data as Record<string, unknown>, req });
  res.json(updated);
});

router.post('/:id/documents', requireRole('admin', 'manager'), documentUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'errors.file_required' }); return; }

  const contract = await db.query.contracts.findFirst({ where: (c, { eq }) => eq(c.id, req.params.id) });
  if (!contract) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const uploadsDir = path.join(process.cwd(), 'uploads', 'contracts', req.params.id);
  await fs.mkdir(uploadsDir, { recursive: true });

  const ext = path.extname(req.file.originalname) || '.pdf';
  const filename = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await fs.writeFile(path.join(uploadsDir, filename), req.file.buffer);

  const url = `/uploads/contracts/${req.params.id}/${filename}`;
  const existing = contract.contractDocuments ?? [];
  const updated = [...existing, { filename: req.file.originalname, url }];

  await db.update(contracts).set({ contractDocuments: updated, updatedAt: new Date() }).where(eq(contracts.id, req.params.id));
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'upload', entityType: 'contract', entityId: req.params.id, payload: { filename }, req });
  res.json({ filename: req.file.originalname, url });
});

router.delete('/:id/documents/:filename', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const contract = await db.query.contracts.findFirst({ where: (c, { eq }) => eq(c.id, req.params.id) });
  if (!contract) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const docs = contract.contractDocuments ?? [];
  const doc = docs.find((d) => d.filename === decodeURIComponent(req.params.filename));
  if (!doc) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const filePath = path.join(process.cwd(), doc.url.replace(/^\//, ''));
  try { await fs.unlink(filePath); } catch { /* file may already be gone */ }

  const updated = docs.filter((d) => d.filename !== decodeURIComponent(req.params.filename));
  await db.update(contracts).set({ contractDocuments: updated, updatedAt: new Date() }).where(eq(contracts.id, req.params.id));
  res.json({ success: true });
});

router.post('/import', requireRole('admin', 'manager'), documentUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'errors.file_required' }); return; }

  const content = req.file.buffer.toString('utf-8');
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) { res.status(400).json({ error: 'errors.validation', details: { file: ['CSV must have a header row and at least one data row'] } }); return; }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const required = ['customer_name', 'facility_name', 'contract_number', 'review_frequency', 'start_date'];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length > 0) { res.status(400).json({ error: 'errors.validation', details: { file: [`Missing columns: ${missing.join(', ')}`] } }); return; }

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });

    const contractNumber = row['contract_number'];
    if (!contractNumber) { errors.push(`Row ${i}: missing contract_number`); continue; }

    const existing = await db.query.contracts.findFirst({ where: (c, { eq }) => eq(c.contractNumber, contractNumber) });
    if (existing) { skipped.push(contractNumber); continue; }

    try {
      let customer = await db.query.customers.findFirst({ where: (c, { eq }) => eq(c.name, row['customer_name']) });
      if (!customer) {
        [customer] = await db.insert(customers).values({ name: row['customer_name'], email: row['customer_email'] || null }).returning();
      }

      let facility = await db.query.facilities.findFirst({ where: (f, { eq }) => eq(f.name, row['facility_name']) });
      if (!facility) {
        [facility] = await db.insert(facilities).values({ customerId: customer.id, name: row['facility_name'], address: row['facility_address'] || null }).returning();
      }

      const freq = (['monthly', 'biannual', 'quadannual', 'custom'] as const).includes(row['review_frequency'] as any)
        ? (row['review_frequency'] as 'monthly' | 'biannual' | 'quadannual' | 'custom')
        : 'monthly';

      const [contract] = await db.insert(contracts).values({
        facilityId: facility.id,
        customerId: customer.id,
        contractNumber,
        reviewFrequency: freq,
        startDate: row['start_date'],
        endDate: row['end_date'] || null,
        customerEmail: row['customer_email'] || null,
        valueWithoutVat: row['value_without_vat'] ? row['value_without_vat'] : null,
        valueWithoutVatPerYear: row['value_without_vat_per_year'] ? row['value_without_vat_per_year'] : null,
      }).returning();

      created.push(contract.contractNumber);
    } catch (err) {
      errors.push(`Row ${i} (${contractNumber}): ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'contract', payload: { import: true, created: created.length, skipped: skipped.length, errors: errors.length }, req });
  res.json({ created, skipped, errors });
});

export default router;
