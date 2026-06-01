import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export interface UpdateStatus {
  currentCommit: string;
  remoteCommit: string | null;
  updateAvailable: boolean;
  lastChecked: string | null;
  checking: boolean;
  applying: boolean;
  lastError: string | null;
}

export interface UpdateLog {
  lines: string[];
  done: boolean;
  success: boolean;
}

let cachedStatus: UpdateStatus = {
  currentCommit: '',
  remoteCommit: null,
  updateAvailable: false,
  lastChecked: null,
  checking: false,
  applying: false,
  lastError: null,
};

let updateLog: UpdateLog = { lines: [], done: false, success: false };

export function getUpdateStatus(): UpdateStatus {
  return { ...cachedStatus };
}

export function getUpdateLog(): UpdateLog {
  return { ...updateLog, lines: [...updateLog.lines] };
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (cachedStatus.checking || cachedStatus.applying) return getUpdateStatus();

  cachedStatus.checking = true;
  cachedStatus.lastError = null;

  try {
    const [localResult, remoteResult] = await Promise.all([
      execAsync('git rev-parse HEAD'),
      execAsync('git ls-remote origin HEAD'),
    ]);

    const localCommit = localResult.stdout.trim();
    const remoteCommit = remoteResult.stdout.split('\t')[0]?.trim() ?? null;

    cachedStatus = {
      ...cachedStatus,
      currentCommit: localCommit.slice(0, 7),
      remoteCommit: remoteCommit ? remoteCommit.slice(0, 7) : null,
      updateAvailable: !!remoteCommit && localCommit !== remoteCommit,
      lastChecked: new Date().toISOString(),
      checking: false,
    };
  } catch (err) {
    cachedStatus = {
      ...cachedStatus,
      checking: false,
      lastError: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  return getUpdateStatus();
}

// Starts the update script in the background (non-blocking).
// pm2 will kill this process mid-way through the restart step,
// so we never await — the caller returns immediately after this.
export function startUpdate(): void {
  if (cachedStatus.applying || cachedStatus.checking) return;

  cachedStatus.applying = true;
  updateLog = { lines: [], done: false, success: false };

  const scriptPath = path.resolve(process.cwd(), 'update.sh');

  const child = spawn('bash', [scriptPath], {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const pushLine = (line: string) => {
    updateLog.lines.push(line);
  };

  child.stdout.on('data', (chunk: Buffer) => {
    chunk.toString().split('\n').filter(Boolean).forEach(pushLine);
  });

  child.stderr.on('data', (chunk: Buffer) => {
    chunk.toString().split('\n').filter(Boolean).forEach(pushLine);
  });

  child.on('close', (code) => {
    const success = code === 0;
    updateLog = { ...updateLog, done: true, success };
    cachedStatus = {
      ...cachedStatus,
      applying: false,
      updateAvailable: success ? false : cachedStatus.updateAvailable,
      lastError: success ? null : `Script exited with code ${code}`,
    };
  });

  child.on('error', (err) => {
    updateLog = { ...updateLog, done: true, success: false, lines: [...updateLog.lines, err.message] };
    cachedStatus = { ...cachedStatus, applying: false, lastError: err.message };
  });
}
