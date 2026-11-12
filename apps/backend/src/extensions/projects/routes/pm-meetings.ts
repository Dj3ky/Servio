import { Router, Request, Response } from 'express';
import { eq, ne, desc, sql, inArray, and, or } from 'drizzle-orm';
import { createPmMeetingSchema, updatePmMeetingSchema, type CreatePmMeeting } from '@servio/shared';
import { db } from '../../../db';
import { pmWeeklyMeetings, pmMeetingEntries, pmProjects, pmProjectTasks } from '../schema';
import { selectTasks } from '../tasks';
import { notifyTasksAssigned, markTaskNotificationsRead } from '../taskNotifications';
import { users } from '../../../db/schema/users';
import { requireRole } from '../../../middleware/role';

const router = Router();
router.use(requireRole('projects', 'access'));

// List meetings (paginated, newest first, optional year filter and text search)
// ?q= matches the meeting notes, entry notes, and the names / numbers of the projects discussed
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? '20', 10)));
  const offset = (page - 1) * limit;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';

  const conditions = [];
  if (year) conditions.push(sql`extract(year from ${pmWeeklyMeetings.meetingDate}::date) = ${year}`);
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    conditions.push(sql`(${pmWeeklyMeetings.notes} ilike ${pattern} or exists (
      select 1 from pm_meeting_entries me join pm_projects p on p.id = me.project_id
      where me.meeting_id = ${pmWeeklyMeetings.id}
        and (me.notes ilike ${pattern} or p.name ilike ${pattern} or p.project_number ilike ${pattern})))`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [meetings, [{ count }]] = await Promise.all([
    db.select({
      id: pmWeeklyMeetings.id,
      meetingDate: pmWeeklyMeetings.meetingDate,
      notes: pmWeeklyMeetings.notes,
      createdById: pmWeeklyMeetings.createdById,
      createdByName: users.name,
      createdAt: pmWeeklyMeetings.createdAt,
      updatedAt: pmWeeklyMeetings.updatedAt,
      // Per-meeting counts for the list cards
      projectCount: sql<number>`(select count(*)::int from pm_meeting_entries me where me.meeting_id = ${pmWeeklyMeetings.id})`,
      notedCount: sql<number>`(select count(*)::int from pm_meeting_entries me where me.meeting_id = ${pmWeeklyMeetings.id} and coalesce(trim(me.notes), '') <> '')`,
      completedCount: sql<number>`(select count(*)::int from pm_meeting_entries me where me.meeting_id = ${pmWeeklyMeetings.id} and me.entry_status = 'completed')`,
      onHoldCount: sql<number>`(select count(*)::int from pm_meeting_entries me where me.meeting_id = ${pmWeeklyMeetings.id} and me.entry_status = 'on_hold')`,
      tasksCreated: sql<number>`(select count(*)::int from pm_project_tasks t where t.meeting_id = ${pmWeeklyMeetings.id})`,
      tasksClosed: sql<number>`(select count(*)::int from pm_project_tasks t where t.completed_meeting_id = ${pmWeeklyMeetings.id})`,
    })
      .from(pmWeeklyMeetings)
      .leftJoin(users, eq(pmWeeklyMeetings.createdById, users.id))
      .where(where)
      .orderBy(desc(pmWeeklyMeetings.meetingDate), desc(pmWeeklyMeetings.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(pmWeeklyMeetings).where(where),
  ]);

  res.json({ data: meetings, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

// Summary for the top of the meetings page.
// ?today=YYYY-MM-DD is the user's local date, so "overdue" matches what the task lists show.
router.get('/stats/summary', async (req: Request, res: Response): Promise<void> => {
  const today = typeof req.query.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today) ? req.query.today : null;
  const result = await db.execute(sql`
    SELECT
      (SELECT max(meeting_date) FROM pm_weekly_meetings) AS last_meeting_date,
      (SELECT count(*)::int FROM pm_projects WHERE status = 'active') AS active_projects,
      (SELECT count(*)::int FROM pm_project_tasks WHERE status = 'open') AS open_tasks,
      (SELECT count(*)::int FROM pm_project_tasks WHERE status = 'open' AND due_date < ${today ?? sql`current_date`}::date) AS overdue_tasks
  `);
  const r = result.rows[0] as any;
  res.json({
    lastMeetingDate: r.last_meeting_date ?? null,
    activeProjects: Number(r.active_projects ?? 0),
    openTasks: Number(r.open_tasks ?? 0),
    overdueTasks: Number(r.overdue_tasks ?? 0),
  });
});

// Get single meeting with entries + project info
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const [meeting] = await db.select({
    id: pmWeeklyMeetings.id,
    meetingDate: pmWeeklyMeetings.meetingDate,
    notes: pmWeeklyMeetings.notes,
    createdById: pmWeeklyMeetings.createdById,
    createdByName: users.name,
    createdAt: pmWeeklyMeetings.createdAt,
    updatedAt: pmWeeklyMeetings.updatedAt,
  })
    .from(pmWeeklyMeetings)
    .leftJoin(users, eq(pmWeeklyMeetings.createdById, users.id))
    .where(eq(pmWeeklyMeetings.id, req.params.id))
    .limit(1);

  if (!meeting) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const entries = await db.select({
    id: pmMeetingEntries.id,
    meetingId: pmMeetingEntries.meetingId,
    projectId: pmMeetingEntries.projectId,
    entryStatus: pmMeetingEntries.entryStatus,
    notes: pmMeetingEntries.notes,
    createdAt: pmMeetingEntries.createdAt,
    projectNumber: pmProjects.projectNumber,
    projectName: pmProjects.name,
    projectStatus: pmProjects.status,
    projectPriority: pmProjects.priority,
    projectSortIndex: pmProjects.sortIndex,
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
  })
    .from(pmMeetingEntries)
    .leftJoin(pmProjects, eq(pmMeetingEntries.projectId, pmProjects.id))
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .where(eq(pmMeetingEntries.meetingId, req.params.id))
    .orderBy(pmProjects.sortIndex);

  // Tasks created or closed in this meeting
  const tasks = await selectTasks(or(eq(pmProjectTasks.meetingId, req.params.id), eq(pmProjectTasks.completedMeetingId, req.params.id)));

  // Neighbouring meetings for the previous / next buttons (same order as the list)
  const key = sql`(${pmWeeklyMeetings.meetingDate}, ${pmWeeklyMeetings.createdAt})`;
  const self = sql`(select m.meeting_date, m.created_at from pm_weekly_meetings m where m.id = ${meeting.id})`;
  const [[prev], [next]] = await Promise.all([
    db.select({ id: pmWeeklyMeetings.id, meetingDate: pmWeeklyMeetings.meetingDate }).from(pmWeeklyMeetings)
      .where(sql`${key} < ${self}`)
      .orderBy(desc(pmWeeklyMeetings.meetingDate), desc(pmWeeklyMeetings.createdAt)).limit(1),
    db.select({ id: pmWeeklyMeetings.id, meetingDate: pmWeeklyMeetings.meetingDate }).from(pmWeeklyMeetings)
      .where(sql`${key} > ${self}`)
      .orderBy(pmWeeklyMeetings.meetingDate, pmWeeklyMeetings.createdAt).limit(1),
  ]);

  res.json({ ...meeting, entries, tasks, prev: prev ?? null, next: next ?? null });
});

// Tasks for the meeting form: all open tasks, plus (when editing) tasks created or closed in that meeting
router.get('/tasks/list', async (req: Request, res: Response): Promise<void> => {
  const meetingId = typeof req.query.meetingId === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.meetingId) ? req.query.meetingId : null;
  const open = eq(pmProjectTasks.status, 'open');
  res.json(await selectTasks(meetingId
    ? or(open, eq(pmProjectTasks.meetingId, meetingId), eq(pmProjectTasks.completedMeetingId, meetingId))
    : open));
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EntryInput = { projectId: string; entryStatus: string; notes?: string | null };
type TaskChanges = NonNullable<CreatePmMeeting['tasks']>;

// Task changes from the meeting form: new tasks are linked to this meeting, and so are tasks closed here.
// Returns the ids of the created tasks.
async function applyTaskChanges(tx: Tx, meetingId: string, userId: string, changes: TaskChanges | undefined): Promise<string[]> {
  if (!changes) return [];
  let createdIds: string[] = [];
  if (changes.create.length > 0) {
    const created = await tx.insert(pmProjectTasks).values(changes.create.map(c => ({
      projectId: c.projectId,
      title: c.title,
      assigneeId: c.assigneeId ?? null,
      dueDate: c.dueDate || null,
      meetingId,
      createdById: userId,
    }))).returning({ id: pmProjectTasks.id });
    createdIds = created.map(t => t.id);
  }
  if (changes.complete.length > 0) {
    await tx.update(pmProjectTasks)
      .set({ status: 'done', completedAt: new Date(), completedMeetingId: meetingId, updatedAt: new Date() })
      .where(and(inArray(pmProjectTasks.id, changes.complete), eq(pmProjectTasks.status, 'open')));
    await markTaskNotificationsRead(changes.complete, tx);
  }
  if (changes.reopen.length > 0) {
    await tx.update(pmProjectTasks)
      .set({ status: 'open', completedAt: null, completedMeetingId: null, dueNotifiedAt: null, overdueNotifiedAt: null, updatedAt: new Date() })
      .where(inArray(pmProjectTasks.id, changes.reopen));
  }
  return createdIds;
}

async function insertEntries(tx: Tx, meetingId: string, entries: EntryInput[]) {
  if (entries.length === 0) return;
  await tx.insert(pmMeetingEntries).values(entries.map(e => ({
    meetingId,
    projectId: e.projectId,
    entryStatus: e.entryStatus,
    notes: e.notes ?? null,
  })));

  // Auto-complete projects whose entry was marked done
  const doneIds = entries.filter(e => e.entryStatus === 'completed').map(e => e.projectId);
  if (doneIds.length > 0) {
    await tx.update(pmProjects)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(pmProjects.id, doneIds), ne(pmProjects.status, 'completed')));
  }
}

// Create meeting with entries
router.post('/', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createPmMeetingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const { meeting, createdTaskIds } = await db.transaction(async (tx) => {
    const [created] = await tx.insert(pmWeeklyMeetings).values({
      meetingDate: parsed.data.meetingDate,
      notes: parsed.data.notes ?? null,
      createdById: req.auth!.userId,
    }).returning();
    await insertEntries(tx, created.id, parsed.data.entries);
    const taskIds = await applyTaskChanges(tx, created.id, req.auth!.userId, parsed.data.tasks);
    return { meeting: created, createdTaskIds: taskIds };
  });

  // After commit, so notifications never point at tasks that were rolled back
  await notifyTasksAssigned(createdTaskIds, req.auth!.userId);
  res.status(201).json(meeting);
});

