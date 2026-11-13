import { useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, SlidersHorizontal, ShieldCheck, ChevronUp, ChevronDown, ChevronsUpDown, X, Copy, Check, FileDown, ExternalLink, ListFilter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  ipAddress: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditLogFilters {
  actions: string[];
  entityTypes: string[];
  users: { id: string; email: string | null; name: string | null }[];
}

type SortField = 'createdAt' | 'userEmail' | 'action' | 'entityType' | 'ipAddress';

const ALL = '__all';
const PAGE_SIZE = 50;

const columnHelper = createColumnHelper<AuditLogEntry>();

// Checked in order, so the more specific keys must come first
const ACTION_COLOR: Record<string, string> = {
  failed: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  create: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  delete: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  deactivate: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  restore: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  reset: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400',
  login: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
  logout: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
  complete: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  send: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400',
};

function actionColor(action: string): string {
  const key = Object.keys(ACTION_COLOR).find((k) => action.toLowerCase().includes(k));
  return key ? ACTION_COLOR[key] : 'bg-muted text-muted-foreground';
}

// yyyy-mm-dd (local) → ISO timestamp at the start or end of that local day
function dayBoundary(iso: string, end: boolean): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const d = end
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999)
    : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toISOString();
}

const SETTINGS_SECTION_TAB: Record<string, string> = {
  general: 'general', logo: 'general', smtp: 'smtp', smb: 'smb', backup: 'backup', alerts: 'alerts', kimai: 'extensions',
};
const ACTION_SETTINGS_TAB: Record<string, string> = {
  create_backup: 'backup', restore_backup: 'backup', test_smtp: 'smtp', test_digest: 'alerts', test_smb: 'smb', restart_services: 'general',
};

