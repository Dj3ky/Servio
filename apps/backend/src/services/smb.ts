import net from 'net';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { db } from '../db';
import { decrypt } from '../utils/crypto';

interface SmbConfig {
  host: string;
  share: string;
  username: string;
  password: string;
}

async function getSmbConfig(): Promise<SmbConfig | null> {
  const s = await db.query.settings.findFirst();
  if (!s?.smbHost || !s.smbShare || !s.smbUsername || !s.smbPassEncrypted) return null;
  return {
    host: s.smbHost,
    share: s.smbShare,
    username: s.smbUsername,
    password: decrypt(s.smbPassEncrypted),
  };
}

// Password is passed via PASSWD env var — keeps it out of the process list.
// smbclient uses NTLMv2 by default on modern samba-client packages.
function runSmbclient(cfg: SmbConfig, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'smbclient',
      [
        `//${cfg.host}/${cfg.share}`,
        '-U', cfg.username,
        '--option=client min protocol=SMB2',
        '-c', command,
      ],
      {
        env: { ...process.env, PASSWD: cfg.password },
        timeout: 15000,
      },
    );

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || stdout.trim() || `smbclient exited with code ${code}`));
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') reject(new Error('smbclient not found — install it: apt-get install samba-client'));
      else reject(err);
    });
  });
}

function checkTcpPort(host: string, port = 445, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket
      .on('connect', () => { socket.destroy(); resolve(); })
      .on('timeout', () => { socket.destroy(); reject(new Error(`Cannot reach ${host}:${port} — connection timed out. Check the SMB host address and firewall/port 445.`)); })
      .on('error', (err) => reject(new Error(`Cannot reach ${host}:${port} — ${err.message}`)))
      .connect(port, host);
  });
}

async function ensureDir(cfg: SmbConfig, dirPath: string): Promise<void> {
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    try {
      await runSmbclient(cfg, `mkdir "${current}"`);
    } catch {
      // NT_STATUS_OBJECT_NAME_COLLISION means the directory already exists — that's fine.
      // Any real error will surface when we try to put the file.
    }
  }
}

export async function readFromSmb(remotePath: string): Promise<Buffer> {
  const cfg = await getSmbConfig();
  if (!cfg) throw new Error('SMB not configured');

  const tmpFile = path.join(os.tmpdir(), `servio-smb-dl-${Date.now()}`);
  try {
    await runSmbclient(cfg, `get "${remotePath}" "${tmpFile}"`);
    return await fs.readFile(tmpFile);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

export async function saveToSmb(remotePath: string, buffer: Buffer): Promise<void> {
  const cfg = await getSmbConfig();
  if (!cfg) throw new Error('SMB not configured');

  const tmpFile = path.join(os.tmpdir(), `servio-smb-ul-${Date.now()}`);
  try {
    await fs.writeFile(tmpFile, buffer);

    const parts = remotePath.split('/');
    parts.pop();
    const dir = parts.join('/');
    if (dir) await ensureDir(cfg, dir);

    await runSmbclient(cfg, `put "${tmpFile}" "${remotePath}"`);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

export async function testSmbConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const s = await db.query.settings.findFirst();
    if (!s?.smbHost || !s.smbShare || !s.smbUsername || !s.smbPassEncrypted) {
      return { success: false, error: 'SMB is not configured — fill in host, share, username and password.' };
    }

    await checkTcpPort(s.smbHost);

    const cfg: SmbConfig = {
      host: s.smbHost,
      share: s.smbShare,
      username: s.smbUsername,
      password: decrypt(s.smbPassEncrypted),
    };

    await runSmbclient(cfg, 'ls');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildSmbPath(
  basePath: string,
  year: number,
  contractNumber: string,
  yearMonth: string,
  filename: string,
): string {
  return [basePath, String(year), contractNumber, `${yearMonth}_${filename}`]
    .filter(Boolean)
    .join('/');
}
