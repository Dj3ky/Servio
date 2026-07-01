import { Router, Request, Response } from 'express';
import { eq, ne, sql, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../../../db';
import { pmProjects, pmWeeklyMeetings, pmMeetingEntries, pmProjectInvoices } from '../schema';
import { users } from '../../../db/schema/users';
import { requireRole } from '../../../middleware/role';

const router = Router();
router.use(requireRole('projects', 'access'));

// Summary by status
router.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  const [statusCounts, totals, employeeStats] = await Promise.all([
    db.select({
      status: pmProjects.status,
      count: sql<number>`count(*)`,
    })
      .from(pmProjects)
      .groupBy(pmProjects.status),

    db.select({
      totalContractValue: sql<string>`coalesce(sum(contract_value), 0)`,
      totalInvoiced: sql<string>`coalesce(sum(invoiced_amount), 0)`,
      totalRemaining: sql<string>`coalesce(sum(contract_value - invoiced_amount), 0)`,
    }).from(pmProjects).where(ne(pmProjects.status, 'completed')),

    db.select({
      employeeId: pmProjects.employeeId,
      employeeName: users.name,
      count: sql<number>`count(*)`,
      totalValue: sql<string>`coalesce(sum(contract_value), 0)`,
      totalInvoiced: sql<string>`coalesce(sum(invoiced_amount), 0)`,
    })
      .from(pmProjects)
      .leftJoin(users, eq(pmProjects.employeeId, users.id))
      .where(ne(pmProjects.status, 'completed'))
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

// Revenue summary
router.get('/revenue', async (req: Request, res: Response): Promise<void> => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const conditions = [];
  if (from) conditions.push(gte(pmProjects.startDate, from));
  if (to) conditions.push(lte(pmProjects.endDate, to));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [revenue, byEmployee] = await Promise.all([
    db.select({
      status: pmProjects.status,
      contractValue: sql<string>`coalesce(sum(contract_value), 0)`,
      invoicedAmount: sql<string>`coalesce(sum(invoiced_amount), 0)`,
      remaining: sql<string>`coalesce(sum(contract_value - invoiced_amount), 0)`,
      count: sql<number>`count(*)`,
    })
      .from(pmProjects)
      .where(where)
      .groupBy(pmProjects.status),

    db.select({
      employeeId: pmProjects.employeeId,
      employeeName: users.name,
      contractValue: sql<string>`coalesce(sum(contract_value), 0)`,
      invoicedAmount: sql<string>`coalesce(sum(invoiced_amount), 0)`,
      count: sql<number>`count(*)`,
    })
      .from(pmProjects)
      .leftJoin(users, eq(pmProjects.employeeId, users.id))
      .where(where)
      .groupBy(pmProjects.employeeId, users.name)
      .orderBy(desc(sql`sum(contract_value)`)),
  ]);

  res.json({ revenue, byEmployee });
});

// Overdue projects (past end_date and not completed)
router.get('/overdue', async (_req: Request, res: Response): Promise<void> => {
  const today = new Date().toISOString().split('T')[0];

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
      lte(pmProjects.endDate, today),
      sql`${pmProjects.status} != 'completed'`,
      sql`${pmProjects.endDate} is not null`,
    ))
    .orderBy(pmProjects.endDate);

  res.json(projects);
});

// Workload view — all active projects grouped by employee
router.get('/workload', async (_req: Request, res: Response): Promise<void> => {
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
    .where(eq(pmProjects.status, 'active'))
    .orderBy(users.name, pmProjects.priority);

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
    .where(and(
      eq(pmProjectInvoices.direction, 'issued'),
      sql`extract(year from ${pmProjectInvoices.invoiceDate}::date) = ${year}`,
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
router.get('/outstanding', async (_req: Request, res: Response): Promise<void> => {
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
    ))
    .orderBy(desc(sql`${pmProjects.contractValue} - ${pmProjects.invoicedAmount}`));

  res.json(projects);
});

export default router;
