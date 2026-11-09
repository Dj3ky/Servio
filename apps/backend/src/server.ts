import path from 'path';
import { createServer } from 'http';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import app from './app';
import { config } from './config';
import { db } from './db';
import { initWebSocket } from './ws';
import { startScheduler } from './services/scheduler';
import { startBackupScheduler } from './services/backup';
import { checkForUpdates } from './services/update';
import { setLicenseTokenFromDb } from './middleware/license';
import { loadPermissions } from './services/permissionsService';
import { loadUserAccess } from './services/userAccessService';

const server = createServer(app);

// Ensures new settings columns added in migration 0006 are always present,
// regardless of whether the migration file was deployed.
async function ensureSettingsColumns() {
  await db.execute(sql`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS digest_enabled    boolean  NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS digest_frequency  text     NOT NULL DEFAULT 'daily',
      ADD COLUMN IF NOT EXISTS digest_email      text,
      ADD COLUMN IF NOT EXISTS escalation_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS escalation_days   integer  NOT NULL DEFAULT 3,
      ADD COLUMN IF NOT EXISTS imap_port         integer
  `);
  await db.execute(sql`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS license_key text
  `);
  await db.execute(sql`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS backup_to_nas boolean NOT NULL DEFAULT false
  `);
  await db.execute(sql`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS backup_nas_path text
  `);
  await db.execute(sql`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS permissions_config jsonb
  `);
  await db.execute(sql`
    ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS email_bounced boolean NOT NULL DEFAULT false
  `);
  await db.execute(sql`
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS email_bounced boolean NOT NULL DEFAULT false
  `);
  await db.execute(sql`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS smb_path_template text NOT NULL DEFAULT '{year}/{contract_number}/{year_month}_{filename}'
  `);
  await db.execute(sql`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS extensions_config jsonb
  `);
  await db.execute(sql`ALTER TYPE review_status ADD VALUE IF NOT EXISTS 'skipped'`);
  await db.execute(sql`
    ALTER TABLE reviews
      ADD COLUMN IF NOT EXISTS skip_reason   text,
      ADD COLUMN IF NOT EXISTS skipped_at    timestamp,
      ADD COLUMN IF NOT EXISTS skipped_by_id uuid REFERENCES users(id)
  `);
  await db.execute(sql`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS audit_log_retention_months integer NOT NULL DEFAULT 0
  `);
  await db.execute(sql`
    ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS backup_keep_recent  integer NOT NULL DEFAULT 30,
      ADD COLUMN IF NOT EXISTS backup_keep_monthly integer NOT NULL DEFAULT 12
  `);
  // All settings updates target id = 1 — without this row every save silently does nothing
  await db.execute(sql`INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  // Invoices only exist once a review is completed — drop pending ones created earlier for open reviews
  await db.execute(sql`
    DELETE FROM invoices i
    USING reviews r
    WHERE i.review_id = r.id AND i.status = 'pending' AND r.status <> 'completed'
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at)`);
  // Personal notifications (migration 0016)
  await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id)`);
  // Notification's PM task (migration 0023)
  await db.execute(sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS task_id uuid`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notifications_task_id_idx ON notifications (task_id)`);
  await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pm_task_assigned'`);
  await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pm_task_due'`);
  await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pm_task_overdue'`);
  await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pm_task_done'`);
}

async function start() {
  console.log('[server] Applying pending migrations...');
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, '../src/db/migrations') });
  } catch (err) {
    console.error('[server] Migration runner error (columns will be ensured below):', err);
  }
  await ensureSettingsColumns();
  console.log('[server] Database up to date.');

  const s = await db.query.settings.findFirst();
  if (s?.licenseKey) setLicenseTokenFromDb(s.licenseKey);
  await loadPermissions();
  await loadUserAccess();

  initWebSocket(server);
  startScheduler();
  startBackupScheduler();

  // Initial update check on startup, then daily at 06:00
  checkForUpdates().catch(() => {});
  const cron = await import('node-cron');
  cron.default.schedule('0 6 * * *', () => { checkForUpdates().catch(() => {}); });

  server.listen(config.port, () => {
    console.log(`[server] Servio backend running on port ${config.port} (${config.nodeEnv})`);
  });
}

start().catch((err) => {
  console.error('[server] Startup failed:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  process.exit(1);
});

export default server;
