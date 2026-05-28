import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { createFacilitySchema, updateFacilitySchema } from '@servio/shared';
import { db } from '../db';
import { facilities } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { createAuditLog } from '../utils/audit';
import { broadcast } from '../ws';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const customerId = req.query.customerId as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;

  const data = await db.query.facilities.findMany({
    where: customerId ? (f, { eq }) => eq(f.customerId, customerId) : undefined,
    with: { customer: true },
    limit,
    offset,
    orderBy: (f, { asc }) => [asc(f.name)],
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(facilities)
    .where(customerId ? eq(facilities.customerId, customerId) : undefined);

  res.json({ data, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const facility = await db.query.facilities.findFirst({
    where: (f, { eq }) => eq(f.id, req.params.id),
    with: {
      customer: true,
      contracts: {
        with: { assignedTechnician: { columns: { id: true, name: true } } },
      },
    },
  });
  if (!facility) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(facility);
});

router.post('/', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createFacilitySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [facility] = await db.insert(facilities).values({
    customerId: parsed.data.customerId,
    name: parsed.data.name,
    address: parsed.data.address ?? null,
    notes: parsed.data.notes ?? null,
  }).returning();

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'facility', entityId: facility.id, payload: { name: facility.name }, req });
  res.status(201).json(facility);
});

router.patch('/:id', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateFacilitySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db
    .update(facilities)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(facilities.id, req.params.id))
    .returning();

  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'facility', entityId: req.params.id, payload: parsed.data as Record<string, unknown>, req });
  broadcast('facility_updated', { facilityId: req.params.id, contractId: '' });

  res.json(updated);
});

export default router;
