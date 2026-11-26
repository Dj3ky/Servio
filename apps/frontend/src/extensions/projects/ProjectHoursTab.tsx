import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link2, Plus, RefreshCw, Search, Unlink } from 'lucide-react';
import { kimaiSafeName } from '@servio/shared';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { KimaiCustomerField, kimaiErrorMessage, normalizeKimaiName, useKimaiCustomerChoice, type KimaiProject } from './kimai';
import { LabourCostCharts, formatCost, type LabourCostData } from './LabourCostPanel';
import { formatHours } from './hoursFormat';

interface HoursProject {
  id: string;
  projectNumber: string;
  name: string;
  customerName: string | null;
  kimaiProjectId: number | null;
  kimaiProjectName: string | null;
}

interface HoursData {
  syncedAt: string | null;
  syncError: string | null;
  totalSeconds: number;
  entryCount: number;
  byUser: { userName: string; seconds: number }[];
  entries: { id: number; entryDate: string; seconds: number; userName: string; activityName: string | null; description: string | null }[];
}

function useInvalidateLink(projectId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['pm-project', projectId] });
    qc.invalidateQueries({ queryKey: ['pm-kimai-projects'] });
    qc.invalidateQueries({ queryKey: ['pm-kimai-hours', projectId] });
    qc.invalidateQueries({ queryKey: ['pm-kimai-cost', projectId] });
  };
}

// Same look as the money tiles at the top of the project page
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4 space-y-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium mb-2">{children}</p>;
}

