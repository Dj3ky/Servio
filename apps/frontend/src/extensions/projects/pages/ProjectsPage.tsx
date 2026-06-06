import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, ChevronRight } from 'lucide-react';
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
  pmCustomerId: string | null;
  customerName: string | null;
  pmFacilityId: string | null;
  facilityName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PmCustomer { id: string; name: string; }
interface PmFacility { id: string; name: string; pmCustomerId: string | null; }
interface User { id: string; name: string; }

const PRIORITY_COLORS: Record<string, string> = { high: 'destructive', medium: 'default', low: 'secondary' };
const STATUS_COLORS: Record<string, string> = { active: 'default', on_hold: 'outline', completed: 'secondary' };

function formatCurrency(v: string | null | undefined) {
  if (!v) return '—';
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(parseFloat(v));
}

const emptyForm = {
  projectNumber: '',
  name: '',
  orderDate: '',
  employeeId: '',
  pmCustomerId: '',
  pmFacilityId: '',
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
  const debouncedSearch = useDebounce(search, 300);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (statusFilter) params.set('status', statusFilter);
  if (priorityFilter) params.set('priority', priorityFilter);
  params.set('limit', '100');

  const { data, isLoading } = useQuery<{ data: PmProject[] }>({
    queryKey: ['pm-projects', debouncedSearch, statusFilter, priorityFilter],
    queryFn: () => api.get(`/pm/projects?${params}`),
  });

  const { data: customersData } = useQuery<{ data: PmCustomer[] }>({
    queryKey: ['pm-customers-list'],
    queryFn: () => api.get('/pm/customers?limit=200'),
    enabled: dialogOpen,
  });

  const { data: facilitiesData } = useQuery<{ data: PmFacility[] }>({
    queryKey: ['pm-facilities-list'],
    queryFn: () => api.get('/pm/facilities?limit=200'),
    enabled: dialogOpen,
  });

  const { data: usersData } = useQuery<{ data: User[] }>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users?limit=200'),
    enabled: dialogOpen,
  });

  const facilities = (facilitiesData?.data ?? []).filter(f =>
    !form.pmCustomerId || f.pmCustomerId === form.pmCustomerId
  );

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
      pmCustomerId: form.pmCustomerId || null as any,
      pmFacilityId: form.pmFacilityId || null as any,
      orderDate: form.orderDate || null as any,
      startDate: form.startDate || null as any,
      endDate: form.endDate || null as any,
      contractValue: form.contractValue || null as any,
    });
  }

  const projects = data?.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('pm.projects.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pm.projects.subtitle')}</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />{t('pm.projects.new')}</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
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
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">{t('pm.projects.colWorkOrder')}</th>
              <th className="text-left px-4 py-3 font-medium">{t('pm.fields.customer')}</th>
              <th className="text-left px-4 py-3 font-medium">{t('pm.fields.employee')}</th>
              <th className="text-left px-4 py-3 font-medium">{t('pm.fields.priority')}</th>
              <th className="text-left px-4 py-3 font-medium">{t('common.status')}</th>
              <th className="text-right px-4 py-3 font-medium">{t('pm.fields.value')}</th>
              <th className="text-right px-4 py-3 font-medium">{t('pm.fields.invoiced')}</th>
              <th className="text-right px-4 py-3 font-medium">{t('pm.fields.remaining')}</th>
              <th className="text-left px-4 py-3 font-medium">{t('pm.fields.deadline')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">{t('common.loading')}</td></tr>
            )}
            {!isLoading && projects.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
            )}
            {projects.map(p => {
              const remaining = parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0');
              const isOverdue = p.endDate && p.status !== 'completed' && new Date(p.endDate) < new Date();
              return (
                <tr key={p.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/pm/projects/${p.id}`)}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.projectNumber}</div>
                    <div className="text-xs text-muted-foreground">{p.name}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.customerName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.employeeName ?? '—'}</td>
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
            })}
          </tbody>
        </table>
      </div>

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
                    {(usersData?.data ?? []).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.customer')}</label>
                <Select value={form.pmCustomerId || '__none__'} onValueChange={v => setForm(f => ({ ...f, pmCustomerId: v === '__none__' ? '' : v, pmFacilityId: '' }))}>
                  <SelectTrigger><SelectValue placeholder={t('pm.projects.selectCustomer')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {(customersData?.data ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.facility')}</label>
                <Select value={form.pmFacilityId || '__none__'} onValueChange={v => setForm(f => ({ ...f, pmFacilityId: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder={t('pm.projects.selectFacility')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {facilities.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.contractValue')}</label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.contractValue} onChange={e => setForm(f => ({ ...f, contractValue: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.invoicedAmount')}</label>
                <Input type="number" step="0.01" placeholder="0.00" value={form.invoicedAmount} onChange={e => setForm(f => ({ ...f, invoicedAmount: e.target.value }))} />
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
