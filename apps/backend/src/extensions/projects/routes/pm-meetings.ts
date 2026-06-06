import { Router, Request, Response } from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import { createPmMeetingSchema, updatePmMeetingSchema } from '@servio/shared';
import { db } from '../../../db';
import { pmWeeklyMeetings, pmMeetingEntries, pmProjects } from '../schema';
import { users } from '../../../db/schema/users';
import { requireRole } from '../../../middleware/role';

const router = Router();
router.use(requireRole('projects', 'access'));

// List meetings (paginated, newest first)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string ?? '20', 10)));
  const offset = (page - 1) * limit;

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
      .orderBy(desc(pmWeeklyMeetings.meetingDate))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(pmWeeklyMeetings),
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
  })
    .from(pmMeetingEntries)
    .leftJoin(pmProjects, eq(pmMeetingEntries.projectId, pmProjects.id))
    .where(eq(pmMeetingEntries.meetingId, req.params.id))
    .orderBy(pmProjects.projectNumber);

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

// Get active projects for meeting form (only active projects)
router.get('/active-projects/list', async (_req: Request, res: Response): Promise<void> => {
  const projects = await db.select({
    id: pmProjects.id,
    projectNumber: pmProjects.projectNumber,
    name: pmProjects.name,
    priority: pmProjects.priority,
    status: pmProjects.status,
    employeeId: pmProjects.employeeId,
    employeeName: users.name,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .where(eq(pmProjects.status, 'active'))
    .orderBy(users.name, pmProjects.projectNumber);

  res.json(projects);
});

export default router;
