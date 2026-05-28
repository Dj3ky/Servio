import { create } from 'zustand';

interface PublicSettings {
  appName: string;
  logoUrl: string | null;
  defaultLanguage: 'sl' | 'en';
}

interface SettingsState {
  settings: PublicSettings;
  setSettings: (settings: PublicSettings) => void;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: {
    appName: 'Servio',
    logoUrl: null,
    defaultLanguage: 'sl',
  },
  setSettings: (settings) => set({ settings }),
}));
