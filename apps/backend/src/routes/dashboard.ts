import { Router, Request, Response } from 'express';
import { eq, sql, and, gte, lte, lt, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { contracts, reviews, invoices } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { format, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const sevenDaysAgo = subDays(now, 7);
  const thirtyDaysAgo = subDays(now, 30);

  const [
    [{ activeContracts }],
    [{ overdueReviews }],
    [{ openReviewsThisMonth }],
    [{ pendingInvoices }],
    [{ totalThisMonth }],
    [{ completedThisMonth }],
    [{ agingRecent }],
    [{ agingMedium }],
    [{ agingOld }],
    recentCompletedReviews,
    recentCompletedInvoices,
  ] = await Promise.all([
    db.select({ activeContracts: sql<number>`count(*)` }).from(contracts).where(eq(contracts.isActive, true)),
    db.select({ overdueReviews: sql<number>`count(*)` }).from(reviews).where(
      and(
        inArray(reviews.status, ['pending', 'in_progress']),
        lt(reviews.scheduledMonth, monthStart),
      ),
    ),
    db.select({ openReviewsThisMonth: sql<number>`count(*)` }).from(reviews).where(
      and(
        inArray(reviews.status, ['pending', 'in_progress']),
        gte(reviews.scheduledMonth, monthStart),
        lte(reviews.scheduledMonth, monthEnd),
      ),
    ),
    db.select({ pendingInvoices: sql<number>`count(*)` }).from(invoices).where(eq(invoices.status, 'pending')),
    db.select({ totalThisMonth: sql<number>`count(*)` }).from(reviews).where(
      and(gte(reviews.scheduledMonth, monthStart), lte(reviews.scheduledMonth, monthEnd)),
    ),
    db.select({ completedThisMonth: sql<number>`count(*)` }).from(reviews).where(
      and(
        eq(reviews.status, 'completed'),
        gte(reviews.scheduledMonth, monthStart),
        lte(reviews.scheduledMonth, monthEnd),
      ),
    ),
    db.select({ agingRecent: sql<number>`count(*)` }).from(invoices).where(
      and(eq(invoices.status, 'pending'), gte(invoices.createdAt, sevenDaysAgo)),
    ),
    db.select({ agingMedium: sql<number>`count(*)` }).from(invoices).where(
      and(eq(invoices.status, 'pending'), gte(invoices.createdAt, thirtyDaysAgo), lt(invoices.createdAt, sevenDaysAgo)),
    ),
    db.select({ agingOld: sql<number>`count(*)` }).from(invoices).where(
      and(eq(invoices.status, 'pending'), lt(invoices.createdAt, thirtyDaysAgo)),
    ),
    db.query.reviews.findMany({
      where: (r, { eq: eqFn }) => eqFn(r.status, 'completed'),
      with: { contract: { with: { facility: true, customer: true } } },
      limit: 8,
      orderBy: (r, { desc }) => [desc(r.completedAt)],
    }),
    db.query.invoices.findMany({
      where: (inv, { eq: eqFn }) => eqFn(inv.status, 'completed'),
      with: { contract: { with: { facility: true, customer: true } }, review: true },
      limit: 8,
      orderBy: (inv, { desc }) => [desc(inv.completedAt)],
    }),
  ]);

  const recentActivity = [
    ...recentCompletedReviews.map((r) => ({
      type: 'review' as const,
      id: r.id,
      date: (r.completedAt ?? r.updatedAt).toISOString(),
      facilityName: r.contract.facility.name,
      customerName: r.contract.customer.name,
      contractNumber: r.contract.contractNumber,
      scheduledMonth: r.scheduledMonth,
    })),
    ...recentCompletedInvoices.map((inv) => ({
      type: 'invoice' as const,
      id: inv.id,
      date: (inv.completedAt ?? inv.createdAt).toISOString(),
      facilityName: inv.contract.facility.name,
      customerName: inv.contract.customer.name,
      contractNumber: inv.contract.contractNumber,
      scheduledMonth: inv.review.scheduledMonth,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

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
    overdueReviews: Number(overdueReviews),
    openReviewsThisMonth: Number(openReviewsThisMonth),
    pendingInvoices: Number(pendingInvoices),
    monthlyTrend: trendMonths,
    revenueTrend,
    thisMonthProgress: {
      total: Number(totalThisMonth),
      completed: Number(completedThisMonth),
    },
    invoiceAging: {
      recent: Number(agingRecent),
      medium: Number(agingMedium),
      old: Number(agingOld),
    },
    recentActivity,
  });
});

export default router;
