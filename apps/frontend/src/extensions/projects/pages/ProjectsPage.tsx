import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Link2, Plus, Search, ChevronRight, LayoutList, Users, ChevronDown, ChevronUp, Printer, FileUp, FileDown, ArrowUp, ArrowDown, MoreHorizontal } from 'lucide-react';
import { kimaiSafeName } from '@servio/shared';
import { api } from '@/lib/api';
import { formatDate, normalizeAmountInput } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useDebounce } from '@/hooks/useDebounce';
import { useEmployeeOrder, sortByEmployeeOrder } from '../employeeOrder';
import { ProjectNotesHint } from '../ProjectNotesHint';
import { ProjectNoteCount } from '../ProjectNotesTab';
import { NameSuggestionLists } from '../nameSuggestions';
import { isPastDue } from '../dates';
import { KimaiCustomerField, kimaiErrorMessage, useKimaiCustomerChoice, useKimaiStatus } from '../kimai';

interface PmProject {
  id: string;
  projectNumber: string;
  name: string;
  orderDate: string | null;
  priority: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  contractValue: string | null;
  invoicedAmount: string;
  notes: string | null;
  employeeId: string | null;
  employeeName: string | null;
  customerName: string | null;
  facilityName: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  openTaskCount: number;
  overdueTaskCount: number;
  noteCount: number;
  latestNote: string | null;
}

interface User { id: string; name: string; }

interface ImportResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

function getToken() {
  try { return JSON.parse(localStorage.getItem('servio-auth') ?? '{}').state?.token ?? ''; } catch { return ''; }
}

const PRIORITY_COLORS: Record<string, string> = { high: 'destructive', medium: 'default', low: 'secondary' };
const STATUS_COLORS: Record<string, string> = { active: 'default', on_hold: 'outline', completed: 'secondary' };

const GROUP_COLORS = [
  'bg-blue-500/10 border-l-4 border-l-blue-500',
  'bg-emerald-500/10 border-l-4 border-l-emerald-500',
  'bg-violet-500/10 border-l-4 border-l-violet-500',
  'bg-amber-500/10 border-l-4 border-l-amber-500',
  'bg-rose-500/10 border-l-4 border-l-rose-500',
  'bg-cyan-500/10 border-l-4 border-l-cyan-500',
  'bg-orange-500/10 border-l-4 border-l-orange-500',
  'bg-teal-500/10 border-l-4 border-l-teal-500',
];

function formatCurrency(v: string | null | undefined) {
  if (!v) return '—';
  // de-DE: same format as sl-SI, but sl-SI skips the thousands separator for 4-digit amounts
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(parseFloat(v));
}

