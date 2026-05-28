import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { format } from 'date-fns';
import cron from 'node-cron';
import { db } from '../db';
import { createAuditLog } from '../utils/audit';
import { notifications } from '../db/schema';
import { broadcast } from '../ws';

const execFileAsync = promisify(execFile);

export async function createBackup(): Promise<string> {
  const s = await db.query.settings.findFirst();
  const backupPath = s?.backupPath ?? './backups';

  await fs.mkdir(backupPath, { recursive: true });

  const filename = `backup_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.sql`;
  const filePath = path.join(backupPath, filename);

  const dbUrl = new URL(process.env.DATABASE_URL!);
  const host = dbUrl.hostname;
  const port = dbUrl.port || '5432';
  const database = dbUrl.pathname.slice(1);
  const username = dbUrl.username;

  const env = { ...process.env, PGPASSWORD: dbUrl.password };

  await execFileAsync('pg_dump', ['-h', host, '-p', port, '-U', username, '-F', 'p', '-f', filePath, database], {
    env,
  });

  await createAuditLog({ action: 'create_backup', payload: { filename } });

  return filePath;
}

export function startBackupScheduler(): void {
  let currentTask: cron.ScheduledTask | null = null;

  async function scheduleBackup() {
    if (currentTask) {
      currentTask.stop();
      currentTask = null;
    }

    const s = await db.query.settings.findFirst();
    if (!s?.backupEnabled || !s.backupSchedule) return;

    if (!cron.validate(s.backupSchedule)) {
      console.error('[backup] Invalid cron schedule:', s.backupSchedule);
      return;
    }

    currentTask = cron.schedule(s.backupSchedule, async () => {
      console.log('[backup] Running scheduled backup...');
      try {
        const file = await createBackup();
        console.log('[backup] Backup created:', file);
      } catch (err) {
        console.error('[backup] Backup failed:', err);
        try {
          const [notif] = await db
            .insert(notifications)
            .values({
              type: 'backup_failed',
              title: 'Backup Failed',
              message: err instanceof Error ? err.message : 'Unknown error',
              entityType: null,
              entityId: null,
            })
            .returning();
          broadcast('notification_created', { id: notif.id, type: notif.type, title: notif.title, message: notif.message });
        } catch {}
      }
    });

    console.log(`[backup] Scheduled backup: ${s.backupSchedule}`);
  }

  scheduleBackup().catch(console.error);
}