// Update meeting (notes + entries)
router.patch('/:id', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmMeetingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  let createdTaskIds: string[] = [];
  const updated = await db.transaction(async (tx) => {
    const [meeting] = await tx.update(pmWeeklyMeetings)
      .set({
        notes: parsed.data.notes ?? null,
        ...(parsed.data.meetingDate ? { meetingDate: parsed.data.meetingDate } : {}),
        updatedAt: new Date(),
      })
      .where(eq(pmWeeklyMeetings.id, req.params.id))
      .returning();
    if (!meeting) return meeting;
    createdTaskIds = await applyTaskChanges(tx, req.params.id, req.auth!.userId, parsed.data.tasks);
    if (!parsed.data.entries) return meeting;

    const previouslyDone = await tx.select({ projectId: pmMeetingEntries.projectId })
      .from(pmMeetingEntries)
      .where(and(eq(pmMeetingEntries.meetingId, req.params.id), eq(pmMeetingEntries.entryStatus, 'completed')));

    // Replace all entries for this meeting
    await tx.delete(pmMeetingEntries).where(eq(pmMeetingEntries.meetingId, req.params.id));
    await insertEntries(tx, req.params.id, parsed.data.entries);

    // Reopen projects that this meeting had completed but no longer does,
    // unless another meeting also marked them completed
    const stillDone = new Set(parsed.data.entries.filter(e => e.entryStatus === 'completed').map(e => e.projectId));
    const reopenIds = previouslyDone.map(r => r.projectId).filter(id => !stillDone.has(id));
    if (reopenIds.length > 0) {
      await tx.update(pmProjects)
        .set({ status: 'active', completedAt: null, updatedAt: new Date() })
        .where(and(
          inArray(pmProjects.id, reopenIds),
          eq(pmProjects.status, 'completed'),
          sql`not exists (select 1 from ${pmMeetingEntries} where ${pmMeetingEntries.projectId} = ${pmProjects.id} and ${pmMeetingEntries.entryStatus} = 'completed')`,
        ));
    }
    return meeting;
  });

  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }
  await notifyTasksAssigned(createdTaskIds, req.auth!.userId);
  res.json(updated);
});

