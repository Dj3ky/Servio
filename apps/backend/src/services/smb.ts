import net from 'net';
import SMB2 from '@marsaud/smb2';
import { db } from '../db';
import { decrypt } from '../utils/crypto';

interface SmbConfig {
  host: string;
  share: string;
  domain: string;
  username: string;
  password: string;
}

async function getSmbConfig(): Promise<SmbConfig | null> {
  const s = await db.query.settings.findFirst();
  if (!s?.smbHost || !s.smbShare || !s.smbUsername || !s.smbPassEncrypted) return null;

  return {
    host: s.smbHost,
    share: `\\\\${s.smbHost}\\${s.smbShare}`,
    domain: '',
    username: s.smbUsername,
    password: decrypt(s.smbPassEncrypted),
  };
}

function createClient(cfg: SmbConfig): SMB2 {
  return new SMB2({
    share: cfg.share,
    domain: cfg.domain,
    username: cfg.username,
    password: cfg.password,
    autoCloseTimeout: 5000,
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

export async function readFromSmb(remotePath: string): Promise<Buffer> {
  const cfg = await getSmbConfig();
  if (!cfg) throw new Error('SMB not configured');

  const client = createClient(cfg);

  return new Promise<Buffer>((resolve, reject) => {
    (client as any).on('error', reject);
    client.readFile(remotePath, (err: Error | null, data: Buffer) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export async function saveToSmb(remotePath: string, buffer: Buffer): Promise<void> {
  const cfg = await getSmbConfig();
  if (!cfg) throw new Error('SMB not configured');

  const client = createClient(cfg);

  const parts = remotePath.split('/');
  parts.pop();
  const dir = parts.join('/');

  if (dir) {
    await ensureDir(client, dir);
  }

  await new Promise<void>((resolve, reject) => {
    (client as any).on('error', reject);
    client.writeFile(remotePath, buffer, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function ensureDir(client: SMB2, dirPath: string): Promise<void> {
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';

  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    await new Promise<void>((resolve) => {
      client.mkdir(current, () => resolve());
    });
  }
}

export async function testSmbConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const s = await db.query.settings.findFirst();
    if (!s?.smbHost || !s.smbShare || !s.smbUsername || !s.smbPassEncrypted) {
      return { success: false, error: 'SMB is not configured — fill in host, share, username and password.' };
    }

    // Step 1: fast TCP check — port 445 reachable?
    await checkTcpPort(s.smbHost);

    // Step 2: SMB authentication + share access
    const cfg: SmbConfig = {
      host: s.smbHost,
      share: `\\\\${s.smbHost}\\${s.smbShare}`,
      domain: '',
      username: s.smbUsername,
      password: decrypt(s.smbPassEncrypted),
    };
    const client = createClient(cfg);

    await new Promise<void>((resolve, reject) => {
      // @marsaud/smb2 can emit unhandled 'error' events that crash Node.js
      (client as any).on('error', reject);

      const timer = setTimeout(
        () => reject(new Error('SMB authentication timed out — check credentials and share name.')),
        10000,
      );

      client.readdir('', (err: Error | null) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      });
    });

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
  const parts = [basePath, String(year), contractNumber, `${yearMonth}_${filename}`]
    .filter(Boolean)
    .join('/');
  return parts;
}
