import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './locales/i18n';
import './index.css';

async function bootstrap() {
  try {
    const res = await fetch('/api/settings/public');
    if (res.ok) {
      const data = await res.json();
      const { useSettingsStore } = await import('./stores/settingsStore');
      useSettingsStore.getState().setSettings(data);

      const title = data.appName ?? 'Servio';
      document.title = title;

      const storedLang = localStorage.getItem('i18nextLng');
      if (!storedLang) {
        const { default: i18n } = await import('./locales/i18n');
        i18n.changeLanguage(data.defaultLanguage ?? 'sl');
      }
    }
  } catch {
    // Continue with defaults
  }

  const savedTheme = localStorage.getItem('servio-theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
