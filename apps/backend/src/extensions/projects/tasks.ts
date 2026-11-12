import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema/users';
import { pmProjects, pmProjectTasks, pmWeeklyMeetings } from './schema';

// Tasks with assignee name and the date of the meeting they were created in.
// Open tasks first, then by due date (no date last), then oldest first.
export function selectTasks(where: SQL | undefined) {
  return baseTaskQuery(where).orderBy(
    sql`case when ${pmProjectTasks.status} = 'open' then 0 else 1 end`,
    sql`${pmProjectTasks.dueDate} asc nulls last`,
    pmProjectTasks.createdAt,
  );
}

// The most recently completed tasks matching `where`, newest first.
export function selectRecentDoneTasks(where: SQL | undefined, limit: number) {
  return baseTaskQuery(and(where, eq(pmProjectTasks.status, 'done')))
    .orderBy(sql`${pmProjectTasks.completedAt} desc nulls last`, desc(pmProjectTasks.createdAt))
    .limit(limit);
}

function baseTaskQuery(where: SQL | undefined) {
  return db.select({
    id: pmProjectTasks.id,
    projectId: pmProjectTasks.projectId,
    title: pmProjectTasks.title,
    assigneeId: pmProjectTasks.assigneeId,
    assigneeName: users.name,
    dueDate: pmProjectTasks.dueDate,
    status: pmProjectTasks.status,
    meetingId: pmProjectTasks.meetingId,
    meetingDate: pmWeeklyMeetings.meetingDate,
    completedMeetingId: pmProjectTasks.completedMeetingId,
    completedAt: pmProjectTasks.completedAt,
    createdAt: pmProjectTasks.createdAt,
    projectNumber: pmProjects.projectNumber,
    projectName: pmProjects.name,
  })
    .from(pmProjectTasks)
    .innerJoin(pmProjects, eq(pmProjectTasks.projectId, pmProjects.id))
    .leftJoin(users, eq(pmProjectTasks.assigneeId, users.id))
    .leftJoin(pmWeeklyMeetings, eq(pmProjectTasks.meetingId, pmWeeklyMeetings.id))
    .where(where);
}
