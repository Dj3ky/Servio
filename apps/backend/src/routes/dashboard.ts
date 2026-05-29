import { Router, Request, Response } from 'express';
import { eq, sql, and, gte, lte, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { contracts, reviews, invoices } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  const [
    [{ activeContracts }],
    [{ pendingReviews }],
    [{ completedThisMonth }],
    [{ pendingInvoices }],
    pendingReviewsList,
    pendingInvoicesList,
  ] = await Promise.all([
    db.select({ activeContracts: sql<number>`count(*)` }).from(contracts).where(eq(contracts.isActive, true)),
    db.select({ pendingReviews: sql<number>`count(*)` }).from(reviews).where(eq(reviews.status, 'pending')),
    db.select({ completedThisMonth: sql<number>`count(*)` }).from(reviews).where(
      and(eq(reviews.status, 'completed'), gte(reviews.scheduledMonth, monthStart), lte(reviews.scheduledMonth, monthEnd)),
    ),
    db.select({ pendingInvoices: sql<number>`count(*)` }).from(invoices).where(eq(invoices.status, 'pending')),
    db.query.reviews.findMany({
      where: (r, { eq }) => eq(r.status, 'pending'),
      with: { contract: { with: { facility: true, customer: true } } },
      limit: 10,
      orderBy: (r, { asc }) => [asc(r.scheduledMonth)],
    }),
    db.query.invoices.findMany({
      where: (inv, { eq }) => eq(inv.status, 'pending'),
      with: { review: { with: { contract: { with: { facility: true, customer: true } } } } },
      limit: 10,
      orderBy: (inv, { asc }) => [asc(inv.createdAt)],
    }),
  ]);

  // 12-month review completion trend
  const trendMonths: Array<{ month: string; completed: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(now, i);
    const start = format(startOfMonth(d), 'yyyy-MM-dd');
    const end = format(endOfMonth(d), 'yyyy-MM-dd');
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(reviews)
      .where(and(eq(reviews.status, 'completed'), gte(reviews.scheduledMonth, start), lte(reviews.scheduledMonth, end)));
    trendMonths.push({ month: format(d, 'MMM yy'), completed: Number(count) });
  }

  // 12-month revenue trend — sum valueWithoutVat for completed invoices per month
  const rawRevenue = await db
    .select({
      monthKey: sql<string>`to_char(date_trunc('month', ${invoices.completedAt}), 'YYYY-MM')`,
      revenue: sql<string>`COALESCE(SUM(${contracts.valueWithoutVat}::numeric), 0)`,
      invoiceCount: sql<number>`count(*)`,
    })
    .from(invoices)
    .innerJoin(contracts, eq(invoices.contractId, contracts.id))
    .where(and(
      eq(invoices.status, 'completed'),
      isNotNull(invoices.completedAt),
      gte(invoices.completedAt, subMonths(now, 12)),
    ))
    .groupBy(sql`date_trunc('month', ${invoices.completedAt})`)
    .orderBy(sql`date_trunc('month', ${invoices.completedAt})`);

  const revenueMap: Record<string, { revenue: number; invoiceCount: number }> = {};
  rawRevenue.forEach((r) => {
    revenueMap[r.monthKey] = { revenue: parseFloat(r.revenue), invoiceCount: Number(r.invoiceCount) };
  });

  const revenueTrend: Array<{ month: string; revenue: number; invoiceCount: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(now, i);
    const key = format(d, 'yyyy-MM');
    revenueTrend.push({
      month: format(d, 'MMM yy'),
      revenue: revenueMap[key]?.revenue ?? 0,
      invoiceCount: revenueMap[key]?.invoiceCount ?? 0,
    });
  }

  res.json({
    activeContracts: Number(activeContracts),
    pendingReviews: Number(pendingReviews),
    completedThisMonth: Number(completedThisMonth),
    pendingInvoices: Number(pendingInvoices),
    monthlyTrend: trendMonths,
    revenueTrend,
    pendingReviewsList,
    pendingInvoicesList,
  });
});

export default router;
