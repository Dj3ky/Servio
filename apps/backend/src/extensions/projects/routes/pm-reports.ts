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
    .orderBy(users.name, pmProjects.projectNumber);

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

// Workload view — all active projects grouped by employee
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
    .where(and(eq(pmProjects.status, 'active'), customerFilter(req)))
    .orderBy(pmProjects.createdAt);

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

// Monthly revenue from invoices for a given year
router.get('/revenue-trend', async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string ?? String(new Date().getFullYear()), 10);

  const rows = await db.select({
    month: sql<string>`to_char(${pmProjectInvoices.invoiceDate}::date, 'YYYY-MM')`,
    revenue: sql<string>`coalesce(sum(${pmProjectInvoices.amount}), 0)`,
    invoiceCount: sql<number>`count(*)`,
  })
    .from(pmProjectInvoices)
    .innerJoin(pmProjects, eq(pmProjectInvoices.projectId, pmProjects.id))
    .where(and(
      eq(pmProjectInvoices.direction, 'issued'),
      sql`extract(year from ${pmProjectInvoices.invoiceDate}::date) = ${year}`,
      customerFilter(req),
    ))
    .groupBy(sql`to_char(${pmProjectInvoices.invoiceDate}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${pmProjectInvoices.invoiceDate}::date, 'YYYY-MM')`);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const filled = MONTHS.map((name, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const found = rows.find(r => r.month === key);
    return { month: name, revenue: parseFloat(found?.revenue ?? '0'), invoiceCount: Number(found?.invoiceCount ?? 0) };
  });

  res.json(filled);
});

// Projects completed per month for a given year
router.get('/completions', async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string ?? String(new Date().getFullYear()), 10);

  const rows = await db.select({
    month: sql<string>`to_char(${pmProjects.completedAt}, 'YYYY-MM')`,
    count: sql<number>`count(*)`,
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

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const filled = MONTHS.map((name, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const found = rows.find(r => r.month === key);
    return { month: name, count: Number(found?.count ?? 0) };
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
