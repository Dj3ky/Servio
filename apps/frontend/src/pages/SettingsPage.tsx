import { useEffect, useState } from 'react';
import { useBlocker, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UnsavedChangesContext } from './settings/shared';
import {
  Settings2, Mail, Server, MailOpen, Archive, Bell, RefreshCw, KeyRound, ShieldCheck, Puzzle,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/stores/permissionsStore';
import { cn } from '@/lib/utils';
import { GeneralTab } from './settings/GeneralTab';
import { SmtpTab } from './settings/SmtpTab';
import { SmbTab } from './settings/SmbTab';
import { TemplatesTab } from './settings/TemplatesTab';
import { BackupTab } from './settings/BackupTab';
import { AlertsTab } from './settings/AlertsTab';
import { UpdatesTab } from './settings/UpdatesTab';
import { LicenseTab } from './settings/LicenseTab';
import { PermissionsTab } from './settings/PermissionsTab';
import { ExtensionsTab } from './settings/ExtensionsTab';

const TABS = {
  general: GeneralTab,
  smtp: SmtpTab,
  smb: SmbTab,
  templates: TemplatesTab,
  backup: BackupTab,
  alerts: AlertsTab,
  updates: UpdatesTab,
  license: LicenseTab,
  roles: PermissionsTab,
  extensions: ExtensionsTab,
} as const;

type TabKey = keyof typeof TABS;

export default function SettingsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const canManageSettings = can('settings', 'manage');
  const canBackup = can('settings', 'backup');

  const [searchParams, setSearchParams] = useSearchParams();
  const setActiveTab = (tab: string) => setSearchParams({ tab }, { replace: true });

  const navItems: { value: TabKey; icon: React.ComponentType<{ className?: string }>; label: string; show: boolean }[] = [
    { value: 'general', icon: Settings2, label: t('settings.general'), show: true },
    { value: 'smtp', icon: Mail, label: t('settings.smtp'), show: true },
    { value: 'smb', icon: Server, label: t('settings.smb'), show: true },
    { value: 'templates', icon: MailOpen, label: t('settings.templates'), show: true },
    { value: 'backup', icon: Archive, label: t('settings.backup'), show: canBackup || canManageSettings },
    { value: 'alerts', icon: Bell, label: t('settings.alerts'), show: true },
    { value: 'updates', icon: RefreshCw, label: t('settings.updates'), show: can('update', 'access') },
    { value: 'license', icon: KeyRound, label: t('license.tab'), show: can('license', 'access') },
    { value: 'roles', icon: ShieldCheck, label: t('settings.roles'), show: true },
    { value: 'extensions', icon: Puzzle, label: t('extensions.tab'), show: true },
  ];
  const visibleItems = navItems.filter(item => item.show);

  const requested = searchParams.get('tab') ?? 'general';
  const activeTab: TabKey = visibleItems.find(item => item.value === requested)?.value ?? 'general';
  const ActiveTab = TABS[activeTab];
  // These tabs only edit configuration, so they are read-only without 'manage'
  const readOnly = !canManageSettings && ['general', 'smtp', 'alerts', 'roles', 'extensions'].includes(activeTab);

  // ── Unsaved changes ──────────────────────────────────────────────────────────
  // The open tab reports whether its form has unsaved edits; leaving it then asks first
  const [unsaved, setUnsaved] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null);

  function requestTab(tab: string) {
    if (tab === activeTab) return;
    if (unsaved) setPendingTab(tab as TabKey);
    else setActiveTab(tab);
  }

  // Navigating to another page in the app (tab switches only change ?tab=, so they pass)
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    unsaved && currentLocation.pathname !== nextLocation.pathname);

  // Closing or reloading the window
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const confirmOpen = pendingTab !== null || blocker.state === 'blocked';

  function stay() {
    setPendingTab(null);
    if (blocker.state === 'blocked') blocker.reset();
  }

  function discard() {
    setUnsaved(false);
    if (pendingTab) { setActiveTab(pendingTab); setPendingTab(null); }
    if (blocker.state === 'blocked') blocker.proceed();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('settings.pageDesc')}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-8">
        {/* Phones: a dropdown, so the content gets the full width */}
        <div className="md:hidden">
          <Select value={activeTab} onValueChange={requestTab}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {visibleItems.map(({ value, icon: Icon, label }) => (
                <SelectItem key={value} value={value}>
                  <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tablets and up: sidebar */}
        <nav className="hidden md:block w-48 shrink-0">
          <div className="space-y-0.5">
            {visibleItems.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => requestTab(value)}
                className={cn(
                  'w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors text-left',
                  activeTab === value
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        <fieldset disabled={readOnly} className="flex-1 min-w-0 space-y-4">
          <UnsavedChangesContext.Provider value={setUnsaved}>
            <ActiveTab />
          </UnsavedChangesContext.Provider>
        </fieldset>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) stay(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.unsavedTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{t('settings.unsavedDesc')}</p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={stay}>{t('settings.unsavedStay')}</Button>
            <Button variant="destructive" onClick={discard}>{t('settings.unsavedDiscard')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
