import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, ChevronDown, Link2, RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { kimaiErrorMessage } from '../kimai';
import { formatHours } from '../hoursFormat';

type LinkMatch = 'exact' | 'same_name' | 'similar';

interface UnlinkedProject {
  id: string;
  projectNumber: string;
  name: string;
  customerName: string | null;
  status: string;
  suggestion: { kimaiProjectId: number; match: LinkMatch } | null;
}
interface FreeKimaiProject {
  id: number;
  name: string;
  number: string | null;
  customerName: string | null;
  visible: boolean;
}
interface LinkedProject {
  id: string;
  projectNumber: string;
  name: string;
  customerName: string | null;
  kimaiProjectName: string | null;
  syncError: string | null;
  seconds: number;
}
interface LinksData { unlinked: UnlinkedProject[]; kimai: FreeKimaiProject[]; linked: LinkedProject[]; }
interface LinkResult { linked: string[]; failed: { projectId: string; error: string }[]; }
interface PickerOption { value: string; label: string; detail: string | null; }
type PickerTarget = { kind: 'kimai'; projectId: string } | { kind: 'servio'; kimaiId: number };

const MAX_PICKER_OPTIONS = 100;
const MATCH_VARIANT: Record<LinkMatch, 'default' | 'secondary' | 'outline'> = { exact: 'default', same_name: 'secondary', similar: 'outline' };

function kimaiLabel(p: FreeKimaiProject) {
  return p.customerName ? `${p.name} — ${p.customerName}` : p.name;
}

function matchesSearch(term: string, values: (string | null)[]) {
  return !term || values.some(v => v?.toLowerCase().includes(term));
}

