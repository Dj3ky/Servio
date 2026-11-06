import { useCallback } from 'react';
import { create } from 'zustand';
import { permissions as defaults } from '@servio/shared';
import { api } from '@/lib/api';
import { useAuthStore } from './authStore';

export type PermMap = Record<string, Record<string, string[]>>;

interface PermissionsState {
  perms: PermMap;
  setPerms: (perms: PermMap) => void;
}

export const usePermissionsStore = create<PermissionsState>()((set) => ({
  perms: defaults as unknown as PermMap,
  setPerms: (perms) => set({ perms }),
}));

// Query function for the ['permissions'] query — every observer goes through it so the store stays current
export async function fetchPermissions(): Promise<PermMap> {
  const data = await api.get<PermMap>('/settings/permissions');
  usePermissionsStore.getState().setPerms(data);
  return data;
}

// Whether the current user's role has the given permission
export function useCan() {
  const perms = usePermissionsStore((s) => s.perms);
  const role = useAuthStore((s) => s.user?.role);
  return useCallback(
    (section: string, action: string) => !!role && (perms[section]?.[action] ?? []).includes(role),
    [perms, role],
  );
}
