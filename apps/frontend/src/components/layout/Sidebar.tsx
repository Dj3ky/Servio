import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, FileText, Receipt, BarChart3, Settings, Users, ClipboardList, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { labelKey: 'nav.dashboard', icon: LayoutDashboard, path: '/' },
  { labelKey: 'nav.contracts', icon: FileText, path: '/contracts' },
  { labelKey: 'nav.invoices', icon: Receipt, path: '/invoices', roles: ['admin', 'manager', 'accountant'] },
  { labelKey: 'nav.reports', icon: BarChart3, path: '/reports', roles: ['admin', 'manager', 'accountant'] },
  { labelKey: 'nav.users', icon: Users, path: '/users', roles: ['admin', 'manager'] },
  { labelKey: 'nav.auditLog', icon: ClipboardList, path: '/audit-log', roles: ['admin', 'manager'] },
  { labelKey: 'nav.settings', icon: Settings, path: '/settings', roles: ['admin'] },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const location = useLocation();

  const visibleItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return user ? item.roles.includes(user.role) : false;
  });

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-300 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
          <div className="flex items-center">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt={settings.appName} className="max-h-9 max-w-[160px] object-contain" />
            ) : (
              <span className="text-lg font-semibold text-sidebar-foreground">{settings.appName}</span>
            )}
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t(item.labelKey as any)}
                </NavLink>
              );
            })}
          </nav>
        </ScrollArea>

        {user && (
          <div className="border-t border-sidebar-border px-4 py-3">
            <div className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</div>
            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          </div>
        )}
      </aside>
    </>
  );
}
