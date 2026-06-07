import { Router, Request, Response } from 'express';
import { eq, desc, sql, inArray, and } from 'drizzle-orm';
import { createPmMeetingSchema, updatePmMeetingSchema } from '@servio/shared';
import { db } from '../../../db';
import { pmWeeklyMeetings, pmMeetingEntries, pmProjects } from '../schema';
import { users } from '../../../db/schema/users';
import { requireRole } from '../../../middleware/role';

const router = Router();
router.use(requireRole('projects', 'access'));

// List meetings (paginated, newest first, optional year filter)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? '20', 10)));
  const offset = (page - 1) * limit;
  const year = req.query.year ? parseInt(req.query.year as string, 10) : null;

  const where = year
    ? sql`extract(year from ${pmWeeklyMeetings.meetingDate}::date) = ${year}`
    : undefined;

  const [meetings, [{ count }]] = await Promise.all([
    db.select({
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
      .where(where)
      .orderBy(desc(pmWeeklyMeetings.meetingDate))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(pmWeeklyMeetings).where(where),
  ]);

  res.json({ data: meetings, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
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
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
  })
    .from(pmMeetingEntries)
    .leftJoin(pmProjects, eq(pmMeetingEntries.projectId, pmProjects.id))
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .where(eq(pmMeetingEntries.meetingId, req.params.id))
    .orderBy(users.name, pmProjects.projectNumber);

  res.json({ ...meeting, entries });
});

// Create meeting with entries
router.post('/', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createPmMeetingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [meeting] = await db.insert(pmWeeklyMeetings).values({
    meetingDate: parsed.data.meetingDate,
    notes: parsed.data.notes ?? null,
    createdById: req.auth!.userId,
  }).returning();

  if (parsed.data.entries.length > 0) {
    await db.insert(pmMeetingEntries).values(
      parsed.data.entries.map(e => ({
        meetingId: meeting.id,
        projectId: e.projectId,
        entryStatus: e.entryStatus,
        notes: e.notes ?? null,
      }))
    );

    // Auto-complete projects whose entry was marked done
    const doneIds = parsed.data.entries.filter(e => e.entryStatus === 'completed').map(e => e.projectId);
    if (doneIds.length > 0) {
      await db.update(pmProjects)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(inArray(pmProjects.id, doneIds));
    }
  }

  res.status(201).json(meeting);
});

// Update meeting (notes + entries)
router.patch('/:id', requireRole('projects', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updatePmMeetingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(pmWeeklyMeetings)
    .set({ notes: parsed.data.notes ?? null, updatedAt: new Date() })
    .where(eq(pmWeeklyMeetings.id, req.params.id))
    .returning();

  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  if (parsed.data.entries) {
    // Replace all entries for this meeting
    await db.delete(pmMeetingEntries).where(eq(pmMeetingEntries.meetingId, req.params.id));
    if (parsed.data.entries.length > 0) {
      await db.insert(pmMeetingEntries).values(
        parsed.data.entries.map(e => ({
          meetingId: req.params.id,
          projectId: e.projectId,
          entryStatus: e.entryStatus,
          notes: e.notes ?? null,
        }))
      );

      // Auto-complete projects whose entry was marked done
      const doneIds = parsed.data.entries.filter(e => e.entryStatus === 'completed').map(e => e.projectId);
      if (doneIds.length > 0) {
        await db.update(pmProjects)
          .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
          .where(inArray(pmProjects.id, doneIds));
      }
    }
  }

  res.json(updated);
});

// Delete meeting
router.delete('/:id', requireRole('projects', 'delete'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.delete(pmWeeklyMeetings).where(eq(pmWeeklyMeetings.id, req.params.id)).returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
});

// Get active projects for meeting form — includes last meeting entry per project
router.get('/active-projects/list', async (_req: Request, res: Response): Promise<void> => {
  const result = await db.execute(sql`
    SELECT
      p.id, p.project_number, p.name, p.priority, p.status,
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
      ORDER BY wm.meeting_date DESC
      LIMIT 1
    ) le ON true
    WHERE p.status = 'active'
    ORDER BY u.name NULLS LAST, p.project_number
  `);

  const projects = (result.rows as any[]).map(r => ({
    id: r.id,
    projectNumber: r.project_number,
    name: r.name,
    priority: r.priority,
    status: r.status,
    employeeId: r.employee_id,
    employeeName: r.employee_name,
    lastEntryStatus: r.last_entry_status ?? null,
    lastEntryNotes: r.last_entry_notes ?? null,
    lastMeetingDate: r.last_meeting_date ?? null,
  }));

  res.json(projects);
});

export default router;
