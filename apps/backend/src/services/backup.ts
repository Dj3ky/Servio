import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import cron from 'node-cron';
import { db } from '../db';
import { createAuditLog } from '../utils/audit';
import { notifications } from '../db/schema';
import { broadcast } from '../ws';
import { saveToSmb } from './smb';

const execFileAsync = promisify(execFile);

function localTimestamp(): string {
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: tz,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}`;
}

// Keep the 30 most recent backups, plus one per calendar month for the 12 months before that.
async function applyRetentionPolicy(backupPath: string): Promise<void> {
  const KEEP_DAILY = 30;
  const KEEP_MONTHLY = 12;

  const files = await fs.readdir(backupPath).catch(() => [] as string[]);
  const backups = files
    .filter(f => f.startsWith('backup_') && f.endsWith('.tar.gz'))
    .map(f => {
      const m = f.match(/^backup_(\d{4}-\d{2}-\d{2})_/);
      return m ? { file: f, date: new Date(m[1]) } : null;
    })
    .filter((b): b is { file: string; date: Date } => b !== null && !isNaN(b.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime()); // newest first

  const keep = new Set<string>();

  // Always keep the N most recent
  backups.slice(0, KEEP_DAILY).forEach(b => keep.add(b.file));

  // For older ones keep one per calendar month (up to KEEP_MONTHLY months)
  const seenMonths = new Set<string>();
  for (const b of backups.slice(KEEP_DAILY)) {
    const month = `${b.date.getFullYear()}-${String(b.date.getMonth() + 1).padStart(2, '0')}`;
    if (!seenMonths.has(month) && seenMonths.size < KEEP_MONTHLY) {
      seenMonths.add(month);
      keep.add(b.file);
    }
  }

  for (const b of backups) {
    if (!keep.has(b.file)) {
      await fs.unlink(path.join(backupPath, b.file)).catch(() => {});
      console.log('[backup] Retention: deleted', b.file);
    }
  }
}

export async function createBackup(): Promise<string> {
  const s = await db.query.settings.findFirst();
  const backupPath = path.resolve(s?.backupPath ?? './backups');

  await fs.mkdir(backupPath, { recursive: true });

  const timestamp = localTimestamp();
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
      const nasDir = (s.backupNasPath || 'Backups').replace(/\/+$/, '');
      const remotePath = `${nasDir}/${bundleFilename}`;
      await saveToSmb(remotePath, buffer);
      console.log('[backup] Backup copied to NAS:', remotePath);
    } catch (err) {
      console.error('[backup] Failed to copy backup to NAS:', err);
    }
  }

  await applyRetentionPolicy(backupPath);

  return bundleFilePath;
}

let currentBackupTask: cron.ScheduledTask | null = null;

export async function rescheduleBackup(): Promise<void> {
  if (currentBackupTask) {
    currentBackupTask.stop();
    currentBackupTask = null;
  }

  const s = await db.query.settings.findFirst();
  if (!s?.backupEnabled || !s.backupSchedule) {
    console.log('[backup] Scheduled backup disabled or no schedule set.');
    return;
  }

  if (!cron.validate(s.backupSchedule)) {
    console.error('[backup] Invalid cron schedule:', s.backupSchedule);
    return;
  }

  const tz = process.env.TZ;
  const options = tz ? { timezone: tz } : {};

  currentBackupTask = cron.schedule(s.backupSchedule, async () => {
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
  }, options);

  console.log(`[backup] Scheduled backup: ${s.backupSchedule}${tz ? ` (timezone: ${tz})` : ' (system timezone)'}`);
}

export function startBackupScheduler(): void {
  rescheduleBackup().catch(console.error);
}
