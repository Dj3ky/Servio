import { create } from 'zustand';

interface ExtensionConfig {
  licensed: boolean;
  enabled: boolean;
}

interface PublicSettings {
  appName: string;
  logoUrl: string | null;
  defaultLanguage: 'sl' | 'en';
  extensions: {
    projects: ExtensionConfig;
  };
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
    extensions: {
      projects: { licensed: false, enabled: false },
    },
  },
  setSettings: (settings) => set({ settings }),
}));