// Delete meeting
router.delete('/:id', requireRole('projects', 'delete'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.delete(pmWeeklyMeetings).where(eq(pmWeeklyMeetings.id, req.params.id)).returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
});

// Get active projects for meeting form — includes last meeting entry per project
// Optional ?before=YYYY-MM-DD limits "last meeting" to meetings before that date (used when editing a meeting)
router.get('/active-projects/list', async (req: Request, res: Response): Promise<void> => {
  const before = typeof req.query.before === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.before) ? req.query.before : null;
  const result = await db.execute(sql`
    SELECT
      p.id, p.project_number, p.name, p.priority, p.status, p.sort_index, p.notes,
      p.employee_id, u.name AS employee_name,
      le.entry_status AS last_entry_status,
      le.notes AS last_entry_notes,
      le.meeting_date AS last_meeting_date
    FROM pm_projects p
    LEFT JOIN users u ON p.employee_id = u.id
    LEFT JOIN LATERAL (
      SELECT me.entry_status, me.notes, wm.meeting_date
      FROM pm_meeting_entries me
      JOIN pm_weekly_meetings wm ON me.meeting_id = wm.id
      WHERE me.project_id = p.id
      ${before ? sql`AND wm.meeting_date < ${before}` : sql``}
      ORDER BY wm.meeting_date DESC
      LIMIT 1
    ) le ON true
    WHERE p.status = 'active'
    ORDER BY p.sort_index
  `);

  const projects = (result.rows as any[]).map(r => ({
    id: r.id,
    projectNumber: r.project_number,
    name: r.name,
    priority: r.priority,
    status: r.status,
    sortIndex: r.sort_index,
    notes: r.notes ?? null,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    lastEntryStatus: r.last_entry_status ?? null,
    lastEntryNotes: r.last_entry_notes ?? null,
    lastMeetingDate: r.last_meeting_date ?? null,
  }));

  res.json(projects);
});

export default router;
