import { Router, Request, Response } from 'express';
import { eq, sql, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../../../db';
import { pmProjects, pmCustomers, pmFacilities, pmWeeklyMeetings, pmMeetingEntries } from '../schema';
import { users } from '../../../db/schema/users';
import { requireAuth } from '../../../middleware/auth';

const router = Router();
router.use(requireAuth);

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
    }).from(pmProjects),

    db.select({
      employeeId: pmProjects.employeeId,
      employeeName: users.name,
      count: sql<number>`count(*)`,
      totalValue: sql<string>`coalesce(sum(contract_value), 0)`,
      totalInvoiced: sql<string>`coalesce(sum(invoiced_amount), 0)`,
    })
      .from(pmProjects)
      .leftJoin(users, eq(pmProjects.employeeId, users.id))
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
    customerName: pmCustomers.name,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .leftJoin(pmCustomers, eq(pmProjects.pmCustomerId, pmCustomers.id))
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
    customerName: pmCustomers.name,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .leftJoin(pmCustomers, eq(pmProjects.pmCustomerId, pmCustomers.id))
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
    customerName: pmCustomers.name,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .leftJoin(pmCustomers, eq(pmProjects.pmCustomerId, pmCustomers.id))
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

export default router;
