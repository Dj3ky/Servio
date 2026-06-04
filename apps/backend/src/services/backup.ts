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
import { saveToSmb } from './smb';

const execFileAsync = promisify(execFile);

export async function createBackup(): Promise<string> {
  const s = await db.query.settings.findFirst();
  const backupPath = path.resolve(s?.backupPath ?? './backups');

  await fs.mkdir(backupPath, { recursive: true });

  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
  const sqlFilename = `backup_${timestamp}.sql`;
  const bundleFilename = `backup_${timestamp}.tar.gz`;
  const sqlFilePath = path.join(backupPath, sqlFilename);
  const bundleFilePath = path.join(backupPath, bundleFilename);

  const dbUrl = new URL(process.env.DATABASE_URL!);
  const host = dbUrl.hostname;
  const port = dbUrl.port || '5432';
  const database = dbUrl.pathname.slice(1);
  const username = dbUrl.username;
  const env = { ...process.env, PGPASSWORD: dbUrl.password };

  // Step 1: dump DB to a plain SQL file inside the backup dir.
  // --clean --if-exists: emit DROP TABLE IF EXISTS before each CREATE TABLE so the
  // SQL can be restored cleanly onto a server that was already seeded.
  // --no-owner --no-acl: skip ownership and privilege statements that differ
  // between servers and would cause psql errors on restore.
  await execFileAsync('pg_dump', [
    '-h', host, '-p', port, '-U', username,
    '-F', 'p',
    '--clean', '--if-exists',
    '--no-owner', '--no-acl',
    '-f', sqlFilePath,
    database,
  ], { env });

  // Step 2: bundle SQL + uploads into a single archive
  const tarArgs = ['-czf', bundleFilePath, '-C', backupPath, sqlFilename];
  const uploadsDir = path.resolve('./uploads');
  try {
    await fs.access(uploadsDir);
    tarArgs.push('-C', path.dirname(uploadsDir), path.basename(uploadsDir));
  } catch {
    // uploads dir absent — bundle SQL only
  }
  await execFileAsync('tar', tarArgs);

  // Step 3: remove the loose SQL file — it now lives inside the bundle
  await fs.unlink(sqlFilePath).catch(() => {});

  await createAuditLog({ action: 'create_backup', payload: { filename: bundleFilename } });

  if (s?.backupToNas) {
    try {
      const buffer = await fs.readFile(bundleFilePath);
      const basePath = s.smbBasePath || '';
      const remotePath = [basePath, 'Backups', bundleFilename].filter(Boolean).join('/');
      await saveToSmb(remotePath, buffer);
      console.log('[backup] Backup copied to NAS:', remotePath);
    } catch (err) {
      console.error('[backup] Failed to copy backup to NAS:', err);
    }
  }

  return bundleFilePath;
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