// Order: summary tiles → cost charts → people → entries. Cost only reaches people with the labourCost permission.
function HoursOverview({ hours, cost }: { hours: HoursData; cost: LabourCostData | undefined }) {
  const { t } = useTranslation();
  const hasCost = !!cost && cost.entryCount > 0;
  const allCostUnknown = hasCost && cost.unknownEntries === cost.entryCount;
  const costByUser = useMemo(() => new Map((cost?.byUser ?? []).map(u => [u.userName, u.cost])), [cost]);

  // An average over entries with missing costs would be too low, so it shows only when every cost is known
  const avgPerHour = hasCost && cost.unknownEntries === 0 && hours.totalSeconds > 0
    ? formatCost(Number(cost.totalCost) / (hours.totalSeconds / 3600))
    : '—';

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 ${cost ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
        <StatTile label={t('pm.kimai.hours')} value={formatHours(hours.totalSeconds)} />
        {cost && (
          <>
            <StatTile label={t('pm.kimai.labourCost')} value={!hasCost || allCostUnknown ? '—' : formatCost(cost.totalCost)} />
            <StatTile label={t('pm.kimai.avgPerHour')} value={avgPerHour} />
          </>
        )}
        <StatTile label={t('pm.kimai.entries')} value={String(hours.entryCount)} />
      </div>

      {hours.entryCount === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pm.kimai.noHours')}</p>
      ) : (
        <>
          {hasCost && <LabourCostCharts data={cost} />}

          <div>
            <SectionTitle>{t('pm.kimai.byUser')}</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t('pm.kimai.person')}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t('pm.kimai.hours')}</th>
                    {hasCost && <th className="py-2 text-right font-medium">{t('pm.kimai.cost')}</th>}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {hours.byUser.map(u => (
                    <tr key={u.userName} className="border-b last:border-0">
                      <td className="py-2 pr-3">{u.userName}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{formatHours(u.seconds)}</td>
                      {hasCost && (
                        <td className="py-2 text-right whitespace-nowrap">
                          {costByUser.has(u.userName) ? formatCost(costByUser.get(u.userName)!) : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <SectionTitle>{t('pm.kimai.entries')}</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t('pm.kimai.date')}</th>
                    <th className="py-2 pr-3 font-medium">{t('pm.kimai.person')}</th>
                    <th className="py-2 pr-3 font-medium">{t('pm.kimai.activity')}</th>
                    <th className="py-2 pr-3 font-medium">{t('pm.kimai.description')}</th>
                    <th className="py-2 text-right font-medium">{t('pm.kimai.hours')}</th>
                  </tr>
                </thead>
                <tbody>
                  {hours.entries.map(entry => (
                    <tr key={entry.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{formatDate(entry.entryDate)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{entry.userName}</td>
                      <td className="py-2 pr-3">{entry.activityName ?? '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{entry.description ?? '—'}</td>
                      <td className="py-2 text-right whitespace-nowrap tabular-nums">{formatHours(entry.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hours.entryCount > hours.entries.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('pm.kimai.entriesLimited', { shown: hours.entries.length, total: hours.entryCount })}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LinkDialog({ project, open, onClose }: { project: HoursProject; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateLink(project.id);
  const [search, setSearch] = useState('');
  const [confirmMove, setConfirmMove] = useState<KimaiProject | null>(null);

  const { data, isLoading, error } = useQuery<KimaiProject[]>({
    queryKey: ['pm-kimai-projects'],
    queryFn: () => api.get('/pm/kimai/projects'),
    enabled: open,
    retry: false,
  });

  // Matching numbers or names are only suggestions: nothing links until the user picks a row
  const isSuggested = (p: KimaiProject) =>
    (!!p.number && p.number.trim().toLowerCase() === project.projectNumber.trim().toLowerCase())
    || normalizeKimaiName(p.name) === normalizeKimaiName(project.name);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? [])
      .filter(p => !term || [p.name, p.number, p.customerName].some(v => v?.toLowerCase().includes(term)))
      .sort((a, b) => Number(isSuggested(b)) - Number(isSuggested(a)));
  }, [data, search, project.projectNumber, project.name]);

  const link = useMutation({
    mutationFn: ({ kimaiProjectId, moveExisting }: { kimaiProjectId: number; moveExisting?: boolean }) =>
      api.post(`/pm/kimai/link/${project.id}`, { kimaiProjectId, moveExisting }),
    onSuccess: () => {
      invalidate();
      toast.success(t('pm.kimai.linkedOk'));
      setConfirmMove(null);
      onClose();
    },
    onError: (err) => toast.error(kimaiErrorMessage(err, t)),
  });

  function pick(p: KimaiProject) {
    if (p.linkedTo) setConfirmMove(p);
    else link.mutate({ kimaiProjectId: p.id });
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { setConfirmMove(null); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('pm.kimai.linkTitle')}</DialogTitle>
        </DialogHeader>
        {confirmMove?.linkedTo ? (
          <>
            <p className="text-sm">
              {t('pm.kimai.moveWarning', {
                kimai: confirmMove.name,
                project: `${confirmMove.linkedTo.projectNumber} ${confirmMove.linkedTo.name}`,
              })}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmMove(null)}>{t('common.cancel')}</Button>
              <Button disabled={link.isPending} onClick={() => link.mutate({ kimaiProjectId: confirmMove.id, moveExisting: true })}>
                {link.isPending ? t('common.loading') : t('pm.kimai.moveConfirm')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" autoFocus placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
            {error && <p className="text-sm text-destructive">{kimaiErrorMessage(error, t)}</p>}
            {data && rows.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
            <div className="max-h-[50vh] overflow-y-auto space-y-1">
              {rows.map(p => {
                const current = p.linkedTo?.id === project.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={current || link.isPending}
                    onClick={() => pick(p)}
                    className="w-full text-left p-2 rounded-md border bg-card hover:bg-accent disabled:opacity-50 disabled:hover:bg-card"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      {p.number && <span className="text-xs text-muted-foreground">{p.number}</span>}
                      {isSuggested(p) && <Badge variant="default" className="text-xs">{t('pm.kimai.suggested')}</Badge>}
                      {!p.visible && <Badge variant="outline" className="text-xs">{t('pm.kimai.hidden')}</Badge>}
                    </div>
                    {p.customerName && <div className="text-xs text-muted-foreground">{p.customerName}</div>}
                    {p.linkedTo && !current && (
                      <div className="text-xs text-amber-600 dark:text-amber-400">
                        {t('pm.kimai.alreadyLinked', { project: `${p.linkedTo.projectNumber} ${p.linkedTo.name}` })}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ project, open, onClose }: { project: HoursProject; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const invalidate = useInvalidateLink(project.id);
  const choice = useKimaiCustomerChoice(project.customerName ?? '', open);

  const create = useMutation({
    mutationFn: () => api.post(`/pm/kimai/create/${project.id}`, choice.payload),
    onSuccess: () => {
      invalidate();
      toast.success(t('pm.kimai.createdOk'));
      onClose();
    },
    onError: (err) => toast.error(kimaiErrorMessage(err, t)),
    // Even a failed create may have added the customer
    onSettled: () => qc.invalidateQueries({ queryKey: ['pm-kimai-customers'] }),
  });

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pm.kimai.createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">{t('pm.kimai.createName', { name: kimaiSafeName(project.name) })}</p>
          <KimaiCustomerField choice={choice} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!choice.payload || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? t('common.loading') : t('pm.kimai.createConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectHoursTab({ project }: { project: HoursProject }) {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const perms = usePermissionsStore(s => s.perms);
  const canManage = !!user && (perms.projects?.manage ?? []).includes(user.role);
  const canSeeCost = !!user && (perms.projects?.labourCost ?? []).includes(user.role);
  const qc = useQueryClient();
  const invalidate = useInvalidateLink(project.id);
  const [dialog, setDialog] = useState<'link' | 'create' | null>(null);
  const linked = project.kimaiProjectId !== null;

  const { data: hours, isLoading } = useQuery<HoursData>({
    queryKey: ['pm-kimai-hours', project.id],
    queryFn: () => api.get(`/pm/kimai/hours/${project.id}`),
    enabled: linked,
  });
  // Shares its cache with the real profit tile on the project page
  const { data: cost, isLoading: costLoading } = useQuery<LabourCostData>({
    queryKey: ['pm-kimai-cost', project.id],
    queryFn: () => api.get(`/pm/kimai/cost/${project.id}`),
    enabled: linked && canSeeCost,
  });

  const unlink = useMutation({
    mutationFn: () => api.delete(`/pm/kimai/link/${project.id}`),
    onSuccess: () => { invalidate(); toast.success(t('pm.kimai.unlinkedOk')); },
    onError: (err) => toast.error(kimaiErrorMessage(err, t)),
  });

  const refresh = useMutation({
    mutationFn: () => api.post(`/pm/kimai/hours/${project.id}/refresh`),
    onSuccess: () => toast.success(t('pm.kimai.refreshedOk')),
    onError: (err) => toast.error(kimaiErrorMessage(err, t)),
    // A failed refresh still changes the saved error shown below
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['pm-kimai-hours', project.id] });
      qc.invalidateQueries({ queryKey: ['pm-kimai-cost', project.id] });
    },
  });

  return (
    <div className="mt-4 space-y-6">
      {/* One slim line: which Kimai project, when it was refreshed, and the actions */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3 text-sm">
          {linked ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <span className="min-w-0"><span className="text-muted-foreground">{t('pm.kimai.projectLabel')}: </span><span className="font-medium">{project.kimaiProjectName}</span></span>
              <span className="hidden sm:inline h-4 w-px bg-border" aria-hidden="true" />
              <span className="text-muted-foreground">
                {hours?.syncedAt ? t('pm.kimai.syncedAt', { date: formatDateTime(hours.syncedAt) }) : t('pm.kimai.neverSynced')}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">{t('pm.kimai.notLinked')}</span>
          )}
          <div className="flex flex-wrap gap-2">
            {linked && (
              <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refresh.isPending ? 'animate-spin' : ''}`} />{t('pm.kimai.refresh')}
              </Button>
            )}
            {canManage && (
              <>
                <Button size="sm" variant="outline" onClick={() => setDialog('link')}>
                  <Link2 className="h-3.5 w-3.5 mr-1" />{linked ? t('pm.kimai.changeLink') : t('pm.kimai.link')}
                </Button>
                {linked ? (
                  <Button size="sm" variant="outline" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
                    <Unlink className="h-3.5 w-3.5 mr-1" />{t('pm.kimai.unlink')}
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setDialog('create')}>
                    <Plus className="h-3.5 w-3.5 mr-1" />{t('pm.kimai.create')}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        {hours?.syncError && (
          <p className="text-sm text-destructive">{t('pm.kimai.syncFailed', { reason: t(hours.syncError) })}</p>
        )}
      </div>

      {linked && (isLoading || (canSeeCost && costLoading) || !hours
        ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        : <HoursOverview hours={hours} cost={canSeeCost ? cost : undefined} />)}
      <LinkDialog project={project} open={dialog === 'link'} onClose={() => setDialog(null)} />
      <CreateDialog project={project} open={dialog === 'create'} onClose={() => setDialog(null)} />
    </div>
  );
}
