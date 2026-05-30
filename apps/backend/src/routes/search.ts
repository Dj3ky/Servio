import { Router, Request, Response } from 'express';
import { ilike, or, eq, and } from 'drizzle-orm';
import { db } from '../db';
import { customers, facilities, contracts } from '../db/schema';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const q = (req.query.q as string ?? '').trim();

  if (!q || q.length < 2) {
    res.json({ customers: [], facilities: [], contracts: [] });
    return;
  }

  const pattern = `%${q}%`;

  const [matchedCustomers, matchedFacilities, matchedContracts] = await Promise.all([
    db.query.customers.findMany({
      where: (c, { ilike }) => ilike(c.name, pattern),
      limit: 5,
      columns: { id: true, name: true, email: true },
    }),
    db.query.facilities.findMany({
      where: (f, { ilike }) => ilike(f.name, pattern),
      limit: 5,
      with: { customer: { columns: { name: true } } },
      columns: { id: true, name: true },
    }),
    db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        facilityId: facilities.id,
        facilityName: facilities.name,
        customerName: customers.name,
        isActive: contracts.isActive,
      })
      .from(contracts)
      .innerJoin(facilities, eq(contracts.facilityId, facilities.id))
      .innerJoin(customers, eq(facilities.customerId, customers.id))
      .where(
        or(
          ilike(contracts.contractNumber, pattern),
          ilike(facilities.name, pattern),
          ilike(customers.name, pattern),
        ),
      )
      .limit(5),
  ]);

  res.json({
    customers: matchedCustomers,
    facilities: matchedFacilities.map((f) => ({
      id: f.id,
      name: f.name,
      customerName: (f as any).customer?.name ?? '',
    })),
    contracts: matchedContracts,
  });
});

export default router;
