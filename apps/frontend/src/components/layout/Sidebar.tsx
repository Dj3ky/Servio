import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, FileText, Receipt, BarChart3, Settings, Users, ClipboardList, X, CalendarRange, KeyRound,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';

interface LicenseStatus {
  valid: boolean;
  configured: boolean;
  customer?: string;
  perpetual?: boolean;
  daysLeft?: number | null;
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  permKey?: string; // "section.action" resolved against live permissions store
}

const navItems: NavItem[] = [
  { labelKey: 'nav.dashboard', icon: LayoutDashboard, path: '/' },
  { labelKey: 'nav.contracts', icon: FileText, path: '/contracts' },
  { labelKey: 'nav.contractTimeline', icon: CalendarRange, path: '/contract-timeline', permKey: 'contractTimeline.access' },
  { labelKey: 'nav.invoices', icon: Receipt, path: '/invoices', permKey: 'invoices.access' },
  { labelKey: 'nav.reports', icon: BarChart3, path: '/reports', permKey: 'reports.access' },
  { labelKey: 'nav.users', icon: Users, path: '/users', permKey: 'users.view' },
  { labelKey: 'nav.auditLog', icon: ClipboardList, path: '/audit-log', permKey: 'auditLog.access' },
  { labelKey: 'nav.settings', icon: Settings, path: '/settings', permKey: 'settings.view' },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { settings } = useSettingsStore();
  const perms = usePermissionsStore(s => s.perms);
  const location = useLocation();
  const navigate = useNavigate();

  const { data: license } = useQuery<LicenseStatus>({
    queryKey: ['license-status'],
    queryFn: () => api.get<LicenseStatus>('/license/status'),
    enabled: user?.role === 'admin',
    staleTime: 5 * 60 * 1000,
  });

  const visibleItems = navItems.filter((item) => {
    if (!item.permKey) return true;
    const [section, action] = item.permKey.split('.');
    const roles: string[] = perms[section]?.[action] ?? [];
    return user ? roles.includes(user.role) : false;
  });

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-300 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="relative flex flex-col items-center justify-center px-4 py-5 border-b border-sidebar-border">
          {settings.logoUrl ? (
            <>
              <img src={settings.logoUrl} alt={settings.appName} className="max-h-12 max-w-[150px] object-contain mb-2" />
              <span className="text-sm font-semibold tracking-widest uppercase text-sidebar-foreground/70">{settings.appName}</span>
            </>
          ) : (
            <span className="text-lg font-bold tracking-tight text-sidebar-foreground">{settings.appName}</span>
          )}
          <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 lg:hidden" onClick={onClose}>
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

        {user?.role === 'admin' && license && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { navigate('/settings?tab=license'); onClose(); }}
                  className="border-t border-sidebar-border px-4 py-2.5 w-full text-left hover:bg-sidebar-accent/50 transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <KeyRound className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('license.tab')}</span>
                      <span className={cn(
                        'ml-auto h-2 w-2 rounded-full shrink-0',
                        !license.configured ? 'bg-muted-foreground' :
                        !license.valid ? 'bg-destructive' :
                        (!license.perpetual && license.daysLeft !== null && license.daysLeft !== undefined && license.daysLeft <= 30) ? 'bg-yellow-500' :
                        'bg-green-500',
                      )} />
                    </div>
                    <span className="text-xs text-muted-foreground truncate pl-4">
                      {license.valid
                        ? (license.customer ?? '—')
                        : t('license.expired')}
                    </span>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs space-y-0.5">
                {license.valid ? (
                  <>
                    <p className="font-medium">{license.customer}</p>
                    <p className="text-muted-foreground">
                      {license.perpetual
                        ? t('license.neverExpires')
                        : t('license.daysLeft') + ': ' + license.daysLeft}
                    </p>
                  </>
                ) : (
                  <p>{t('license.invalidDesc')}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

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
