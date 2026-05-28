import SMB2 from '@marsaud/smb2';
import { db } from '../db';
import { decrypt } from '../utils/crypto';

interface SmbConfig {
  share: string;
  domain: string;
  username: string;
  password: string;
}

async function getSmbConfig(): Promise<SmbConfig | null> {
  const s = await db.query.settings.findFirst();
  if (!s?.smbHost || !s.smbShare || !s.smbUsername || !s.smbPassEncrypted) return null;

  return {
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
      client.mkdir(current, (err) => {
        resolve();
      });
    });
  }
}

export async function testSmbConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const cfg = await getSmbConfig();
    if (!cfg) return { success: false, error: 'SMB not configured' };

    const client = createClient(cfg);

    await new Promise<void>((resolve, reject) => {
      client.readdir('', (err) => {
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
