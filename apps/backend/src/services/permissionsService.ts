import { permissions as defaults } from '@servio/shared';
import { db } from '../db';

type PermissionsMap = typeof defaults;

let cache: PermissionsMap = defaults;

export async function loadPermissions(): Promise<void> {
  try {
    const row = await db.query.settings.findFirst();
    if (row?.permissionsConfig && Object.keys(row.permissionsConfig).length > 0) {
      cache = row.permissionsConfig as unknown as PermissionsMap;
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
