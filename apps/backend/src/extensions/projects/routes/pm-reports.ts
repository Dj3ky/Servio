import { Router, Request, Response } from 'express';
import { eq, ne, sql, and, desc, type SQL } from 'drizzle-orm';
import { db } from '../../../db';
import { pmProjects, pmWeeklyMeetings, pmMeetingEntries, pmProjectInvoices } from '../schema';
import { users } from '../../../db/schema/users';
import { requireRole } from '../../../middleware/role';

const router = Router();
router.use(requireRole('projects', 'access'));

// Optional ?customer= filter shared by all reports. Customer names are free text,
// so they match ignoring case and surrounding spaces ("Petrol " = "PETROL").
function customerFilter(req: Request): SQL | undefined {
  const customer = typeof req.query.customer === 'string' ? req.query.customer.trim() : '';
  return customer ? sql`lower(trim(${pmProjects.customerName})) = lower(${customer})` : undefined;
}

// Summary by status
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  const customer = customerFilter(req);
  const [statusCounts, totals, employeeStats] = await Promise.all([
    db.select({
      status: pmProjects.status,
      count: sql<number>`count(*)`,
    })
      .from(pmProjects)
      .where(customer)
      .groupBy(pmProjects.status),

    db.select({
      totalContractValue: sql<string>`coalesce(sum(contract_value), 0)`,
      totalInvoiced: sql<string>`coalesce(sum(invoiced_amount), 0)`,
      totalRemaining: sql<string>`coalesce(sum(contract_value - invoiced_amount), 0)`,
    }).from(pmProjects).where(and(ne(pmProjects.status, 'completed'), customer)),

    db.select({
      employeeId: pmProjects.employeeId,
      employeeName: users.name,
      count: sql<number>`count(*)`,
      totalValue: sql<string>`coalesce(sum(contract_value), 0)`,
      totalInvoiced: sql<string>`coalesce(sum(invoiced_amount), 0)`,
    })
      .from(pmProjects)
      .leftJoin(users, eq(pmProjects.employeeId, users.id))
      .where(and(ne(pmProjects.status, 'completed'), customer))
      .groupBy(pmProjects.employeeId, users.name)
      .orderBy(desc(sql`count(*)`)),
  ]);

  res.json({ statusCounts, totals: totals[0], employeeStats });
});

