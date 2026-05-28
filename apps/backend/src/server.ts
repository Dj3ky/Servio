import { createServer } from 'http';
import app from './app';
import { config } from './config';
import { initWebSocket } from './ws';
import { startScheduler } from './services/scheduler';
import { startBackupScheduler } from './services/backup';

const server = createServer(app);

initWebSocket(server);
startScheduler();
startBackupScheduler();

server.listen(config.port, () => {
  console.log(`[server] Servio backend running on port ${config.port} (${config.nodeEnv})`);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  process.exit(1);
});

export default server;
