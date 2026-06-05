import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';

const IS_DOCKER = existsSync('/.dockerenv');
const execAsync = promisify(exec);

export interface UpdateStatus {
  currentCommit: string;
  remoteCommit: string | null;
  updateAvailable: boolean;
  lastChecked: string | null;
  checking: boolean;
  applying: boolean;
  lastError: string | null;
  isDocker: boolean;
}

export interface UpdateLog {
  lines: string[];
  done: boolean;
  success: boolean;
}

const BAKED_COMMIT = process.env.COMMIT_SHA?.trim().slice(0, 7) ?? '';
const GITHUB_REPO = 'dj3ky/servio';

let cachedStatus: UpdateStatus = {
  currentCommit: BAKED_COMMIT,
  remoteCommit: null,
  updateAvailable: false,
  lastChecked: null,
  checking: false,
  applying: false,
  lastError: null,
  isDocker: IS_DOCKER,
};

let updateLog: UpdateLog = { lines: [], done: false, success: false };

export function getUpdateStatus(): UpdateStatus {
  return { ...cachedStatus };
}

export function getUpdateLog(): UpdateLog {
  return { ...updateLog, lines: [...updateLog.lines] };
}

async function checkViaGitHub(): Promise<{ localCommit: string; remoteCommit: string | null }> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/main`, {
    headers: { Accept: 'application/vnd.github.sha' },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

  const remoteCommit = (await res.text()).trim();
  return { localCommit: BAKED_COMMIT, remoteCommit };
}

async function checkViaGit(): Promise<{ localCommit: string; remoteCommit: string | null }> {
  const [localResult, remoteResult] = await Promise.all([
    execAsync('git rev-parse HEAD'),
    execAsync('git ls-remote origin HEAD'),
  ]);
  const localCommit = localResult.stdout.trim();
  const remoteCommit = remoteResult.stdout.split('\t')[0]?.trim() ?? null;
  return { localCommit, remoteCommit };
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (cachedStatus.checking || cachedStatus.applying) return getUpdateStatus();

  cachedStatus.checking = true;
  cachedStatus.lastError = null;

  try {
    const { localCommit, remoteCommit } = IS_DOCKER
      ? await checkViaGitHub()
      : await checkViaGit();

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