// Projects by employee
router.get('/by-employee', async (req: Request, res: Response): Promise<void> => {
  const employeeId = req.query.employeeId as string | undefined;
  const status = req.query.status as string | undefined;

  const conditions = [];
  if (employeeId) conditions.push(eq(pmProjects.employeeId, employeeId));
  if (status) conditions.push(eq(pmProjects.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const projects = await db.select({
    id: pmProjects.id,
    projectNumber: pmProjects.projectNumber,
    name: pmProjects.name,
    status: pmProjects.status,
    priority: pmProjects.priority,
    startDate: pmProjects.startDate,
    endDate: pmProjects.endDate,
    contractValue: pmProjects.contractValue,
    invoicedAmount: pmProjects.invoicedAmount,
    employeeName: users.name,
    customerName: pmProjects.customerName,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .where(where)
    .orderBy(users.name, pmProjects.sortIndex);

  res.json(projects);
});

// Per customer: project counts and money, all statuses. Spelling variants of one name are grouped together;
// `variants` > 1 means the same customer is written in more than one way.
router.get('/by-customer', async (_req: Request, res: Response): Promise<void> => {
  const key = sql`coalesce(lower(trim(${pmProjects.customerName})), '')`;
  const rows = await db.select({
    // Most used spelling is shown as the name
    customerName: sql<string | null>`nullif(mode() within group (order by trim(${pmProjects.customerName})), '')`,
    variants: sql<number>`count(distinct trim(${pmProjects.customerName}))::int`,
    activeCount: sql<number>`(count(*) filter (where ${pmProjects.status} <> 'completed'))::int`,
    completedCount: sql<number>`(count(*) filter (where ${pmProjects.status} = 'completed'))::int`,
    contractValue: sql<string>`coalesce(sum(${pmProjects.contractValue}), 0)`,
    invoiced: sql<string>`coalesce(sum(${pmProjects.invoicedAmount}), 0)`,
    remainingActive: sql<string>`coalesce(sum(${pmProjects.contractValue} - ${pmProjects.invoicedAmount}) filter (where ${pmProjects.status} <> 'completed'), 0)`,
    unbilledCompleted: sql<string>`coalesce(sum(greatest(${pmProjects.contractValue} - ${pmProjects.invoicedAmount}, 0)) filter (where ${pmProjects.status} = 'completed'), 0)`,
  })
    .from(pmProjects)
    .groupBy(key)
    .orderBy(desc(sql`coalesce(sum(${pmProjects.contractValue}), 0)`));

  res.json(rows);
});

// Overdue projects (end_date before today and not completed)
router.get('/overdue', async (req: Request, res: Response): Promise<void> => {
  const projects = await db.select({
    id: pmProjects.id,
    projectNumber: pmProjects.projectNumber,
    name: pmProjects.name,
    status: pmProjects.status,
    priority: pmProjects.priority,
    endDate: pmProjects.endDate,
    contractValue: pmProjects.contractValue,
    invoicedAmount: pmProjects.invoicedAmount,
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
    customerName: pmProjects.customerName,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .where(and(
      sql`${pmProjects.endDate} < current_date`,
      sql`${pmProjects.status} != 'completed'`,
      customerFilter(req),
    ))
    .orderBy(pmProjects.endDate);

  res.json(projects);
});

// Workload view — all open (not completed) projects grouped by employee,
// the same projects the summary totals count
router.get('/workload', async (req: Request, res: Response): Promise<void> => {
  const projects = await db.select({
    id: pmProjects.id,
    projectNumber: pmProjects.projectNumber,
    name: pmProjects.name,
    priority: pmProjects.priority,
    status: pmProjects.status,
    endDate: pmProjects.endDate,
    contractValue: pmProjects.contractValue,
    invoicedAmount: pmProjects.invoicedAmount,
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
    customerName: pmProjects.customerName,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .where(and(ne(pmProjects.status, 'completed'), customerFilter(req)))
    .orderBy(pmProjects.sortIndex);

  // Group by employee
  const grouped: Record<string, { employeeId: string | null; employeeName: string | null; projects: typeof projects }> = {};
  for (const p of projects) {
    const key = p.employeeId ?? '__unassigned__';
    if (!grouped[key]) grouped[key] = { employeeId: p.employeeId, employeeName: p.employeeName, projects: [] };
    grouped[key].projects.push(p);
  }

  res.json(Object.values(grouped));
});

// Meeting history for a project
router.get('/project/:projectId/meetings', async (req: Request, res: Response): Promise<void> => {
  const entries = await db.select({
    id: pmMeetingEntries.id,
    entryStatus: pmMeetingEntries.entryStatus,
    notes: pmMeetingEntries.notes,
    createdAt: pmMeetingEntries.createdAt,
    meetingId: pmWeeklyMeetings.id,
    meetingDate: pmWeeklyMeetings.meetingDate,
    meetingNotes: pmWeeklyMeetings.notes,
  })
    .from(pmMeetingEntries)
    .leftJoin(pmWeeklyMeetings, eq(pmMeetingEntries.meetingId, pmWeeklyMeetings.id))
    .where(eq(pmMeetingEntries.projectId, req.params.projectId))
    .orderBy(desc(pmWeeklyMeetings.meetingDate));

  res.json(entries);
});

function parseYear(req: Request) {
  const year = parseInt(String(req.query.year ?? ''), 10);
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

// Monthly revenue from issued invoices for a given year, with the year before for comparison.
// `month` is 1–12; the frontend shows month names in the user's language.
router.get('/revenue-trend', async (req: Request, res: Response): Promise<void> => {
  const year = parseYear(req);
  const monthKey = sql`to_char(${pmProjectInvoices.invoiceDate}::date, 'YYYY-MM')`;

  const rows = await db.select({
    month: sql<string>`${monthKey}`,
    revenue: sql<string>`coalesce(sum(${pmProjectInvoices.amount}), 0)`,
    invoiceCount: sql<number>`count(*)::int`,
  })
    .from(pmProjectInvoices)
    .innerJoin(pmProjects, eq(pmProjectInvoices.projectId, pmProjects.id))
    .where(and(
      eq(pmProjectInvoices.direction, 'issued'),
      sql`extract(year from ${pmProjectInvoices.invoiceDate}::date) in (${year}, ${year - 1})`,
      customerFilter(req),
    ))
    .groupBy(monthKey);

  const byKey = new Map(rows.map(r => [r.month, r]));
  const filled = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const cur = byKey.get(`${year}-${mm}`);
    const prev = byKey.get(`${year - 1}-${mm}`);
    return {
      month: i + 1,
      revenue: parseFloat(cur?.revenue ?? '0'),
      invoiceCount: Number(cur?.invoiceCount ?? 0),
      prevRevenue: parseFloat(prev?.revenue ?? '0'),
    };
  });

  res.json(filled);
});

// Remaining value of open projects, grouped by when their deadline falls
router.get('/pipeline', async (req: Request, res: Response): Promise<void> => {
  const bucket = sql<string>`case
    when ${pmProjects.endDate} is null then 'none'
    when ${pmProjects.endDate} < current_date then 'overdue'
    when ${pmProjects.endDate} < date_trunc('month', current_date) + interval '1 month' then 'thisMonth'
    when ${pmProjects.endDate} < date_trunc('month', current_date) + interval '2 months' then 'nextMonth'
    when ${pmProjects.endDate} < date_trunc('month', current_date) + interval '5 months' then 'next3Months'
    else 'later' end`;

  const rows = await db.select({
    bucket,
    count: sql<number>`count(*)::int`,
    remaining: sql<string>`coalesce(sum(greatest(coalesce(${pmProjects.contractValue}, 0) - ${pmProjects.invoicedAmount}, 0)), 0)`,
  })
    .from(pmProjects)
    .where(and(ne(pmProjects.status, 'completed'), customerFilter(req)))
    .groupBy(bucket);

  const ORDER = ['overdue', 'thisMonth', 'nextMonth', 'next3Months', 'later', 'none'];
  res.json(ORDER.map(key => {
    const found = rows.find(r => r.bucket === key);
    return { bucket: key, count: Number(found?.count ?? 0), remaining: parseFloat(found?.remaining ?? '0') };
  }));
});

// Projects completed per month for a given year
router.get('/completions', async (req: Request, res: Response): Promise<void> => {
  const year = parseYear(req);

  const rows = await db.select({
    month: sql<string>`to_char(${pmProjects.completedAt}, 'YYYY-MM')`,
    count: sql<number>`count(*)::int`,
  })
    .from(pmProjects)
    .where(and(
      eq(pmProjects.status, 'completed'),
      sql`${pmProjects.completedAt} is not null`,
      sql`extract(year from ${pmProjects.completedAt}) = ${year}`,
      customerFilter(req),
    ))
    .groupBy(sql`to_char(${pmProjects.completedAt}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${pmProjects.completedAt}, 'YYYY-MM')`);

  const filled = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const found = rows.find(r => r.month === key);
    return { month: i + 1, count: Number(found?.count ?? 0) };
  });

  res.json(filled);
});

// Completed projects with uninvoiced balance
router.get('/outstanding', async (req: Request, res: Response): Promise<void> => {
  const projects = await db.select({
    id: pmProjects.id,
    projectNumber: pmProjects.projectNumber,
    name: pmProjects.name,
    customerName: pmProjects.customerName,
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
    contractValue: pmProjects.contractValue,
    invoicedAmount: pmProjects.invoicedAmount,
    completedAt: pmProjects.completedAt,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .where(and(
      eq(pmProjects.status, 'completed'),
      sql`${pmProjects.contractValue} is not null`,
      sql`${pmProjects.contractValue} > ${pmProjects.invoicedAmount}`,
      customerFilter(req),
    ))
    .orderBy(desc(sql`${pmProjects.contractValue} - ${pmProjects.invoicedAmount}`));

  res.json(projects);
});

export default router;
