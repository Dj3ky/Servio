import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { LicenseGate } from './LicenseGate';
import { useWebSocket } from '@/hooks/useWebSocket';
import { fetchPermissions } from '@/stores/permissionsStore';
import { useAuthStore, type AuthUser } from '@/stores/authStore';
import { api } from '@/lib/api';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('servio-theme') === 'dark' ||
      (!localStorage.getItem('servio-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useWebSocket();

  const { isFetched: permissionsLoaded } = useQuery({
    queryKey: ['permissions'],
    queryFn: fetchPermissions,
    staleTime: 5 * 60 * 1000,
  });

  // The role saved at login can be out of date — an admin may have changed it since
  const { isFetched: userLoaded } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const me = await api.get<AuthUser>('/auth/me');
      useAuthStore.getState().updateUser(me);
      return me;
    },
    staleTime: 5 * 60 * 1000,
  });

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
          <LicenseGate>
            {/* Wait for the saved permissions and role, or route guards would judge a refreshed page by stale values */}
            {permissionsLoaded && userLoaded && <Outlet />}
          </LicenseGate>
        </main>
      </div>
    </div>
  );
}
