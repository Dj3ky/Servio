import path from 'path';
import { createServer } from 'http';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import app from './app';
import { config } from './config';
import { db } from './db';
import { initWebSocket } from './ws';
import { startScheduler } from './services/scheduler';
import { startBackupScheduler } from './services/backup';

const server = createServer(app);

async function start() {
  console.log('[server] Applying pending migrations...');
  await migrate(db, { migrationsFolder: path.join(__dirname, 'db/migrations') });
  console.log('[server] Database up to date.');

  initWebSocket(server);
  startScheduler();
  startBackupScheduler();

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