const emptyForm = {
  projectNumber: '',
  name: '',
  orderDate: '',
  employeeId: '',
  customerName: '',
  facilityName: '',
  priority: 'medium',
  status: 'active',
  startDate: '',
  endDate: '',
  contractValue: '',
  invoicedAmount: '0',
  notes: '',
};

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const perms = usePermissionsStore(s => s.perms);
  const canManage = !!user && (perms.projects?.manage ?? []).includes(user.role);
  const [archiveMode, setArchiveMode] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  // Archive year: null until the user picks one, then the newest year with completed projects is used
  const [yearChoice, setYearChoice] = useState<string | null>(null);
  const [groupByEmployee, setGroupByEmployee] = useState(true);
  // Groups the user has clicked; each click flips the group away from its default state
  const [toggledGroups, setToggledGroups] = useState<Set<string>>(new Set());
  const seesAllGroups = user?.role === 'admin' || user?.role === 'manager';

  // Admins and managers start with every group open; everyone else only with their own.
  // The archive starts fully collapsed (it can get long), except while searching.
  function isGroupCollapsed(key: string) {
    const collapsedByDefault = archiveMode
      ? !debouncedSearch
      : !seesAllGroups && key !== user?.id;
    return collapsedByDefault !== toggledGroups.has(key);
  }

  function toggleGroup(key: string) {
    setToggledGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  const debouncedSearch = useDebounce(search, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createInKimai, setCreateInKimai] = useState(true);
  const { data: kimaiStatus } = useKimaiStatus();
  const offerKimai = !!kimaiStatus?.configured && !editingId;
  const hasCustomer = !!form.customerName.trim();
  const kimaiCustomer = useKimaiCustomerChoice(form.customerName, dialogOpen && offerKimai && createInKimai && hasCustomer);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function handleExportCsv() {
    setExporting(true);
    try {
      // Same filters as the list on screen
      const res = await fetch(`/api/pm/projects/export?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) { toast.error(t('errors.internal')); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `projects-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setExporting(false);
    }
  }

  async function handleCsvImport(file: File) {
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/pm/projects/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.details?.file?.[0] ?? t('errors.internal')); return; }
      setImportResult(data as ImportResult);
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      qc.invalidateQueries({ queryKey: ['pm-name-suggestions'] });
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setImporting(false);
    }
  }

  const { data: tabCounts } = useQuery<{ active: number; archived: number }>({
    queryKey: ['pm-projects', 'counts'],
    queryFn: () => api.get('/pm/projects/counts'),
  });

  function switchMode(archive: boolean) {
    setArchiveMode(archive);
    setStatusFilter('');
    setToggledGroups(new Set());
  }

  const { data: archiveYears, isSuccess: archiveYearsLoaded } = useQuery<number[]>({
    queryKey: ['pm-projects', 'archive-years'],
    queryFn: () => api.get('/pm/projects/archive-years'),
    enabled: archiveMode,
  });
  // 'all' or a year; defaults to the newest year that has completed projects
  const selectedYear = yearChoice ?? (archiveYears?.length ? String(archiveYears[0]) : 'all');
  // A search looks through every year, so old work orders are always findable
  const yearApplies = archiveMode && !debouncedSearch && selectedYear !== 'all';

  const params = new URLSearchParams();
  params.set('archived', archiveMode ? 'true' : 'false');
  if (yearApplies) params.set('year', selectedYear);
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (!archiveMode && statusFilter) params.set('status', statusFilter);
  if (priorityFilter) params.set('priority', priorityFilter);

  const PAGE_SIZE = 100;
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['pm-projects', archiveMode, yearApplies ? selectedYear : 'all', debouncedSearch, statusFilter, priorityFilter],
    queryFn: ({ pageParam }) => {
      const pageParams = new URLSearchParams(params);
      pageParams.set('page', String(pageParam));
      pageParams.set('limit', String(PAGE_SIZE));
      return api.get<{ data: PmProject[]; total: number; page: number; totalPages: number }>(`/pm/projects?${pageParams}`);
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    // Wait for the year list so the archive doesn't first load every year
    enabled: !archiveMode || archiveYearsLoaded,
  });
  const totalProjects = data?.pages[0]?.total ?? 0;

  const { data: usersData } = useQuery<User[]>({
    queryKey: ['pm-employees'],
    queryFn: () => api.get('/pm/employees'),
    enabled: dialogOpen,
  });

  const employeeOrder = useEmployeeOrder();

  const orderMutation = useMutation({
    mutationFn: (userIds: string[]) => api.put('/pm/projects/employee-order', { userIds }),
    onMutate: (userIds) => { qc.setQueryData(['pm-employee-order'], userIds); },
    onError: () => {
      toast.error(t('pm.projects.orderSaveError'));
      qc.invalidateQueries({ queryKey: ['pm-employee-order'] });
    },
  });

  // Stays pending until the list has reloaded, so the next click swaps with the real neighbour
  const moveProjectMutation = useMutation({
    mutationFn: (body: { projectId: string; otherProjectId: string }) => api.put('/pm/projects/swap-order', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      qc.invalidateQueries({ queryKey: ['pm-active-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-meeting-detail'] });
      return qc.invalidateQueries({ queryKey: ['pm-projects'] });
    },
    onError: () => {
      toast.error(t('pm.projects.orderSaveError'));
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
    },
  });

  // The Servio project is already saved here, so a Kimai problem is only a warning; it can be linked later on the Hours tab
  async function createProjectInKimai(projectId: string) {
    if (!hasCustomer || !kimaiCustomer.payload) {
      toast(t(hasCustomer ? 'pm.kimai.savedOnlyUnavailable' : 'pm.kimai.savedOnlyNoCustomer'), { icon: '⚠️' });
      return;
    }
    try {
      await api.post(`/pm/kimai/create/${projectId}`, kimaiCustomer.payload);
      toast.success(t('pm.kimai.createdOk'));
    } catch (err) {
      toast.error(t('pm.kimai.savedOnlyFailed', { reason: kimaiErrorMessage(err, t) }));
    }
    qc.invalidateQueries({ queryKey: ['pm-kimai-customers'] });
    qc.invalidateQueries({ queryKey: ['pm-kimai-projects'] });
  }

  const mutation = useMutation({
    mutationFn: (body: typeof form) =>
      editingId
        ? api.patch<PmProject>(`/pm/projects/${editingId}`, body)
        : api.post<PmProject>('/pm/projects', body),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      qc.invalidateQueries({ queryKey: ['pm-name-suggestions'] });
      toast.success(editingId ? t('pm.projects.savedOk') : t('pm.projects.createdOk'));
      setDialogOpen(false);
      if (offerKimai && createInKimai) void createProjectInKimai(project.id);
    },
    onError: () => toast.error(t('pm.projects.saveError')),
  });

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setCreateInKimai(true);
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      ...form,
      employeeId: form.employeeId || null as any,
      customerName: form.customerName || null as any,
      facilityName: form.facilityName || null as any,
      orderDate: form.orderDate || null as any,
      startDate: form.startDate || null as any,
      endDate: form.endDate || null as any,
      contractValue: form.contractValue || null as any,
    });
  }

  const projects = useMemo(() => data?.pages.flatMap(p => p.data) ?? [], [data]);

  // Group projects by employee for the grouped view
  const grouped = useMemo(() => {
    const groups: { key: string; employeeId: string | null; employeeName: string | null; projects: PmProject[] }[] = [];
    const seen = new Map<string, number>();
    for (const p of projects) {
      const key = p.employeeId ?? '__none__';
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({ key, employeeId: p.employeeId, employeeName: p.employeeName, projects: [] });
      }
      groups[seen.get(key)!].projects.push(p);
    }
    return sortByEmployeeOrder(groups, employeeOrder);
  }, [projects, employeeOrder]);

  // Swap a user with the neighbouring visible group, keeping positions of users hidden by filters
  function moveGroup(key: string, direction: -1 | 1) {
    const visible = grouped.map(g => g.key).filter(k => k !== '__none__');
    const idx = visible.indexOf(key);
    const neighbour = visible[idx + direction];
    if (idx === -1 || !neighbour) return;
    const full = [...employeeOrder, ...visible.filter(k => !employeeOrder.includes(k))];
    const a = full.indexOf(key);
    const b = full.indexOf(neighbour);
    [full[a], full[b]] = [full[b], full[a]];
    orderMutation.mutate(full);
  }

  function printProjects() {
    const date = new Date().toLocaleDateString('sl-SI');
    const title = archiveMode
      ? `${t('pm.projects.archiveTitle')}${yearApplies ? ` ${selectedYear}` : ''}`
      : t('pm.projects.title');

    const groupsToRender = groupByEmployee ? grouped : [{
      key: '__all__',
      employeeName: null,
      projects,
    }];

    const PRINT_GROUP_COLORS = [
      '#dbeafe', '#d1fae5', '#ede9fe', '#fef3c7',
      '#fee2e2', '#cffafe', '#ffedd5', '#ccfbf1',
    ];

    const groupHtml = groupsToRender.map((g, idx) => {
      const bgColor = groupByEmployee ? PRINT_GROUP_COLORS[idx % PRINT_GROUP_COLORS.length] : 'transparent';
      const rows = g.projects.map(p => {
        const notes = p.notes
          ? p.notes.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          : '&nbsp;';
        return `<tr>
          <td><span style="color:#555">${p.projectNumber}</span> <strong>${p.name}</strong></td>
          <td>${p.customerName ?? '—'}</td>
          <td style="border-left:1px solid #e2e8f0;white-space:pre-wrap">${notes}</td>
          <td style="border-left:1px solid #e2e8f0">&nbsp;</td>
        </tr>`;
      }).join('');

      const headerRow = `<th>Delovni nalog</th><th>Naročnik</th><th>Opombe</th><th>Lastne opombe</th>`;
      // Fixed widths so columns line up across all group tables
      const colGroup = `<colgroup><col style="width:26%"><col style="width:20%"><col style="width:27%"><col style="width:27%"></colgroup>`;

      // Group header lives in <thead> so it never gets orphaned at a page bottom
      // and repeats on each page the group spans
      const groupHeader = groupByEmployee
        ? `<tr><th colspan="4" class="group-header" style="background:${bgColor}">${g.employeeName ?? t('pm.reports.unassigned')} (${g.projects.length})</th></tr>`
        : '';

      return `<table${groupByEmployee ? ' style="margin-top:12px"' : ''}>
          ${colGroup}
          <thead>${groupHeader}<tr>${headerRow}</tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        h2 { font-size: 14px; margin: 0 0 2px 0; }
        .meta { font-size: 10px; color: #666; margin-bottom: 12px; }
        table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 10px; margin-bottom: 4px; }
        td { overflow-wrap: anywhere; }
        th { background: #f1f5f9; text-align: left; padding: 3px 6px; border-bottom: 1px solid #cbd5e1; font-size: 10px; }
        td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; height: 20px; }
        tr:last-child td { border-bottom: none; }
        thead { display: table-header-group; break-after: avoid; }
        tr { break-inside: avoid; }
        th.group-header { border: 1px solid #cbd5e1; border-left: 6px solid #6366f1; padding: 5px 10px; font-size: 12px; }
        @media print { button { display: none; } }
      </style>
    </head><body>
      <h2>${title}</h2>
      <div class="meta">${date} · ${projects.length} projektov</div>
      ${groupHtml}
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // Shared column widths so grouped tables line up with each other
  const tableColGroup = archiveMode ? (
    <colgroup>
      <col style={{ width: '26%' }} />
      <col style={{ width: '22%' }} />
      {!groupByEmployee && <col style={{ width: '16%' }} />}
      <col style={{ width: '14%' }} />
      <col style={{ width: '14%' }} />
      <col style={{ width: '14%' }} />
      <col style={{ width: '40px' }} />
    </colgroup>
  ) : (
    <colgroup>
      <col style={{ width: '20%' }} />
      <col style={{ width: '16%' }} />
      {!groupByEmployee && <col style={{ width: '12%' }} />}
      <col style={{ width: '8%' }} />
      <col style={{ width: '9%' }} />
      <col style={{ width: '11%' }} />
      <col style={{ width: '11%' }} />
      <col style={{ width: '11%' }} />
      <col style={{ width: '10%' }} />
      <col style={{ width: '40px' }} />
    </colgroup>
  );

  const tableHeaders = archiveMode ? (
    <tr className="border-b bg-muted/50 text-muted-foreground">
      <th className="text-left px-4 py-3 font-medium">{t('pm.projects.colWorkOrder')}</th>
      <th className="text-left px-4 py-3 font-medium">{t('pm.fields.customer')}</th>
      {!groupByEmployee && <th className="text-left px-4 py-3 font-medium">{t('pm.fields.employee')}</th>}
      <th className="text-left px-4 py-3 font-medium">{t('pm.fields.completedAt')}</th>
      <th className="text-right px-4 py-3 font-medium">{t('pm.fields.value')}</th>
      <th className="text-right px-4 py-3 font-medium">{t('pm.fields.invoiced')}</th>
      <th className="px-4 py-3" />
    </tr>
  ) : (
    <tr className="border-b bg-muted/50 text-muted-foreground">
      <th className="text-left px-4 py-3 font-medium">{t('pm.projects.colWorkOrder')}</th>
      <th className="text-left px-4 py-3 font-medium">{t('pm.fields.customer')}</th>
      {!groupByEmployee && <th className="text-left px-4 py-3 font-medium">{t('pm.fields.employee')}</th>}
      <th className="text-left px-4 py-3 font-medium">{t('pm.fields.priority')}</th>
      <th className="text-left px-4 py-3 font-medium">{t('common.status')}</th>
      <th className="text-right px-4 py-3 font-medium">{t('pm.fields.value')}</th>
      <th className="text-right px-4 py-3 font-medium">{t('pm.fields.invoiced')}</th>
      <th className="text-right px-4 py-3 font-medium">{t('pm.fields.remaining')}</th>
      <th className="text-left px-4 py-3 font-medium">{t('pm.fields.deadline')}</th>
      <th className="px-4 py-3" />
    </tr>
  );

  function renderProjectRow(p: PmProject, idx: number, siblings: PmProject[]) {
    const remaining = parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0');
    const isOverdue = p.status !== 'completed' && isPastDue(p.endDate);
    const movable = canManage && groupByEmployee && !archiveMode;
    const moveTo = (neighbour: PmProject) => (e: React.MouseEvent) => {
      e.stopPropagation();
      moveProjectMutation.mutate({ projectId: p.id, otherProjectId: neighbour.id });
    };
    return (
      <tr key={p.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/pm/projects/${p.id}`)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {movable && (
              <div className="flex flex-col shrink-0 -my-1 -ml-2">
                <button
                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
                  disabled={idx === 0 || moveProjectMutation.isPending}
                  onClick={moveTo(siblings[idx - 1])}
                  title={t('pm.projects.moveUp')}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
                  disabled={idx === siblings.length - 1 || moveProjectMutation.isPending}
                  onClick={moveTo(siblings[idx + 1])}
                  title={t('pm.projects.moveDown')}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{p.name}</span>
                <ProjectNotesHint notes={p.notes} />
                <ProjectNoteCount count={p.noteCount} latest={p.latestNote} />
                {p.openTaskCount > 0 && (
                  <Badge variant={p.overdueTaskCount > 0 ? 'destructive' : 'outline'} className="text-[10px] px-1.5 py-0 font-normal">
                    {p.overdueTaskCount > 0
                      ? t('pm.tasks.overdueCount', { count: p.overdueTaskCount })
                      : t('pm.tasks.openCount', { count: p.openTaskCount })}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{p.projectNumber}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-sm">{p.customerName ?? '—'}</td>
        {!groupByEmployee && <td className="px-4 py-3 text-muted-foreground text-sm">{p.employeeName ?? '—'}</td>}
        {archiveMode ? (
          <td className="px-4 py-3 text-sm text-green-600 font-medium">
            {p.completedAt ? formatDate(p.completedAt) : '—'}
          </td>
        ) : (
          <>
            <td className="px-4 py-3">
              <Badge variant={PRIORITY_COLORS[p.priority] as any}>{t(`pm.priority.${p.priority}`)}</Badge>
            </td>
            <td className="px-4 py-3">
              <Badge variant={STATUS_COLORS[p.status] as any}>{t(`pm.status.${p.status}`)}</Badge>
            </td>
          </>
        )}
        <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(p.contractValue)}</td>
        <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(p.invoicedAmount)}</td>
        {!archiveMode && (
          <>
            <td className={`px-4 py-3 text-right font-mono text-xs ${remaining > 0 ? 'text-green-600' : ''}`}>{formatCurrency(String(remaining))}</td>
            <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
              {p.endDate ? formatDate(p.endDate) : '—'}
            </td>
          </>
        )}
        <td className="px-4 py-3 text-right">
          <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
        </td>
      </tr>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {archiveMode ? t('pm.projects.archiveTitle') : t('pm.projects.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {archiveMode ? t('pm.projects.archiveSubtitle') : t('pm.projects.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvImport(f); e.target.value = ''; }}
          />
          {/* Less frequent actions live in one menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t('pm.projects.moreActions')} title={t('pm.projects.moreActions')}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={printProjects}>
                <Printer className="text-muted-foreground" />{t('pm.projects.print')}
              </DropdownMenuItem>
              {kimaiStatus?.configured && canManage && (
                <DropdownMenuItem onSelect={() => navigate('/pm/projects/kimai-links')}>
                  <Link2 className="text-muted-foreground" />{t('pm.kimai.links.title')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={exporting} onSelect={handleExportCsv}>
                <FileDown className="text-muted-foreground" />{t('contracts.exportCsv')}
              </DropdownMenuItem>
              {canManage && (
                <DropdownMenuItem disabled={importing} onSelect={() => csvInputRef.current?.click()}>
                  <FileUp className="text-muted-foreground" />{t('contracts.importCsv')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {canManage && !archiveMode && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />{t('pm.projects.new')}</Button>}
        </div>
      </div>

      {/* Active / Archive tabs */}
      <Tabs value={archiveMode ? 'archive' : 'active'} onValueChange={v => switchMode(v === 'archive')}>
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
          {(['active', 'archive'] as const).map(tab => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="group -mb-px gap-2 rounded-none border-b-2 border-transparent px-0.5 pb-2.5 pt-1 text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none"
            >
              {tab === 'active' ? t('pm.projects.activeTab') : t('pm.projects.archiveTab')}
              {tabCounts && (
                <span className="rounded-full bg-muted px-2 py-px text-xs font-medium text-muted-foreground group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary">
                  {tab === 'active' ? tabCounts.active : tabCounts.archived}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Filters + view toggle */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('pm.projects.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {!archiveMode && (
        <Select value={statusFilter || 'all'} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('pm.projects.allStatuses')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('pm.projects.allStatuses')}</SelectItem>
            <SelectItem value="active">{t('pm.status.active')}</SelectItem>
            <SelectItem value="on_hold">{t('pm.status.on_hold')}</SelectItem>
          </SelectContent>
        </Select>
        )}
        {archiveMode && (
          <Select value={selectedYear} onValueChange={setYearChoice} disabled={!!debouncedSearch}>
            <SelectTrigger className="w-[130px]" title={debouncedSearch ? t('pm.projects.searchAllYears') : undefined}>
              <SelectValue placeholder={t('pm.projects.allYears')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('pm.projects.allYears')}</SelectItem>
              {(archiveYears ?? []).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={priorityFilter || 'all'} onValueChange={v => setPriorityFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('pm.projects.allPriorities')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('pm.projects.allPriorities')}</SelectItem>
            <SelectItem value="high">{t('pm.priority.high')}</SelectItem>
            <SelectItem value="medium">{t('pm.priority.medium')}</SelectItem>
            <SelectItem value="low">{t('pm.priority.low')}</SelectItem>
          </SelectContent>
        </Select>
        {archiveMode && debouncedSearch && (
          <span className="text-xs text-muted-foreground">{t('pm.projects.searchAllYears')}</span>
        )}
        {/* List / grouped view: changes layout, not data, so it sits apart from the filters */}
        <div className="ml-auto flex gap-0.5 rounded-md bg-muted p-0.5">
          {([
            { grouped: false, icon: LayoutList, label: t('pm.groupBy.list') },
            { grouped: true, icon: Users, label: t('pm.groupBy.employee') },
          ]).map(({ grouped, icon: Icon, label }) => (
            <button
              key={label}
              aria-label={label}
              aria-pressed={groupByEmployee === grouped}
              title={label}
              onClick={() => setGroupByEmployee(grouped)}
              className={`flex h-8 w-9 items-center justify-center rounded transition-colors ${groupByEmployee === grouped ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</p>}

      {/* Flat list view */}
      {!groupByEmployee && !isLoading && (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed text-sm">
            {tableColGroup}
            <thead>{tableHeaders}</thead>
            <tbody>
              {projects.length === 0 && (
                <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
              )}
              {projects.map(renderProjectRow)}
            </tbody>
          </table>
        </div>
      )}

      {/* Grouped by employee view */}
      {groupByEmployee && !isLoading && (
        <div className="space-y-4">
          {grouped.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">{t('common.noData')}</p>}
          {grouped.map((group, idx) => {
            const collapsed = isGroupCollapsed(group.key);
            const movable = group.key !== '__none__';
            const isFirst = idx === 0;
            const isLastMovable = !grouped[idx + 1] || grouped[idx + 1].key === '__none__';
            return (
              <div key={group.key} className="rounded-md border overflow-hidden">
                <div className={`flex items-center ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}>
                  {movable && (
                    <div className="flex items-center pl-2">
                      <button
                        className="p-1 rounded hover:bg-background/60 disabled:opacity-30 disabled:pointer-events-none"
                        disabled={isFirst || orderMutation.isPending}
                        onClick={() => moveGroup(group.key, -1)}
                        title={t('pm.projects.moveUp')}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-background/60 disabled:opacity-30 disabled:pointer-events-none"
                        disabled={isLastMovable || orderMutation.isPending}
                        onClick={() => moveGroup(group.key, 1)}
                        title={t('pm.projects.moveDown')}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <button
                    className={`flex-1 py-2 pr-4 ${movable ? 'pl-2' : 'pl-4'} text-sm font-semibold flex items-center gap-2 text-left`}
                    onClick={() => toggleGroup(group.key)}
                  >
                    <Users className="h-4 w-4 opacity-70 shrink-0" />
                    <span className="flex-1">{group.employeeName ?? t('pm.reports.unassigned')}</span>
                    <span className="font-normal text-muted-foreground">({group.projects.length})</span>
                    {collapsed
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </div>
                {!collapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] table-fixed text-sm">
                      {tableColGroup}
                      <thead>{tableHeaders}</thead>
                      <tbody>{group.projects.map(renderProjectRow)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Paging: shown once there are more projects than one page */}
      {!isLoading && totalProjects > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>{t('pm.projects.showingOf', { shown: projects.length, total: totalProjects })}</span>
          {hasNextPage && (
            <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
              {isFetchingNextPage ? t('common.loading') : t('pm.projects.loadMore')}
            </Button>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t('pm.projects.edit') : t('pm.projects.new')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.workOrder')} *</label>
                <Input placeholder="npr. DN-2024-001" value={form.projectNumber} onChange={e => setForm(f => ({ ...f, projectNumber: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.projectName')} *</label>
                <Input placeholder={t('pm.fields.projectName')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.orderDate')}</label>
                <DateInput value={form.orderDate} onChange={v => setForm(f => ({ ...f, orderDate: v }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.employee')}</label>
                <Select value={form.employeeId || '__none__'} onValueChange={v => setForm(f => ({ ...f, employeeId: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder={t('pm.projects.selectEmployee')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {(usersData ?? []).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.customer')}</label>
                <Input list="pm-new-customers" autoComplete="off" placeholder={t('pm.fields.customer')} value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.facility')}</label>
                <Input list="pm-new-facilities" autoComplete="off" placeholder={t('pm.fields.facility')} value={form.facilityName} onChange={e => setForm(f => ({ ...f, facilityName: e.target.value }))} />
              </div>
              <NameSuggestionLists id="pm-new" customerName={form.customerName} enabled={dialogOpen} />
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.priority')}</label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">{t('pm.priority.high')}</SelectItem>
                    <SelectItem value="medium">{t('pm.priority.medium')}</SelectItem>
                    <SelectItem value="low">{t('pm.priority.low')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('common.status')}</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('pm.status.active')}</SelectItem>
                    <SelectItem value="on_hold">{t('pm.status.on_hold')}</SelectItem>
                    <SelectItem value="completed">{t('pm.status.completed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.startDate')}</label>
                <DateInput value={form.startDate} onChange={v => setForm(f => ({ ...f, startDate: v }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.endDate')}</label>
                <DateInput value={form.endDate} onChange={v => setForm(f => ({ ...f, endDate: v }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium">{t('pm.fields.contractValue')}</label>
                <Input inputMode="decimal" pattern="-?\d+\.?\d*" placeholder="0.00" value={form.contractValue} onChange={e => setForm(f => ({ ...f, contractValue: normalizeAmountInput(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('pm.fields.notes')}</label>
              <Textarea placeholder={t('pm.fields.notes') + '...'} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            {offerKimai && (
              <div className="rounded-md border p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox checked={createInKimai} onCheckedChange={v => setCreateInKimai(v === true)} />
                  {t('pm.kimai.createToo')}
                </label>
                {createInKimai && (
                  <>
                    {kimaiSafeName(form.name) !== form.name.trim() && (
                      <p className="text-xs text-muted-foreground">{t('pm.kimai.createName', { name: kimaiSafeName(form.name) })}</p>
                    )}
                    {hasCustomer
                      ? <KimaiCustomerField choice={kimaiCustomer} />
                      : <p className="text-xs text-muted-foreground">{t('pm.kimai.customerRequired')}</p>}
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? t('common.loading') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV import result dialog */}
      <Dialog open={!!importResult} onOpenChange={(open) => { if (!open) setImportResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('contracts.importResult')}</DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-3">
                  <div className="text-xl font-bold text-green-700 dark:text-green-400">{importResult.created.length}</div>
                  <div className="text-xs text-green-600 dark:text-green-500">{t('contracts.importCreated')}</div>
                </div>
                <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 p-3">
                  <div className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{importResult.skipped.length}</div>
                  <div className="text-xs text-yellow-600 dark:text-yellow-500">{t('contracts.importSkipped')}</div>
                </div>
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3">
                  <div className="text-xl font-bold text-red-700 dark:text-red-400">{importResult.errors.length}</div>
                  <div className="text-xs text-red-600 dark:text-red-500">{t('contracts.importErrors')}</div>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                  {importResult.errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('pm.projects.importCsvHint')}</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
