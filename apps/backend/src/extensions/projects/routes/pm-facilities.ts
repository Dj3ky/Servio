import { Router, Request, Response } from 'express';
import { eq, ilike, and, sql } from 'drizzle-orm';
import { createPmFacilitySchema, updatePmFacilitySchema } from '@servio/shared';
import { db } from '../../../db';
import { pmFacilities, pmCustomers } from '../schema';
import { requireRole } from '../../../middleware/role';

const router = Router();
router.use(requireRole('projects', 'access'));

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const search = req.query.search as string | undefined;
  const customerId = req.query.customerId as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;

  const conditions = [eq(pmFacilities.isActive, true) as any];
  if (customerId) conditions.push(eq(pmFacilities.pmCustomerId, customerId));
  if (search) conditions.push(ilike(pmFacilities.name, `%${search}%`));
  const where = and(...conditions);

  const [data, [{ count }]] = await Promise.all([
    db.select({
        id: pmFacilities.id,
        pmCustomerId: pmFacilities.pmCustomerId,
        name: pmFacilities.name,
        address: pmFacilities.address,
        notes: pmFacilities.notes,
        isActive: pmFacilities.isActive,
        createdAt: pmFacilities.createdAt,
        updatedAt: pmFacilities.updatedAt,
        customerName: pmCustomers.name,
      })
      .from(pmFacilities)
      .leftJoin(pmCustomers, eq(pmFacilities.pmCustomerId, pmCustomers.id))
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(pmFacilities.name),
    db.select({ count: sql<number>`count(*)` }).from(pmFacilities).where(where),
  ]);

  res.json({ data, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const [facility] = await db
    .select({
      id: pmFacilities.id,
      pmCustomerId: pmFacilities.pmCustomerId,
      name: pmFacilities.name,
      address: pmFacilities.address,
      notes: pmFacilities.notes,
      isActive: pmFacilities.isActive,
      createdAt: pmFacilities.createdAt,
      updatedAt: pmFacilities.updatedAt,
      customerName: pmCustomers.name,
    })
    .from(pmFacilities)
    .leftJoin(pmCustomers, eq(pmFacilities.pmCustomerId, pmCustomers.id))
    .where(eq(pmFacilities.id, req.params.id))
    .limit(1);

  if (!facility) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(facility);
});

router.post('/', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createPmFacilitySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [facility] = await db.insert(pmFacilities).values({
    pmCustomerId: parsed.data.pmCustomerId ?? null,
    name: parsed.data.name,
    address: parsed.data.address ?? null,
    notes: parsed.data.notes ?? null,
  }).returning();

  res.status(201).json(facility);
});

router.patch('/:id', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmFacilitySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(pmFacilities).set({ ...parsed.data, updatedAt: new Date() }).where(eq(pmFacilities.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  res.json(updated);
});

router.delete('/:id', requireRole('projects', 'delete'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.update(pmFacilities).set({ isActive: false, updatedAt: new Date() }).where(eq(pmFacilities.id, req.params.id)).returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
});

export default router;