// Where an entry points to in the app: a path, 'resolve' (needs a server lookup), or null (nowhere to go)
function entityTarget(entry: AuditLogEntry): string | 'resolve' | null {
  const id = entry.entityId;
  switch (entry.entityType) {
    case 'facility': return id ? `/facilities/${id}` : null;
    case 'pm_project': return id ? `/pm/projects/${id}` : null;
    case 'contract':
    case 'review': return id ? 'resolve' : null;
    case 'invoice': return '/invoices';
    case 'user': return '/users';
    case 'permissions': return '/settings?tab=roles';
    case 'email_template': return '/settings?tab=templates';
    case 'system': return '/settings?tab=updates';
    case 'settings': {
      const section = typeof entry.payload?.section === 'string' ? entry.payload.section : '';
      return `/settings?tab=${SETTINGS_SECTION_TAB[section] ?? 'general'}`;
    }
  }
  const tab = ACTION_SETTINGS_TAB[entry.action];
  return tab ? `/settings?tab=${tab}` : null;
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [search, setSearch] = useState('');
  const [action, setAction] = useState(ALL);
  const [entityType, setEntityType] = useState(ALL);
  const [userId, setUserId] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [entityId, setEntityId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebounce(search.trim(), 300);
  const navigate = useNavigate();
  const fieldLabel = useFieldLabel();

  const openEntity = useCallback(async (entry: AuditLogEntry) => {
    const target = entityTarget(entry);
    if (!target) return;
    if (target !== 'resolve') { navigate(target); return; }
    try {
      const { path } = await api.get<{ path: string | null }>(
        `/audit-logs/resolve/${encodeURIComponent(entry.entityType!)}/${encodeURIComponent(entry.entityId!)}`,
      );
      if (path) navigate(path);
      else toast.error(t('auditLog.entityGone'));
    } catch {
      toast.error(t('errors.internal'));
    }
  }, [navigate, t]);

  const actionLabel = useCallback(
    (a: string) => t(`auditLog.actions.${a}`, { defaultValue: a.replace(/_/g, ' ') }),
    [t],
  );
  const entityLabel = useCallback(
    (e: string) => t(`auditLog.entities.${e}`, { defaultValue: e.replace(/_/g, ' ') }),
    [t],
  );

  const { data: filterOptions } = useQuery({
    queryKey: ['audit-logs', 'filters'],
    queryFn: () => api.get<AuditLogFilters>('/audit-logs/filters'),
    staleTime: 60_000,
  });

  const sortBy = (sorting[0]?.id ?? 'createdAt') as SortField;
  const sortDir = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : 'desc';

  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), sortBy, sortDir });
    if (debouncedSearch) p.set('search', debouncedSearch);
    if (action !== ALL) p.set('action', action);
    if (entityType !== ALL) p.set('entityType', entityType);
    if (entityId) p.set('entityId', entityId);
    if (userId !== ALL) p.set('userId', userId);
    const fromIso = from ? dayBoundary(from, false) : undefined;
    const toIso = to ? dayBoundary(to, true) : undefined;
    if (fromIso) p.set('from', fromIso);
    if (toIso) p.set('to', toIso);
    return p.toString();
  }, [debouncedSearch, action, entityType, entityId, userId, from, to, sortBy, sortDir]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching } = useInfiniteQuery({
    queryKey: ['audit-logs', 'list', params],
    queryFn: ({ pageParam }) =>
      api.get<{ data: AuditLogEntry[]; total: number; totalPages: number }>(
        `/audit-logs?${params}&page=${pageParam}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPageParam < lastPage.totalPages ? lastPageParam + 1 : undefined,
    placeholderData: keepPreviousData,
  });

  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!node) return;
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    });
    observerRef.current.observe(node);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Must be referentially stable — a new array each render makes react-table reset state and re-render forever
  const entries = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;

  const hasFilters = search !== '' || action !== ALL || entityType !== ALL || entityId !== null || userId !== ALL || from !== '' || to !== '';
  function clearFilters() {
    setSearch(''); setAction(ALL); setEntityType(ALL); setEntityId(null); setUserId(ALL); setFrom(''); setTo('');
  }

  // "Show all entries for …" from the detail dialog: replaces the current filters with just that one
  function filterByEntity(entry: AuditLogEntry) {
    clearFilters();
    setEntityType(entry.entityType ?? ALL);
    setEntityId(entry.entityId);
    setSelected(null);
  }
  function filterByUser(entry: AuditLogEntry) {
    clearFilters();
    if (entry.userId) setUserId(entry.userId);
    setSelected(null);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/audit-logs/export?${params}`, {
        headers: { Authorization: `Bearer ${useAuthStore.getState().token ?? ''}` },
      });
      if (!res.ok) { toast.error(t('errors.internal')); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setExporting(false);
    }
  }

  const columns = useMemo(() => [
    columnHelper.accessor('createdAt', {
      id: 'createdAt',
      header: t('auditLog.timestamp'),
      cell: (info) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(info.getValue())}</span>,
    }),
    columnHelper.accessor('userEmail', {
      id: 'userEmail',
      header: t('auditLog.user'),
      cell: (info) => {
        const row = info.row.original;
        if (!row.userEmail && !row.userName) return <span className="text-xs text-muted-foreground">{t('auditLog.system')}</span>;
        return (
          <div className="leading-tight">
            <div className="text-sm">{row.userName ?? row.userEmail}</div>
            {row.userName && row.userEmail && <div className="text-xs text-muted-foreground">{row.userEmail}</div>}
          </div>
        );
      },
    }),
    columnHelper.accessor('action', {
      id: 'action',
      header: t('auditLog.action'),
      cell: (info) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${actionColor(info.getValue())}`}>
          {actionLabel(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('entityType', {
      id: 'entityType',
      header: t('auditLog.entity'),
      cell: (info) => {
        const row = info.row.original;
        if (!info.getValue()) return <span className="text-muted-foreground text-xs">—</span>;
        const content = (
          <>
            {entityLabel(info.getValue()!)}
            {row.entityId && <span className="ml-1 font-mono opacity-60">#{row.entityId.slice(0, 8)}</span>}
          </>
        );
        if (!entityTarget(row)) return <span className="text-xs text-muted-foreground">{content}</span>;
        return (
          <button
            type="button"
            className="text-xs text-primary hover:underline text-left"
            onClick={(e) => { e.stopPropagation(); void openEntity(row); }}
          >
            {content}
          </button>
        );
      },
    }),
    columnHelper.display({
      id: 'details',
      header: t('auditLog.details'),
      enableSorting: false,
      cell: (info) => {
        const summary = payloadSummary(info.row.original.payload, fieldLabel, t('auditLog.changed'));
        return summary
          ? <span className="block max-w-[320px] truncate text-xs text-muted-foreground" title={summary}>{summary}</span>
          : <span className="text-muted-foreground text-xs">—</span>;
      },
    }),
    columnHelper.accessor('ipAddress', {
      id: 'ipAddress',
      header: t('auditLog.ipAddress'),
      cell: (info) => <span className="text-xs font-mono text-muted-foreground">{info.getValue() ?? '—'}</span>,
    }),
  ], [t, actionLabel, entityLabel, openEntity, fieldLabel]);

  const table = useReactTable({
    data: entries,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: false,
    sortDescFirst: true,
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('auditLog.title')}</h1>
          {!isLoading && (
            <p className="text-sm text-muted-foreground mt-0.5">{total} {t('common.total').toLowerCase()}</p>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('auditLog.allActions')}</SelectItem>
            <SelectSeparator />
            {(filterOptions?.actions ?? []).map((a) => (
              <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={entityType} onValueChange={(v) => { setEntityType(v); setEntityId(null); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('auditLog.allEntities')}</SelectItem>
            <SelectSeparator />
            {(filterOptions?.entityTypes ?? []).map((e) => (
              <SelectItem key={e} value={e}>{entityLabel(e)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('auditLog.allUsers')}</SelectItem>
            <SelectSeparator />
            {(filterOptions?.users ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name ?? u.email ?? u.id.slice(0, 8)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <DateInput value={from} onChange={setFrom} className="w-[140px]" title={t('auditLog.from')} />
          <span className="text-muted-foreground text-sm">–</span>
          <DateInput value={to} onChange={setTo} className="w-[140px]" title={t('auditLog.to')} />
        </div>

        {entityId && (
          <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2.5 pr-1 py-0.5 text-xs">
            {entityType !== ALL && entityLabel(entityType)}
            <span className="font-mono opacity-70">#{entityId.slice(0, 8)}</span>
            <button type="button" className="rounded-full p-0.5 hover:bg-muted" onClick={() => setEntityId(null)}>
              <X className="h-3 w-3" />
            </button>
          </span>
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            {t('auditLog.clearFilters')}
          </Button>
        )}

        <Button variant="outline" size="sm" className="ml-auto" disabled={exporting || total === 0} onClick={handleExport}>
          <FileDown className="h-4 w-4 mr-2" />
          {exporting ? t('common.loading') : t('auditLog.exportCsv')}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              {t('common.columns')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('common.toggleColumns')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table.getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onCheckedChange={(val) => col.toggleVisibility(!!val)}
                >
                  {col.columnDef.header as string}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className={`rounded-md border overflow-x-auto transition-opacity ${isFetching && !isFetchingNextPage && !isLoading ? 'opacity-60' : ''}`}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/30 hover:bg-muted/30">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className={h.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getCanSort() && (
                        h.column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" /> :
                        h.column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" /> :
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i}>
                  {table.getVisibleLeafColumns().map((col) => <TableCell key={col.id}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="text-center py-16 text-muted-foreground">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {t('common.noData')}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/20"
                  onClick={() => setSelected(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {isFetchingNextPage && (
          <div className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
        )}
        <div ref={loadMoreRef} className="h-4" />
      </div>

      <AuditLogDetailDialog
        entry={selected}
        onClose={() => setSelected(null)}
        actionLabel={actionLabel}
        entityLabel={entityLabel}
        onOpenEntity={(entry) => { setSelected(null); void openEntity(entry); }}
        onFilterEntity={filterByEntity}
        onFilterUser={filterByUser}
      />
    </div>
  );
}

// ─── Payload helpers ────────────────────────────────────────────────────────

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

type Changes = Record<string, { from: unknown; to: unknown }>;

// Update entries store { changes: { field: { from, to } } }; older entries don't have it
function getChanges(payload: Record<string, unknown> | null): Changes | null {
  const c = payload?.changes;
  return c && typeof c === 'object' && !Array.isArray(c) ? (c as Changes) : null;
}

function payloadSummary(payload: Record<string, unknown> | null, fieldLabel: (k: string) => string, changedLabel: string): string {
  if (!payload) return '';
  const changes = getChanges(payload);
  const rest = Object.entries(payload)
    .filter(([k, v]) => k !== 'changes' && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${formatScalar(v)}`);
  if (changes && Object.keys(changes).length > 0) {
    rest.push(`${changedLabel}: ${Object.keys(changes).map(fieldLabel).join(', ')}`);
  }
  return rest.join(' · ');
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function useFieldLabel() {
  const { t } = useTranslation();
  return useCallback((key: string) => {
    // Permission keys look like 'invoices.reset': label each part on its own
    if (key.includes('.')) return key.split('.').map(humanizeKey).join(' · ');
    return t(`auditLog.fields.${key}`, { defaultValue: humanizeKey(key) });
  }, [t]);
}

function PayloadValue({ value }: { value: unknown }) {
  const { t } = useTranslation();
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
  if (typeof value === 'boolean') return <span>{value ? t('common.yes') : t('common.no')}</span>;
  if (Array.isArray(value) && value.every((v) => typeof v !== 'object' || v === null)) {
    return value.length === 0
      ? <span className="text-muted-foreground">—</span>
      : <span className="break-all">{value.join(', ')}</span>;
  }
  if (typeof value === 'object') {
    return (
      <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted/40 rounded p-2 max-h-48 overflow-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  // Known code values (e.g. a failed login's reason) get a translated label
  const text = String(value);
  const label = /^[a-z_]+$/.test(text) ? t(`auditLog.values.${text}`, { defaultValue: text }) : text;
  return <span className="break-all">{label}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ml-1.5 inline-flex text-muted-foreground hover:text-foreground align-middle"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable */ }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function AuditLogDetailDialog({ entry, onClose, actionLabel, entityLabel, onOpenEntity, onFilterEntity, onFilterUser }: {
  entry: AuditLogEntry | null;
  onClose: () => void;
  actionLabel: (a: string) => string;
  entityLabel: (e: string) => string;
  onOpenEntity: (entry: AuditLogEntry) => void;
  onFilterEntity: (entry: AuditLogEntry) => void;
  onFilterUser: (entry: AuditLogEntry) => void;
}) {
  const { t } = useTranslation();
  const fieldLabel = useFieldLabel();
  const changes = getChanges(entry?.payload ?? null);
  const changeEntries = changes ? Object.entries(changes) : [];
  const payloadEntries = entry?.payload ? Object.entries(entry.payload).filter(([k]) => !(k === 'changes' && changes)) : [];

  return (
    <Dialog open={!!entry} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(entry.action)}`}>
                  {actionLabel(entry.action)}
                </span>
                {entry.entityType && <span className="text-base font-medium">{entityLabel(entry.entityType)}</span>}
              </DialogTitle>
              <DialogDescription>{formatDateTime(entry.createdAt)}</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t('auditLog.user')}</dt>
              <dd>
                {entry.userName || entry.userEmail
                  ? <>{entry.userName ?? entry.userEmail}{entry.userName && entry.userEmail && <span className="text-muted-foreground"> · {entry.userEmail}</span>}</>
                  : <span className="text-muted-foreground">{t('auditLog.system')}</span>}
              </dd>

              <dt className="text-muted-foreground">{t('auditLog.ipAddress')}</dt>
              <dd className="font-mono text-xs self-center">{entry.ipAddress ?? '—'}</dd>

              {entry.entityId && (
                <>
                  <dt className="text-muted-foreground">{t('auditLog.entityId')}</dt>
                  <dd className="font-mono text-xs self-center break-all">
                    {entry.entityId}
                    <CopyButton text={entry.entityId} />
                  </dd>
                </>
              )}
            </dl>

            {changes && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t('auditLog.changes')}</h3>
                {changeEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('auditLog.noChanges')}</p>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <div className="grid grid-cols-[140px_1fr_1fr] gap-x-4 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30">
                      <div>{t('auditLog.field')}</div>
                      <div>{t('auditLog.before')}</div>
                      <div>{t('auditLog.after')}</div>
                    </div>
                    <div className="divide-y border-t">
                      {changeEntries.map(([key, { from, to }]) => (
                        <div key={key} className="grid grid-cols-[140px_1fr_1fr] gap-x-4 px-3 py-2 text-sm">
                          <div className="text-muted-foreground">{fieldLabel(key)}</div>
                          <div className="min-w-0 text-red-700 dark:text-red-400"><PayloadValue value={from} /></div>
                          <div className="min-w-0 text-green-700 dark:text-green-400"><PayloadValue value={to} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(!changes || payloadEntries.length > 0) && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('auditLog.details')}</h3>
              {payloadEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('auditLog.noDetails')}</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {payloadEntries.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[140px_1fr] gap-x-4 px-3 py-2 text-sm">
                      <div className="text-muted-foreground">{humanizeKey(key)}</div>
                      <div className="min-w-0"><PayloadValue value={value} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {(entityTarget(entry) || entry.entityId || entry.userId) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {entityTarget(entry) && (
                  <Button size="sm" onClick={() => onOpenEntity(entry)}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t('auditLog.openEntity')}
                  </Button>
                )}
                {entry.entityId && (
                  <Button size="sm" variant="outline" onClick={() => onFilterEntity(entry)}>
                    <ListFilter className="h-4 w-4 mr-2" />
                    {t('auditLog.historyForEntity')}
                  </Button>
                )}
                {entry.userId && (
                  <Button size="sm" variant="outline" onClick={() => onFilterUser(entry)}>
                    <ListFilter className="h-4 w-4 mr-2" />
                    {t('auditLog.historyForUser')}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
