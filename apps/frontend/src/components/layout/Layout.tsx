import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useWebSocket } from '@/hooks/useWebSocket';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('servio-theme') === 'dark' ||
      (!localStorage.getItem('servio-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useWebSocket();

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('servio-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('servio-theme', 'light');
    }
  }, [darkMode]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
