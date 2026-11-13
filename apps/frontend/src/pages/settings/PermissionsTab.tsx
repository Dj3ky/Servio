import { Fragment, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { type UserRole } from '@servio/shared';
import { api } from '@/lib/api';
import { useSettingsStore } from '@/stores/settingsStore';
import { fetchPermissions } from '@/stores/permissionsStore';
import { cn } from '@/lib/utils';
import { useReportUnsaved } from './shared';

type PermMap = Record<string, Record<string, string[]>>;

interface PermRow {
  section: string;
  action: string;
  label: string;
  hint?: string;
  // 'section.action' that must be granted first — without it this permission does nothing
  requires?: string;
}

interface PermGroup {
  key: string;
  label: string;
  description?: string;
  // undefined = core feature; true/false = extension enabled or not
  extensionEnabled?: boolean;
  rows: PermRow[];
}

export function PermissionsTab() {
  const { t } = useTranslation();
  const ALL_ROLES: UserRole[] = ['admin', 'manager', 'accountant', 'technician', 'project_manager'];
  const projectsEnabled = useSettingsStore(s => s.settings.extensions.projects.enabled);
  const changelogEnabled = useSettingsStore(s => s.settings.extensions.changelog.enabled);

  const { data: serverPerms, isLoading, refetch } = useQuery<PermMap>({
    queryKey: ['permissions'],
    queryFn: fetchPermissions,
  });

  const [local, setLocal] = useState<PermMap | null>(null);

  useEffect(() => {
    if (serverPerms) setLocal(JSON.parse(JSON.stringify(serverPerms)));
  }, [serverPerms]);

  const save = useMutation({
    mutationFn: () => api.patch('/settings/permissions', local),
    onSuccess: () => { toast.success(t('settings.saved')); refetch(); },
  });

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const reset = useMutation({
    mutationFn: () => api.delete('/settings/permissions'),
    onSuccess: () => { setLocal(null); refetch(); setResetConfirmOpen(false); toast.success(t('common.reset')); },
  });

  const p = (key: string) => t(`settings.perm.${key}` as any);

  const groups: PermGroup[] = [
    { key: 'records', label: p('records'), rows: [
      { section: 'records', action: 'manage', label: p('recordsManage'), hint: p('recordsManageHint') },
      { section: 'records', action: 'delete', label: p('recordsDelete') },
    ]},
    { key: 'reviews', label: p('reviews'), rows: [
      { section: 'reviews', action: 'upload', label: p('reviewsUpload') },
      { section: 'reviews', action: 'backfill', label: p('reviewsBackfill'), hint: p('reviewsBackfillHint') },
      { section: 'reviews', action: 'skip', label: p('reviewsSkip'), hint: p('reviewsSkipHint') },
    ]},
    { key: 'invoices', label: p('invoices'), rows: [
      { section: 'invoices', action: 'access', label: p('invoicesAccess') },
      { section: 'invoices', action: 'reset', label: p('invoicesReset'), hint: p('invoicesResetHint'), requires: 'invoices.access' },
    ]},
    { key: 'pages', label: p('maintenancePages'), rows: [
      { section: 'contractTimeline', action: 'access', label: p('contractTimelineAccess') },
      { section: 'inbox', action: 'access', label: p('inboxAccess') },
      { section: 'reports', action: 'access', label: p('reportsAccess') },
    ]},
    { key: 'projects', label: p('projects'), extensionEnabled: projectsEnabled, rows: [
      { section: 'projects', action: 'access', label: p('projectsAccess') },
      { section: 'projects', action: 'manage', label: p('projectsManage'), hint: p('projectsManageHint'), requires: 'projects.access' },
      { section: 'projects', action: 'delete', label: p('projectsDelete'), requires: 'projects.access' },
      { section: 'projects', action: 'reports', label: p('projectsReports'), hint: p('projectsReportsHint'), requires: 'projects.access' },
      { section: 'projects', action: 'labourCost', label: p('projectsLabourCost'), hint: p('projectsLabourCostHint'), requires: 'projects.access' },
    ]},
    { key: 'changelog', label: p('changelog'), extensionEnabled: changelogEnabled, rows: [
      { section: 'changelog', action: 'access', label: p('changelogAccess') },
      { section: 'changelog', action: 'manage', label: p('changelogManage'), requires: 'changelog.access' },
    ]},
    { key: 'users', label: p('users'), rows: [
      { section: 'users', action: 'view', label: p('usersView') },
      { section: 'users', action: 'manage', label: p('usersManage'), requires: 'users.view' },
      { section: 'users', action: 'resetPassword', label: p('usersResetPw'), requires: 'users.view' },
    ]},
    { key: 'auditLog', label: p('auditLog'), rows: [
      { section: 'auditLog', action: 'access', label: p('auditLogAccess') },
    ]},
    { key: 'settings', label: p('settingsSection'), rows: [
      { section: 'settings', action: 'view', label: p('settingsView') },
      { section: 'settings', action: 'manage', label: p('settingsManage'), hint: p('settingsManageHint'), requires: 'settings.view' },
      { section: 'settings', action: 'manageTemplates', label: p('settingsTemplates'), requires: 'settings.view' },
      { section: 'settings', action: 'deleteTemplates', label: p('settingsDeleteTemplates'), requires: 'settings.view' },
      { section: 'settings', action: 'backup', label: p('settingsBackup'), hint: p('settingsBackupHint'), requires: 'settings.view' },
    ]},
    { key: 'system', label: p('system'), rows: [
      { section: 'smb', action: 'access', label: p('systemSmb') },
      { section: 'scheduler', action: 'access', label: p('systemScheduler') },
      { section: 'update', action: 'access', label: p('systemUpdates') },
      { section: 'license', action: 'access', label: p('systemLicense') },
    ]},
    { key: 'notifications', label: p('notifications'), description: p('notificationsDesc'), rows: [
      { section: 'notifications', action: 'system', label: p('notificationsSystem') },
      { section: 'notifications', action: 'email', label: p('notificationsEmail') },
      { section: 'notifications', action: 'invoiceEmail', label: p('notificationsInvoiceEmail') },
    ]},
  ];

  const allRows = groups.flatMap(g => g.rows);
  const labelOf = (key: string) => allRows.find(r => `${r.section}.${r.action}` === key)?.label ?? key;

  const hasRole = (key: string, role: UserRole): boolean => {
    const perms = local ?? serverPerms;
    if (!perms) return false;
    const [section, action] = key.split('.');
    return (perms[section]?.[action] ?? []).includes(role);
  };

  const toggle = (row: PermRow, role: UserRole) => {
    if (role === 'admin') return;
    const key = `${row.section}.${row.action}`;
    setLocal(prev => {
      if (!prev) return prev;
      const next: PermMap = JSON.parse(JSON.stringify(prev));
      const current = next[row.section]?.[row.action] ?? [];
      const granting = !current.includes(role);
      next[row.section] = { ...next[row.section], [row.action]: granting ? [...current, role] : current.filter(r => r !== role) };
      // Taking away a base permission also takes away everything that depends on it
      if (!granting) {
        for (const dep of allRows.filter(r => r.requires === key)) {
          next[dep.section] = { ...next[dep.section], [dep.action]: (next[dep.section]?.[dep.action] ?? []).filter(r => r !== role) };
        }
      }
      return next;
    });
  };

  const isDirty = local !== null && JSON.stringify(local) !== JSON.stringify(serverPerms);
  useReportUnsaved(isDirty);

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">{t('common.loading')}</div>;

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t('settings.roles')}</CardTitle>
            <CardDescription className="mt-1">{t('settings.rolesDesc')}</CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setResetConfirmOpen(true)} disabled={reset.isPending}>
              {t('common.reset')}
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={!isDirty || save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Phones scroll sideways; from md up the table fits, so the header sticks to the page scroll.
            Negative top cancels the p-4 / lg:p-6 padding of <main> in Layout.tsx, so nothing shows above it. */}
        <div className="overflow-x-auto md:overflow-visible border-t">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="sticky -top-4 lg:-top-6 z-10 bg-card border-b text-left py-2 px-4 font-medium text-muted-foreground" />
                {ALL_ROLES.map(role => (
                  <th key={role} className="sticky -top-4 lg:-top-6 z-10 bg-card border-b text-center py-2 px-1 font-medium w-20">
                    <span className="text-[11px] leading-tight uppercase tracking-wide">{t(`users.roles.${role}` as any)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => {
                const isExtension = group.extensionEnabled !== undefined;
                const extensionOff = group.extensionEnabled === false;
                return (
                  <Fragment key={group.key}>
                    <tr>
                      <td colSpan={ALL_ROLES.length + 1} className={cn('py-1.5 px-4 bg-muted/30', group.key === 'notifications' && 'pt-4 border-t-2')}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</span>
                          {isExtension && (
                            <Badge variant={extensionOff ? 'outline' : 'secondary'} className="text-[10px] px-1.5 py-0 font-medium">
                              {extensionOff ? p('extensionOff') : p('extension')}
                            </Badge>
                          )}
                        </div>
                        {group.description && <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>}
                      </td>
                    </tr>
                    {group.rows.map(row => (
                      <tr
                        key={`${row.section}.${row.action}`}
                        className={cn('border-b border-muted/20 hover:bg-muted/10', extensionOff && 'opacity-50')}
                      >
                        <td className={cn('py-2 px-4', row.requires && 'pl-8')}>
                          <div className="text-sm">{row.label}</div>
                          {row.hint && <div className="text-xs text-muted-foreground">{row.hint}</div>}
                        </td>
                        {ALL_ROLES.map(role => {
                          const isAdmin = role === 'admin';
                          const blocked = !!row.requires && !hasRole(row.requires, role);
                          const checked = !blocked && hasRole(`${row.section}.${row.action}`, role);
                          return (
                            // Tooltip sits on the cell: Firefox shows none on a disabled input
                            <td
                              key={role}
                              className="text-center py-2 px-1"
                              title={blocked ? t('settings.perm.requires' as any, { name: labelOf(row.requires!) }) : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isAdmin || blocked}
                                onChange={() => toggle(row, role)}
                                className="h-4 w-4 rounded border-border cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 accent-primary"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.rolesResetTitle')}</DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">{t('settings.rolesResetConfirm')}</p>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="destructive" onClick={() => reset.mutate()} disabled={reset.isPending}>
            {reset.isPending ? t('common.loading') : t('common.reset')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
