import { create } from 'zustand';
import { permissions as defaults } from '@servio/shared';

export type PermMap = Record<string, Record<string, string[]>>;

interface PermissionsState {
  perms: PermMap;
  setPerms: (perms: PermMap) => void;
}

export const usePermissionsStore = create<PermissionsState>()((set) => ({
  perms: defaults as unknown as PermMap,
  setPerms: (perms) => set({ perms }),
}));
