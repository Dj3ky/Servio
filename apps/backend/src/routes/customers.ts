import { Router, Request, Response } from 'express';
import { eq, ilike, or, sql } from 'drizzle-orm';
import { createCustomerSchema, updateCustomerSchema } from '@servio/shared';
import { db } from '../db';
import { customers } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { createAuditLog } from '../utils/audit';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const search = req.query.search as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;

  let query = db.select().from(customers);
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(customers);

  if (search) {
    const condition = or(ilike(customers.name, `%${search}%`), ilike(customers.email, `%${search}%`));
    query = query.where(condition) as typeof query;
    countQuery = countQuery.where(condition) as typeof countQuery;
  }

  const [data, [{ count }]] = await Promise.all([
    query.limit(limit).offset(offset).orderBy(customers.name),
    countQuery,
  ]);

  res.json({ data, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const customer = await db.query.customers.findFirst({
    where: (c, { eq }) => eq(c.id, req.params.id),
  });
  if (!customer) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(customer);
});

router.post('/', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [customer] = await db.insert(customers).values({
    name: parsed.data.name,
    address: parsed.data.address ?? null,
    email: parsed.data.email || null,
    phone: parsed.data.phone ?? null,
    contactName: parsed.data.contactName ?? null,
  }).returning();

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'customer', entityId: customer.id, payload: { name: customer.name }, req });
  res.status(201).json(customer);
});

router.patch('/:id', requireRole('admin', 'manager'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(customers).set({ ...parsed.data, updatedAt: new Date() }).where(eq(customers.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'customer', entityId: req.params.id, payload: parsed.data as Record<string, unknown>, req });
  res.json(updated);
});

router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.update(customers).set({ isActive: false, updatedAt: new Date() }).where(eq(customers.id, req.params.id)).returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'delete', entityType: 'customer', entityId: req.params.id, req });
  res.json({ success: true });
});

export default router;
