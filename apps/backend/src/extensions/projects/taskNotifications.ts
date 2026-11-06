import cron from 'node-cron';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { notifications } from '../../db/schema';
import { users } from '../../db/schema/users';
import { notifyUser } from '../../services/notify';
import { pmProjects, pmProjectTasks } from './schema';

function taskQuery() {
  return db.select({
    id: pmProjectTasks.id,
    title: pmProjectTasks.title,
    dueDate: pmProjectTasks.dueDate,
    assigneeId: pmProjectTasks.assigneeId,
    assigneeName: users.name,
    projectId: pmProjects.id,
    projectNumber: pmProjects.projectNumber,
    projectName: pmProjects.name,
    projectManagerId: pmProjects.employeeId,
  })
    .from(pmProjectTasks)
    .innerJoin(pmProjects, eq(pmProjectTasks.projectId, pmProjects.id))
    .leftJoin(users, eq(pmProjectTasks.assigneeId, users.id));
}

type TaskInfo = Awaited<ReturnType<typeof taskQuery>>[number];

function formatDue(date: string | null) {
  if (!date) return '';
  const [y, m, d] = date.slice(0, 10).split('-');
  return ` · ${Number(d)}. ${Number(m)}. ${y}`;
}

function message(task: TaskInfo, extra = '') {
  return `${task.title} — ${task.projectNumber} ${task.projectName}${formatDue(task.dueDate)}${extra}`;
}

// A finished or deleted task needs no more attention, so its notifications stop counting as unread
export async function markTaskNotificationsRead(taskIds: string[], executor: Pick<typeof db, 'update'> = db): Promise<void> {
  if (taskIds.length === 0) return;
  await executor.update(notifications).set({ isRead: true })
    .where(and(inArray(notifications.taskId, taskIds), eq(notifications.isRead, false)));
}

// "New task" for the assignee — skipped when people assign tasks to themselves
export async function notifyTasksAssigned(taskIds: string[], actorId: string): Promise<void> {
  if (taskIds.length === 0) return;
  try {
    const tasks = await taskQuery().where(inArray(pmProjectTasks.id, taskIds));
    for (const task of tasks) {
      if (!task.assigneeId || task.assigneeId === actorId) continue;
      await notifyUser(task.assigneeId, {
        type: 'pm_task_assigned',
        title: 'Nova naloga',
        message: message(task),
        entityType: 'pm_project',
        entityId: task.projectId,
        taskId: task.id,
      });
    }
  } catch (err) {
    console.error('[pm-tasks] Failed to send assignment notifications:', err);
  }
}

// Daily: "due tomorrow" to the assignee, "overdue" to the assignee and the project manager.
// Each is sent once per task; the *_notified_at columns are cleared when the due date changes or the task reopens.
export async function runTaskReminders(): Promise<void> {
  const open = eq(pmProjectTasks.status, 'open');

  const dueTomorrow = await taskQuery().where(and(
    open,
    isNotNull(pmProjectTasks.assigneeId),
    isNull(pmProjectTasks.dueNotifiedAt),
    sql`${pmProjectTasks.dueDate} = current_date + 1`,
  ));
  for (const task of dueTomorrow) {
    await notifyUser(task.assigneeId!, {
      type: 'pm_task_due',
      title: 'Naloga zapade jutri',
      message: message(task),
      entityType: 'pm_project',
      entityId: task.projectId,
      taskId: task.id,
    });
    await db.update(pmProjectTasks).set({ dueNotifiedAt: new Date() }).where(eq(pmProjectTasks.id, task.id));
  }

  const overdue = await taskQuery().where(and(
    open,
    isNull(pmProjectTasks.overdueNotifiedAt),
    sql`${pmProjectTasks.dueDate} < current_date`,
  ));
  for (const task of overdue) {
    const recipients = new Set([task.assigneeId, task.projectManagerId].filter((id): id is string => !!id));
    for (const userId of recipients) {
      // The project manager also needs to know whose task it is
      const owner = userId !== task.assigneeId ? ` · ${task.assigneeName ?? '—'}` : '';
      await notifyUser(userId, {
        type: 'pm_task_overdue',
        title: 'Naloga zamuja',
        message: message(task, owner),
        entityType: 'pm_project',
        entityId: task.projectId,
        taskId: task.id,
      });
    }
    await db.update(pmProjectTasks).set({ overdueNotifiedAt: new Date() }).where(eq(pmProjectTasks.id, task.id));
  }

  if (dueTomorrow.length + overdue.length > 0) {
    console.log(`[pm-tasks] Reminders sent: ${dueTomorrow.length} due tomorrow, ${overdue.length} overdue.`);
  }
}

// Daily at 07:00, plus once shortly after startup to catch up if the server was down at 07:00
export function startTaskReminders(isEnabled: () => Promise<boolean>): void {
  const run = async () => {
    try {
      if (await isEnabled()) await runTaskReminders();
    } catch (err) {
      console.error('[pm-tasks] Reminder run failed:', err);
    }
  };
  cron.schedule('0 7 * * *', run);
  setTimeout(run, 60_000);
}
