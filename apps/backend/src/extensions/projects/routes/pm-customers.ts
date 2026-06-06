import { Router, Request, Response } from 'express';
import { eq, ilike, or, and, sql } from 'drizzle-orm';
import { createPmCustomerSchema, updatePmCustomerSchema } from '@servio/shared';
import { db } from '../../../db';
import { pmCustomers } from '../schema';
import { requireRole } from '../../../middleware/role';

const router = Router();
router.use(requireRole('projects', 'access'));

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const search = req.query.search as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;

  const conditions = [eq(pmCustomers.isActive, true) as any];
  if (search) conditions.push(or(ilike(pmCustomers.name, `%${search}%`), ilike(pmCustomers.email, `%${search}%`)));
  const where = and(...conditions);

  const [data, [{ count }]] = await Promise.all([
    db.select().from(pmCustomers).where(where).limit(limit).offset(offset).orderBy(pmCustomers.name),
    db.select({ count: sql<number>`count(*)` }).from(pmCustomers).where(where),
  ]);

  res.json({ data, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const [customer] = await db.select().from(pmCustomers).where(eq(pmCustomers.id, req.params.id)).limit(1);
  if (!customer) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(customer);
});

router.post('/', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createPmCustomerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [customer] = await db.insert(pmCustomers).values({
    name: parsed.data.name,
    address: parsed.data.address ?? null,
    email: parsed.data.email || null,
    phone: parsed.data.phone ?? null,
    contactName: parsed.data.contactName ?? null,
  }).returning();

  res.status(201).json(customer);
});

router.patch('/:id', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmCustomerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(pmCustomers).set({ ...parsed.data, updatedAt: new Date() }).where(eq(pmCustomers.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  res.json(updated);
});

router.delete('/:id', requireRole('projects', 'delete'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.update(pmCustomers).set({ isActive: false, updatedAt: new Date() }).where(eq(pmCustomers.id, req.params.id)).returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
});

export default router;
