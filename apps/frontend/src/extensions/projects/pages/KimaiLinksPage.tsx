import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeft, Link2, RefreshCw, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

const NONE = '__none__';
const MATCH_VARIANT: Record<LinkMatch, 'default' | 'secondary' | 'outline'> = { exact: 'default', same_name: 'secondary', similar: 'outline' };

function kimaiLabel(p: FreeKimaiProject) {
  return p.customerName ? `${p.name} — ${p.customerName}` : p.name;
}

function matchesSearch(term: string, values: (string | null)[]) {
  return !term || values.some(v => v?.toLowerCase().includes(term));
}

export default function KimaiLinksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('unlinked');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  // The user's choices; rows without one use the suggestion. A chosen Kimai project only links once its row is ticked.
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const [ticked, setTicked] = useState<Set<string>>(new Set());
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

  const availableKimaiIds = useMemo(() => new Set(kimaiProjects.map(k => k.id)), [kimaiProjects]);

  // A choice stops counting once its Kimai project is linked elsewhere, for example by the previous save
  const chosen = (p: UnlinkedProject) => {
    const kimaiId = p.id in picks ? picks[p.id] : p.suggestion?.kimaiProjectId ?? null;
    return kimaiId !== null && availableKimaiIds.has(kimaiId) ? kimaiId : null;
  };
  const tickedKimai = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of unlinked) {
      const kimaiId = chosen(p);
      if (ticked.has(p.id) && kimaiId !== null) map.set(kimaiId, p.id);
    }
    return map;
  }, [unlinked, ticked, picks, availableKimaiIds]);

  const term = search.trim().toLowerCase();
  const unlinkedRows = unlinked.filter(p =>
    (status === 'all' || p.status === status) && matchesSearch(term, [p.projectNumber, p.name, p.customerName]));
  const kimaiRows = kimaiProjects
    .filter(k => matchesSearch(term, [k.name, k.number, k.customerName]))
    .sort((a, b) => (hours.data?.[b.id] ?? 0) - (hours.data?.[a.id] ?? 0));
  const linkedRows = (data?.linked ?? []).filter(p => matchesSearch(term, [p.projectNumber, p.name, p.customerName, p.kimaiProjectName]));

  // Rows wanting the same Kimai project, which can only be linked once
  function competitors(p: UnlinkedProject) {
    const kimaiId = chosen(p);
    return kimaiId === null ? [] : unlinked.filter(other => other.id !== p.id && chosen(other) === kimaiId);
  }

  const exactRows = unlinkedRows.filter(p =>
    !(p.id in picks) && p.suggestion?.match === 'exact' && competitors(p).length === 0 && !ticked.has(p.id));

  function setTick(id: string, on: boolean) {
    setTicked(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  function pickKimai(p: UnlinkedProject, value: string) {
    const kimaiId = value === NONE ? null : Number(value);
    setPicks(prev => ({ ...prev, [p.id]: kimaiId }));
    if (kimaiId === null) setTick(p.id, false);
  }

  // From the Kimai tab: choosing a Servio project also ticks it, since that row isn't visible there
  function pickServio(kimaiId: number, value: string) {
    setTicked(prev => {
      const next = new Set(prev);
      const current = tickedKimai.get(kimaiId);
      if (current) next.delete(current);
      if (value !== NONE) next.add(value);
      return next;
    });
    if (value !== NONE) setPicks(prev => ({ ...prev, [value]: kimaiId }));
  }

  const link = useMutation({
    mutationFn: () => api.post<LinkResult>('/pm/kimai/links', {
      links: unlinked
        .filter(p => ticked.has(p.id) && chosen(p) !== null)
        .map(p => ({ projectId: p.id, kimaiProjectId: chosen(p) })),
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

  function matchBadge(p: UnlinkedProject) {
    const kimaiId = chosen(p);
    if (kimaiId === null) return <span className="text-xs text-muted-foreground">{t('pm.kimai.links.noMatch')}</span>;
    if (kimaiId !== p.suggestion?.kimaiProjectId) return <Badge variant="outline" className="text-xs">{t('pm.kimai.links.manual')}</Badge>;
    return <Badge variant={MATCH_VARIANT[p.suggestion.match]} className="text-xs">{t(`pm.kimai.links.match.${p.suggestion.match}`)}</Badge>;
  }

  const selectedCount = unlinked.filter(p => ticked.has(p.id) && chosen(p) !== null).length;
  const failedLabel = (projectId: string) => {
    const p = unlinked.find(row => row.id === projectId);
    return p ? `${p.projectNumber} ${p.name}` : projectId;
  };

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
          {result.failed.map(f => <p key={f.projectId} className="text-destructive">{failedLabel(f.projectId)}: {t(f.error)}</p>)}
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
                const kimaiId = chosen(p);
                const others = competitors(p);
                const blocked = kimaiId === null || (tickedKimai.has(kimaiId) && tickedKimai.get(kimaiId) !== p.id);
                return (
                  <div key={p.id} className="grid gap-3 p-3 items-center md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.7fr)]">
                    <Checkbox
                      aria-label={`${p.projectNumber} ${p.name}`}
                      checked={ticked.has(p.id) && kimaiId !== null}
                      disabled={kimaiId === null || (blocked && !ticked.has(p.id))}
                      onCheckedChange={v => setTick(p.id, v === true)}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{p.projectNumber} {p.name}</p>
                      <p className="text-xs text-muted-foreground break-words">{p.customerName ?? '—'}</p>
                    </div>
                    <Select value={kimaiId === null ? NONE : String(kimaiId)} onValueChange={v => pickKimai(p, v)}>
                      <SelectTrigger className="text-left"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('pm.kimai.links.selectKimai')}</SelectItem>
                        {kimaiProjects
                          .filter(k => !tickedKimai.has(k.id) || tickedKimai.get(k.id) === p.id)
                          .map(k => <SelectItem key={k.id} value={String(k.id)}>{kimaiLabel(k)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap items-center gap-2">
                      {matchBadge(p)}
                      {others.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          {t('pm.kimai.links.alsoSuggested', { project: others[0].projectNumber })}
                        </span>
                      )}
                    </div>
                  </div>
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
                return (
                  <div key={k.id} className="grid gap-3 p-3 items-center md:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.2fr)]">
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">
                        {k.name}
                        {!k.visible && <Badge variant="outline" className="text-xs ml-2">{t('pm.kimai.hidden')}</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground break-words">{k.customerName ?? '—'}</p>
                    </div>
                    <p className="text-sm font-medium whitespace-nowrap md:text-right md:min-w-20">
                      {hours.data ? formatHours(hours.data[k.id] ?? 0) : hours.isError ? '—' : t('common.loading')}
                    </p>
                    <Select value={assigned ?? NONE} onValueChange={v => pickServio(k.id, v)}>
                      <SelectTrigger className="text-left"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('pm.kimai.links.selectServio')}</SelectItem>
                        {unlinked
                          .filter(p => !ticked.has(p.id) || p.id === assigned)
                          .map(p => <SelectItem key={p.id} value={p.id}>{p.projectNumber} {p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
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
    </div>
  );
}
