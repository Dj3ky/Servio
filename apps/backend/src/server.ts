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
