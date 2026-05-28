import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { createContractSchema, updateContractSchema } from '@servio/shared';
import { db } from '../db';
import { contracts, reviews, invoices } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { createAuditLog } from '../utils/audit';
import { format, startOfMonth } from 'date-fns';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;
  const activeOnly = req.query.activeOnly !== 'false';

  const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');

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
      return { ...contract, currentReview: currentReview ?? null, currentInvoice: currentInvoice ?? null };
    }),
  );

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contracts)
    .where(activeOnly ? eq(contracts.isActive, true) : undefined);

  res.json({ data: enriched, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
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

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'contract', entityId: contract.id, payload: { contractNumber: contract.contractNumber }, req });
  res.status(201).json(contract);
});

router.patch('/:id', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateContractSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.valueWithoutVat !== undefined) updates.valueWithoutVat = parsed.data.valueWithoutVat?.toString() ?? null;
  if (parsed.data.valueWithoutVatPerYear !== undefined) updates.valueWithoutVatPerYear = parsed.data.valueWithoutVatPerYear?.toString() ?? null;

  const [updated] = await db.update(contracts).set(updates as any).where(eq(contracts.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'contract', entityId: req.params.id, payload: parsed.data as Record<string, unknown>, req });
  res.json(updated);
});

export default router;
