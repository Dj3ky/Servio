import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { createGzip } from 'zlib';
import { once } from 'events';
import { and, asc, eq, lt } from 'drizzle-orm';
import { db } from '../db';
import { auditLogs, notifications } from '../db/schema';
import { createAuditLog } from '../utils/audit';
import { localTimestamp } from './backup';
import { saveToSmb } from './smb';

const NOTIFICATION_RETENTION_DAYS = 90;
const BATCH_SIZE = 5000;

// Writes all audit logs older than `cutoff` to a gzipped JSON-lines file and returns its path,
// or null when there is nothing to archive.
async function exportAuditLogs(cutoff: Date, archiveDir: string): Promise<{ file: string; count: number } | null> {
  const [first] = await db.select({ id: auditLogs.id }).from(auditLogs).where(lt(auditLogs.createdAt, cutoff)).limit(1);
  if (!first) return null;

  await fs.mkdir(archiveDir, { recursive: true });
  const file = path.join(archiveDir, `audit_logs_${localTimestamp()}.jsonl.gz`);

  const gzip = createGzip();
  const out = createWriteStream(file);
  gzip.pipe(out);

  let count = 0;
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const rows = await db.select().from(auditLogs)
      .where(lt(auditLogs.createdAt, cutoff))
      .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))
      .limit(BATCH_SIZE)
      .offset(offset);
    if (rows.length === 0) break;
    for (const row of rows) {
      if (!gzip.write(JSON.stringify(row) + '\n')) await once(gzip, 'drain');
    }
    count += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  gzip.end();
  await once(out, 'finish');
  return { file, count };
}

// Archives audit logs older than the configured retention period, then removes them from the DB.
// The archive is written (and copied to NAS when enabled) before anything is deleted.
export async function archiveOldAuditLogs(): Promise<number> {
  const s = await db.query.settings.findFirst();
  const months = s?.auditLogRetentionMonths ?? 0;
  if (months <= 0) return 0;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const archiveDir = path.join(path.resolve(s?.backupPath ?? './backups'), 'archive');
  const result = await exportAuditLogs(cutoff, archiveDir);
  if (!result) return 0;

  if (s?.backupToNas) {
    const buffer = await fs.readFile(result.file);
    const nasDir = (s.backupNasPath || 'Backups').replace(/\/+$/, '');
    const remotePath = `${nasDir}/archive/${path.basename(result.file)}`;
    await saveToSmb(remotePath, buffer);
    console.log('[retention] Archive copied to NAS:', remotePath);
  }

  const { rowCount } = await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff));
  const deleted = rowCount ?? 0;
  console.log(`[retention] Archived ${result.count} and deleted ${deleted} audit log(s) to ${result.file}`);

  await createAuditLog({
    action: 'archive_audit_logs',
    entityType: 'audit_log',
    payload: { archived: result.count, deleted, file: path.basename(result.file), cutoff: cutoff.toISOString() },
  });

  return deleted;
}

export async function purgeOldNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { rowCount } = await db.delete(notifications)
    .where(and(eq(notifications.isRead, true), lt(notifications.createdAt, cutoff)));
  const deleted = rowCount ?? 0;
  if (deleted > 0) console.log(`[retention] Deleted ${deleted} read notification(s) older than ${NOTIFICATION_RETENTION_DAYS} days.`);
  return deleted;
}
