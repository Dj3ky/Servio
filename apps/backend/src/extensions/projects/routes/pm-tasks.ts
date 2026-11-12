import { Router, Request, Response } from 'express';
import { eq, and, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../../db';
import { pmProjectTasks } from '../schema';
import { requireRole } from '../../../middleware/role';
import { getPermissions } from '../../../services/permissionsService';
import { selectTasks, selectRecentDoneTasks } from '../tasks';

const RECENT_DONE_LIMIT = 50;
import { markTaskNotificationsRead, notifyTaskCompleted } from '../taskNotifications';

const router = Router();
router.use(requireRole('projects', 'access'));

function canManage(role: string) {
  const perms = getPermissions() as Record<string, Record<string, string[]>>;
  return (perms.projects?.manage ?? []).includes(role);
}

// Tasks across all projects. ?assignee=me (default) | all | <userId>,
// ?status=open (default) | all (open + the latest RECENT_DONE_LIMIT done tasks).
// Users who can't manage projects only ever get their own tasks.
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { userId, role } = req.auth!;
  const assignee = canManage(role) && typeof req.query.assignee === 'string' ? req.query.assignee : 'me';

  const conditions: SQL[] = [];
  if (assignee === 'me') conditions.push(eq(pmProjectTasks.assigneeId, userId));
  else if (assignee !== 'all') {
    if (!z.string().uuid().safeParse(assignee).success) { res.status(400).json({ error: 'errors.validation' }); return; }
    conditions.push(eq(pmProjectTasks.assigneeId, assignee));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const open = await selectTasks(and(where, eq(pmProjectTasks.status, 'open')));
  // Done tasks are capped to the most recently completed ones so the list doesn't grow forever
  const done = req.query.status === 'all' ? await selectRecentDoneTasks(where, RECENT_DONE_LIMIT) : [];
  res.json([...open, ...done]);
});

// Open / overdue counts of the current user's tasks, for the sidebar badge
router.get('/my-count', async (req: Request, res: Response): Promise<void> => {
  const [counts] = await db.select({
    open: sql<number>`count(*)::int`,
    overdue: sql<number>`(count(*) filter (where ${pmProjectTasks.dueDate} < current_date))::int`,
  })
    .from(pmProjectTasks)
    .where(and(eq(pmProjectTasks.assigneeId, req.auth!.userId), eq(pmProjectTasks.status, 'open')));
  res.json(counts);
});

// Tick a task done / reopen it — allowed for project managers and for the task's own assignee
router.patch('/:taskId/status', async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ status: z.enum(['open', 'done']) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [task] = await db.select({ assigneeId: pmProjectTasks.assigneeId, status: pmProjectTasks.status }).from(pmProjectTasks)
    .where(eq(pmProjectTasks.id, req.params.taskId)).limit(1);
  if (!task) { res.status(404).json({ error: 'errors.not_found' }); return; }
  if (!canManage(req.auth!.role) && task.assigneeId !== req.auth!.userId) { res.status(403).json({ error: 'errors.forbidden' }); return; }

  const done = parsed.data.status === 'done';
  const [updated] = await db.update(pmProjectTasks)
    .set({
      status: parsed.data.status,
      completedAt: done ? new Date() : null,
      completedMeetingId: null,
      // A reopened task should get its reminders again
      ...(done ? {} : { dueNotifiedAt: null, overdueNotifiedAt: null }),
      updatedAt: new Date(),
    })
    .where(eq(pmProjectTasks.id, req.params.taskId))
    .returning();
  if (done) await markTaskNotificationsRead([req.params.taskId]);
  if (done && task.status !== 'done') await notifyTaskCompleted(req.params.taskId, req.auth!.userId);
  res.json(updated);
});

export default router;
