import cron from 'node-cron';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../../db';
import { pmKimaiTimesheets, pmProjects } from './schema';
import { KimaiConnection, KimaiError, KimaiTimesheet, getKimaiProject, listKimaiTimesheets, loadKimaiConnection } from './kimai';

const INSERT_BATCH_SIZE = 1000;

function toRow(projectId: string, t: KimaiTimesheet) {
  const user = typeof t.user === 'object' ? t.user.alias || t.user.username || `#${t.user.id}` : `#${t.user}`;
  const activity = t.activity && typeof t.activity === 'object' ? t.activity.name ?? null : null;
  return {
    id: t.id,
    projectId,
    // The day as booked in Kimai, from the local time at the start of "2026-11-04T08:00:00+0100"
    entryDate: t.begin.slice(0, 10),
    durationSeconds: t.duration ?? 0,
    userName: user,
    activityName: activity,
    description: t.description || null,
  };
}

// Replaces the project's copy, because Kimai has no way to ask which entries were deleted.
// On failure the old copy stays and the error is saved next to it.
export async function refreshProjectHours(connection: KimaiConnection, projectId: string, kimaiProjectId: number): Promise<void> {
  try {
    // Checked first, so a project deleted in Kimai reports an error instead of looking like zero hours
    const kimaiProject = await getKimaiProject(connection, kimaiProjectId);
    const timesheets = await listKimaiTimesheets(connection, kimaiProjectId);
    const rows = timesheets.map((t) => toRow(projectId, t));

    await db.transaction(async (tx) => {
      const [current] = await tx.select({ kimaiProjectId: pmProjects.kimaiProjectId })
        .from(pmProjects).where(eq(pmProjects.id, projectId)).for('update');
      if (current?.kimaiProjectId !== kimaiProjectId) return; // Relinked while reading from Kimai

      await tx.delete(pmKimaiTimesheets).where(eq(pmKimaiTimesheets.projectId, projectId));
      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
        // An entry moved in Kimai from another linked project must not be counted on both
        await tx.delete(pmKimaiTimesheets).where(inArray(pmKimaiTimesheets.id, batch.map((r) => r.id)));
        await tx.insert(pmKimaiTimesheets).values(batch);
      }
      await tx.update(pmProjects)
        .set({ kimaiProjectName: kimaiProject.name, kimaiSyncedAt: new Date(), kimaiSyncError: null })
        .where(eq(pmProjects.id, projectId));
    });
  } catch (err) {
    if (err instanceof KimaiError) {
      await db.update(pmProjects).set({ kimaiSyncError: err.code }).where(eq(pmProjects.id, projectId));
    }
    throw err;
  }
}

// Refreshes every linked project. Only a missing Kimai project is specific to one project;
// anything else (Kimai down, bad token) would repeat for all of them, so the run stops at the first one.
export async function runKimaiSync(): Promise<void> {
  const connection = await loadKimaiConnection();
  if (!connection) return;

  const linked = await db.select({ id: pmProjects.id, kimaiProjectId: pmProjects.kimaiProjectId })
    .from(pmProjects).where(isNotNull(pmProjects.kimaiProjectId));

  let failed = 0;
  for (const [index, project] of linked.entries()) {
    try {
      await refreshProjectHours(connection, project.id, project.kimaiProjectId!);
    } catch (err) {
      failed++;
      if (err instanceof KimaiError && err.status === 404) continue;

      console.error('[pm-kimai] Sync stopped:', err instanceof Error ? err.message : err);
      if (err instanceof KimaiError) {
        const rest = linked.slice(index + 1).map((p) => p.id);
        if (rest.length > 0) {
          await db.update(pmProjects).set({ kimaiSyncError: err.code })
            .where(and(inArray(pmProjects.id, rest), isNotNull(pmProjects.kimaiProjectId)));
        }
      }
      return;
    }
  }
  if (failed > 0) console.error(`[pm-kimai] ${failed} of ${linked.length} projects could not be refreshed.`);
}

// Every 30 minutes, plus once shortly after startup
export function startKimaiSync(isEnabled: () => Promise<boolean>): void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      if (await isEnabled()) await runKimaiSync();
    } catch (err) {
      console.error('[pm-kimai] Sync failed:', err);
    } finally {
      running = false;
    }
  };
  cron.schedule('*/30 * * * *', run);
  setTimeout(run, 90_000);
}