// One shared window with a search, opened from any row. With a dropdown per row,
// every row would have to redraw the whole project list on every click.
function PickerDialog({ title, options, clearLabel, onPick, onClear, onClose }: {
  title: string;
  options: PickerOption[];
  clearLabel: string;
  onPick: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const matching = useMemo(() => options.filter(o => matchesSearch(term, [o.label, o.detail])), [options, term]);
  const shown = matching.slice(0, MAX_PICKER_OPTIONS);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" autoFocus placeholder={t('common.search')} value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="max-h-[50vh] overflow-y-auto space-y-1">
          <button type="button" onClick={onClear} className="w-full text-left p-2 rounded-md text-sm text-muted-foreground hover:bg-accent">
            {clearLabel}
          </button>
          {shown.map(o => (
            <button key={o.value} type="button" onClick={() => onPick(o.value)} className="w-full text-left p-2 rounded-md border bg-card hover:bg-accent">
              <span className="block text-sm font-medium break-words">{o.label}</span>
              {o.detail && <span className="block text-xs text-muted-foreground break-words">{o.detail}</span>}
            </button>
          ))}
          {matching.length === 0 && <p className="p-2 text-sm text-muted-foreground">{t('common.noData')}</p>}
        </div>
        {matching.length > shown.length && (
          <p className="text-xs text-muted-foreground">{t('pm.kimai.links.moreResults', { shown: shown.length, total: matching.length })}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickerButton({ label, empty, ariaLabel, onClick }: { label: string | null; empty: string; ariaLabel: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" aria-label={ariaLabel} onClick={onClick} className="w-full justify-between font-normal min-w-0">
      <span className={`truncate ${label ? '' : 'text-muted-foreground'}`}>{label ?? empty}</span>
      <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
    </Button>
  );
}

const UnlinkedRow = memo(function UnlinkedRow({ project, kimaiText, match, conflictWith, checked, disabled, onToggle, onOpen }: {
  project: UnlinkedProject;
  kimaiText: string | null;
  match: LinkMatch | 'manual' | null;
  conflictWith: string | null;
  checked: boolean;
  disabled: boolean;
  onToggle: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const name = `${project.projectNumber} ${project.name}`;
  return (
    <div className="grid gap-3 p-3 items-center md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.7fr)]">
      <Checkbox aria-label={name} checked={checked} disabled={disabled} onCheckedChange={v => onToggle(project.id, v === true)} />
      <div className="min-w-0">
        <p className="text-sm font-medium break-words">{name}</p>
        <p className="text-xs text-muted-foreground break-words">{project.customerName ?? '—'}</p>
      </div>
      <PickerButton
        label={kimaiText}
        empty={t('pm.kimai.links.selectKimai')}
        ariaLabel={`${t('pm.kimai.links.selectKimai')}: ${name}`}
        onClick={() => onOpen(project.id)}
      />
      <div className="flex flex-wrap items-center gap-2">
        {match === null && <span className="text-xs text-muted-foreground">{t('pm.kimai.links.noMatch')}</span>}
        {match === 'manual' && <Badge variant="outline" className="text-xs">{t('pm.kimai.links.manual')}</Badge>}
        {match !== null && match !== 'manual' && (
          <Badge variant={MATCH_VARIANT[match]} className="text-xs">{t(`pm.kimai.links.match.${match}`)}</Badge>
        )}
        {conflictWith && (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {t('pm.kimai.links.alsoSuggested', { project: conflictWith })}
          </span>
        )}
      </div>
    </div>
  );
});

const KimaiRow = memo(function KimaiRow({ project, hoursText, assignedText, onOpen }: {
  project: FreeKimaiProject;
  hoursText: string;
  assignedText: string | null;
  onOpen: (id: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 p-3 items-center md:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.2fr)]">
      <div className="min-w-0">
        <p className="text-sm font-medium break-words">
          {project.name}
          {!project.visible && <Badge variant="outline" className="text-xs ml-2">{t('pm.kimai.hidden')}</Badge>}
        </p>
        <p className="text-xs text-muted-foreground break-words">{project.customerName ?? '—'}</p>
      </div>
      <p className="text-sm font-medium whitespace-nowrap md:text-right md:min-w-20">{hoursText}</p>
      <PickerButton
        label={assignedText}
        empty={t('pm.kimai.links.selectServio')}
        ariaLabel={`${t('pm.kimai.links.selectServio')}: ${project.name}`}
        onClick={() => onOpen(project.id)}
      />
    </div>
  );
});

export default function KimaiLinksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('unlinked');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);
  const [status, setStatus] = useState('all');
  // The user's choices; rows without one use the suggestion. A chosen Kimai project only links once its row is ticked.
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [result, setResult] = useState<LinkResult | null>(null);

  const { data, isLoading, error, isFetching, refetch } = useQuery<LinksData>({
    queryKey: ['pm-kimai-links'],
    queryFn: () => api.get('/pm/kimai/links'),
    retry: false,
  });
  const hours = useQuery<Record<string, number>>({
    queryKey: ['pm-kimai-links-hours'],
    queryFn: () => api.get('/pm/kimai/links/hours'),
    enabled: tab === 'kimai',
    retry: false,
  });

  const unlinked = useMemo(() => data?.unlinked ?? [], [data]);
  const kimaiProjects = useMemo(() => data?.kimai ?? [], [data]);
  const kimaiById = useMemo(() => new Map(kimaiProjects.map(k => [k.id, k])), [kimaiProjects]);

  // A choice stops counting once its Kimai project is linked elsewhere, for example by the previous save
  const chosenById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const p of unlinked) {
      const kimaiId = p.id in picks ? picks[p.id] : p.suggestion?.kimaiProjectId ?? null;
      map.set(p.id, kimaiId !== null && kimaiById.has(kimaiId) ? kimaiId : null);
    }
    return map;
  }, [unlinked, picks, kimaiById]);

  // Rows per chosen Kimai project, which can only be linked once
  const rowsByKimai = useMemo(() => {
    const map = new Map<number, UnlinkedProject[]>();
    for (const p of unlinked) {
      const kimaiId = chosenById.get(p.id);
      if (kimaiId == null) continue;
      map.set(kimaiId, [...(map.get(kimaiId) ?? []), p]);
    }
    return map;
  }, [unlinked, chosenById]);

  const tickedKimai = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of unlinked) {
      const kimaiId = chosenById.get(p.id);
      if (ticked.has(p.id) && kimaiId != null) map.set(kimaiId, p.id);
    }
    return map;
  }, [unlinked, chosenById, ticked]);

  const term = debouncedSearch.trim().toLowerCase();
  const unlinkedRows = useMemo(() => unlinked.filter(p =>
    (status === 'all' || p.status === status) && matchesSearch(term, [p.projectNumber, p.name, p.customerName])), [unlinked, status, term]);
  const kimaiRows = useMemo(() => kimaiProjects
    .filter(k => matchesSearch(term, [k.name, k.number, k.customerName]))
    .sort((a, b) => (hours.data?.[b.id] ?? 0) - (hours.data?.[a.id] ?? 0)), [kimaiProjects, term, hours.data]);
  const linkedRows = useMemo(() => (data?.linked ?? [])
    .filter(p => matchesSearch(term, [p.projectNumber, p.name, p.customerName, p.kimaiProjectName])), [data, term]);

  const exactRows = useMemo(() => unlinkedRows.filter(p => {
    const kimaiId = chosenById.get(p.id);
    return !(p.id in picks) && p.suggestion?.match === 'exact' && kimaiId != null
      && rowsByKimai.get(kimaiId)?.length === 1 && !ticked.has(p.id);
  }), [unlinkedRows, chosenById, picks, rowsByKimai, ticked]);

  const setTick = useCallback((id: string, on: boolean) => {
    setTicked(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const openKimaiPicker = useCallback((projectId: string) => setPicker({ kind: 'kimai', projectId }), []);
  const openServioPicker = useCallback((kimaiId: number) => setPicker({ kind: 'servio', kimaiId }), []);

  function applyPick(value: string | null) {
    if (picker?.kind === 'kimai') {
      setPicks(prev => ({ ...prev, [picker.projectId]: value === null ? null : Number(value) }));
      if (value === null) setTick(picker.projectId, false);
    } else if (picker?.kind === 'servio') {
      // Choosing a Servio project also ticks it, since that row isn't visible on this tab
      const { kimaiId } = picker;
      setTicked(prev => {
        const next = new Set(prev);
        const current = tickedKimai.get(kimaiId);
        if (current) next.delete(current);
        if (value !== null) next.add(value);
        return next;
      });
      if (value !== null) setPicks(prev => ({ ...prev, [value]: kimaiId }));
    }
    setPicker(null);
  }

  const pickerOptions = useMemo((): PickerOption[] => {
    if (picker?.kind === 'kimai') {
      return kimaiProjects
        .filter(k => !tickedKimai.has(k.id) || tickedKimai.get(k.id) === picker.projectId)
        .map(k => ({ value: String(k.id), label: k.name, detail: k.customerName }));
    }
    if (picker?.kind === 'servio') {
      const assigned = tickedKimai.get(picker.kimaiId);
      return unlinked
        .filter(p => !ticked.has(p.id) || p.id === assigned)
        .map(p => ({ value: p.id, label: `${p.projectNumber} ${p.name}`, detail: p.customerName }));
    }
    return [];
  }, [picker, kimaiProjects, unlinked, ticked, tickedKimai]);

  const link = useMutation({
    mutationFn: () => api.post<LinkResult>('/pm/kimai/links', {
      links: unlinked
        .filter(p => ticked.has(p.id) && chosenById.get(p.id) != null)
        .map(p => ({ projectId: p.id, kimaiProjectId: chosenById.get(p.id) })),
    }),
    onSuccess: (res) => {
      setResult(res);
      const failedIds = new Set(res.failed.map(f => f.projectId));
      setTicked(prev => new Set([...prev].filter(id => failedIds.has(id))));
      if (res.linked.length > 0) toast.success(t('pm.kimai.links.linkedCount', { count: res.linked.length }));
      qc.invalidateQueries({ queryKey: ['pm-kimai-links'] });
      qc.invalidateQueries({ queryKey: ['pm-kimai-links-hours'] });
      qc.invalidateQueries({ queryKey: ['pm-kimai-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-project'] });
    },
    onError: (err) => toast.error(kimaiErrorMessage(err, t)),
  });

  function matchOf(p: UnlinkedProject, kimaiId: number | null): LinkMatch | 'manual' | null {
    if (kimaiId === null) return null;
    return kimaiId === p.suggestion?.kimaiProjectId ? p.suggestion.match : 'manual';
  }

  const selectedCount = useMemo(() => unlinked.filter(p => ticked.has(p.id) && chosenById.get(p.id) != null).length, [unlinked, ticked, chosenById]);
  const projectLabel = useCallback((id: string) => {
    const p = unlinked.find(row => row.id === id);
    return p ? `${p.projectNumber} ${p.name}` : null;
  }, [unlinked]);

  return (
    <div className="p-4 md:p-6 space-y-4 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate('/pm/projects')}>
            <ArrowLeft className="h-4 w-4 mr-1" />{t('pm.projects.title')}
          </Button>
          <h1 className="text-2xl font-bold">{t('pm.kimai.links.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pm.kimai.links.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />{t('pm.kimai.links.reload')}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {error && <p className="text-sm text-destructive">{kimaiErrorMessage(error, t)}</p>}

      {result && result.failed.length > 0 && (
        <div className="rounded-md border border-destructive/40 p-3 text-sm space-y-1">
          <p className="font-medium">{t('pm.kimai.links.resultSummary', { linked: result.linked.length, failed: result.failed.length })}</p>
          {result.failed.map(f => <p key={f.projectId} className="text-destructive">{projectLabel(f.projectId) ?? f.projectId}: {t(f.error)}</p>)}
        </div>
      )}

      {data && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="unlinked">{t('pm.kimai.links.tabUnlinked')} ({unlinked.length})</TabsTrigger>
            <TabsTrigger value="kimai">{t('pm.kimai.links.tabKimai')} ({kimaiProjects.length})</TabsTrigger>
            <TabsTrigger value="linked">{t('pm.kimai.links.tabLinked')} ({data.linked.length})</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {tab === 'unlinked' && (
              <>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('pm.projects.allStatuses')}</SelectItem>
                    <SelectItem value="active">{t('pm.status.active')}</SelectItem>
                    <SelectItem value="on_hold">{t('pm.status.on_hold')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" disabled={exactRows.length === 0} onClick={() => setTicked(prev => new Set([...prev, ...exactRows.map(p => p.id)]))}>
                  {t('pm.kimai.links.tickExact', { count: exactRows.length })}
                </Button>
              </>
            )}
          </div>

          <TabsContent value="unlinked" className="mt-4">
            {unlinkedRows.length === 0 && <p className="text-sm text-muted-foreground">{t('pm.kimai.links.noneUnlinked')}</p>}
            <div className="divide-y rounded-md border">
              {unlinkedRows.map(p => {
                const kimaiId = chosenById.get(p.id) ?? null;
                const kimai = kimaiId === null ? undefined : kimaiById.get(kimaiId);
                const conflict = kimaiId === null ? undefined : rowsByKimai.get(kimaiId)?.find(other => other.id !== p.id);
                const holder = kimaiId === null ? undefined : tickedKimai.get(kimaiId);
                const isTicked = ticked.has(p.id) && kimaiId !== null;
                return (
                  <UnlinkedRow
                    key={p.id}
                    project={p}
                    kimaiText={kimai ? kimaiLabel(kimai) : null}
                    match={matchOf(p, kimaiId)}
                    conflictWith={conflict?.projectNumber ?? null}
                    checked={isTicked}
                    disabled={kimaiId === null || (!isTicked && !!holder && holder !== p.id)}
                    onToggle={setTick}
                    onOpen={openKimaiPicker}
                  />
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="kimai" className="mt-4">
            {kimaiRows.length === 0 && <p className="text-sm text-muted-foreground">{t('pm.kimai.links.noneKimai')}</p>}
            {hours.isError && <p className="text-sm text-muted-foreground mb-2">{t('pm.kimai.links.hoursFailed')}</p>}
            <div className="divide-y rounded-md border">
              {kimaiRows.map(k => {
                const assigned = tickedKimai.get(k.id);
                let hoursText = t('common.loading');
                if (hours.data) hoursText = formatHours(hours.data[k.id] ?? 0);
                else if (hours.isError) hoursText = '—';
                return (
                  <KimaiRow
                    key={k.id}
                    project={k}
                    hoursText={hoursText}
                    assignedText={assigned ? projectLabel(assigned) : null}
                    onOpen={openServioPicker}
                  />
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="linked" className="mt-4">
            {linkedRows.length === 0 && <p className="text-sm text-muted-foreground">{t('pm.kimai.links.noneLinked')}</p>}
            <div className="divide-y rounded-md border">
              {linkedRows.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/pm/projects/${p.id}`)}
                  className="w-full text-left grid gap-3 p-3 items-center hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{p.projectNumber} {p.name}</p>
                    <p className="text-xs text-muted-foreground break-words">{p.customerName ?? '—'}</p>
                  </div>
                  <p className="text-sm break-words">{p.kimaiProjectName}</p>
                  <div className="md:text-right">
                    <p className="text-sm font-medium whitespace-nowrap">{formatHours(p.seconds)}</p>
                    {p.syncError && <p className="text-xs text-destructive">{t(p.syncError)}</p>}
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {data && tab !== 'linked' && (
        <div className="sticky bottom-0 -mx-4 md:-mx-6 border-t bg-background px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('pm.kimai.links.selected', { count: selectedCount })}</p>
          <Button disabled={selectedCount === 0 || link.isPending} onClick={() => link.mutate()}>
            <Link2 className="h-4 w-4 mr-2" />
            {link.isPending ? t('common.loading') : t('pm.kimai.links.linkSelected', { count: selectedCount })}
          </Button>
        </div>
      )}

      {picker && (
        <PickerDialog
          title={t(picker.kind === 'kimai' ? 'pm.kimai.links.selectKimai' : 'pm.kimai.links.selectServio')}
          options={pickerOptions}
          clearLabel={t('pm.kimai.links.clearChoice')}
          onPick={applyPick}
          onClear={() => applyPick(null)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
