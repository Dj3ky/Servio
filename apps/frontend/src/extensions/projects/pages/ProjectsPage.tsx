import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, ChevronRight, LayoutList, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useDebounce } from '@/hooks/useDebounce';

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
  createdAt: string;
  updatedAt: string;
}

interface User { id: string; name: string; }

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
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(parseFloat(v));
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [groupByEmployee, setGroupByEmployee] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  const debouncedSearch = useDebounce(search, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (statusFilter) params.set('status', statusFilter);
  if (priorityFilter) params.set('priority', priorityFilter);
  params.set('limit', '200');

  const { data, isLoading } = useQuery<{ data: PmProject[] }>({
    queryKey: ['pm-projects', debouncedSearch, statusFilter, priorityFilter],
    queryFn: () => api.get(`/pm/projects?${params}`),
  });

  const { data: usersData } = useQuery<User[]>({
    queryKey: ['pm-employees'],
    queryFn: () => api.get('/pm/employees'),
    enabled: dialogOpen,
  });

  const mutation = useMutation({
    mutationFn: (body: typeof form) =>
      editingId
        ? api.patch(`/pm/projects/${editingId}`, body)
        : api.post('/pm/projects', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      toast.success(editingId ? t('pm.projects.savedOk') : t('pm.projects.createdOk'));
      setDialogOpen(false);
    },
    onError: () => toast.error(t('pm.projects.saveError')),
  });

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
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

  const projects = data?.data ?? [];

  // Group projects by employee for the grouped view
  const grouped = useMemo(() => {
    const groups: { key: string; employeeName: string | null; projects: PmProject[] }[] = [];
    const seen = new Map<string, number>();
    for (const p of projects) {
      const key = p.employeeId ?? '__none__';
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({ key, employeeName: p.employeeName, projects: [] });
      }
      groups[seen.get(key)!].projects.push(p);
    }
    return groups;
  }, [projects]);

  const tableHeaders = (
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

  function renderProjectRow(p: PmProject) {
    const remaining = parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0');
    const isOverdue = p.endDate && p.status !== 'completed' && new Date(p.endDate) < new Date();
    return (
      <tr key={p.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/pm/projects/${p.id}`)}>
        <td className="px-4 py-3">
          <div className="font-medium">{p.projectNumber}</div>
          <div className="text-xs text-muted-foreground">{p.name}</div>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-sm">{p.customerName ?? '—'}</td>
        {!groupByEmployee && <td className="px-4 py-3 text-muted-foreground text-sm">{p.employeeName ?? '—'}</td>}
        <td className="px-4 py-3">
          <Badge variant={PRIORITY_COLORS[p.priority] as any}>{t(`pm.priority.${p.priority}`)}</Badge>
        </td>
        <td className="px-4 py-3">
          <Badge variant={STATUS_COLORS[p.status] as any}>{t(`pm.status.${p.status}`)}</Badge>
        </td>
        <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(p.contractValue)}</td>
        <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(p.invoicedAmount)}</td>
        <td className={`px-4 py-3 text-right font-mono text-xs ${remaining > 0 ? 'text-green-600' : ''}`}>{formatCurrency(String(remaining))}</td>
        <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
          {p.endDate ?? '—'}
        </td>
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
          <h1 className="text-2xl font-bold">{t('pm.projects.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pm.projects.subtitle')}</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />{t('pm.projects.new')}</Button>
      </div>

      {/* Filters + view toggle */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('pm.projects.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter || 'all'} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('pm.projects.allStatuses')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('pm.projects.allStatuses')}</SelectItem>
            <SelectItem value="active">{t('pm.status.active')}</SelectItem>
            <SelectItem value="on_hold">{t('pm.status.on_hold')}</SelectItem>
            <SelectItem value="completed">{t('pm.status.completed')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter || 'all'} onValueChange={v => setPriorityFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('pm.projects.allPriorities')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('pm.projects.allPriorities')}</SelectItem>
            <SelectItem value="high">{t('pm.priority.high')}</SelectItem>
            <SelectItem value="medium">{t('pm.priority.medium')}</SelectItem>
            <SelectItem value="low">{t('pm.priority.low')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-md border overflow-hidden">
          <button
            className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${!groupByEmployee ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            onClick={() => setGroupByEmployee(false)}
          >
            <LayoutList className="h-3.5 w-3.5" />{t('pm.groupBy.list')}
          </button>
          <button
            className={`px-3 py-1.5 text-sm flex items-center gap-1.5 border-l transition-colors ${groupByEmployee ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            onClick={() => setGroupByEmployee(true)}
          >
            <Users className="h-3.5 w-3.5" />{t('pm.groupBy.employee')}
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</p>}

      {/* Flat list view */}
      {!groupByEmployee && !isLoading && (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
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
            const collapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key} className="rounded-md border overflow-hidden">
                <button
                  className={`w-full px-4 py-2 text-sm font-semibold flex items-center gap-2 text-left ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}
                  onClick={() => toggleGroup(group.key)}
                >
                  <Users className="h-4 w-4 opacity-70 shrink-0" />
                  <span className="flex-1">{group.employeeName ?? t('pm.reports.unassigned')}</span>
                  <span className="font-normal text-muted-foreground">({group.projects.length})</span>
                  {collapsed
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </button>
                {!collapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
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
                <Input type="date" value={form.orderDate} onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))} />
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
                <Input placeholder={t('pm.fields.customer')} value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.facility')}</label>
                <Input placeholder={t('pm.fields.facility')} value={form.facilityName} onChange={e => setForm(f => ({ ...f, facilityName: e.target.value }))} />
              </div>
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
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.endDate')}</label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium">{t('pm.fields.contractValue')}</label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.contractValue} onChange={e => setForm(f => ({ ...f, contractValue: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('pm.fields.notes')}</label>
              <Textarea placeholder={t('pm.fields.notes') + '...'} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? t('common.loading') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
