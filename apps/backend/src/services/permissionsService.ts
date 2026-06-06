import { permissions as defaults } from '@servio/shared';
import { db } from '../db';

type PermissionsMap = typeof defaults;

let cache: PermissionsMap = defaults;

export async function loadPermissions(): Promise<void> {
  try {
    const row = await db.query.settings.findFirst();
    if (row?.permissionsConfig && Object.keys(row.permissionsConfig).length > 0) {
      // Merge: defaults provide the base (new sections always present),
      // stored config overrides per-section so custom role assignments are preserved.
      const stored = row.permissionsConfig as Record<string, Record<string, string[]>>;
      const merged: Record<string, Record<string, string[]>> = { ...(defaults as any) };
      for (const [section, actions] of Object.entries(stored)) {
        merged[section] = { ...(merged[section] ?? {}), ...actions };
      }
      cache = merged as unknown as PermissionsMap;
    } else {
      cache = defaults;
    }
  } catch {
    cache = defaults;
  }
}

export function getPermissions(): PermissionsMap {
  return cache;
}
