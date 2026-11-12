import { useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronRight, Plus, Trash2, Upload, FileText, Pencil, CheckCircle2, Circle, Clock, Receipt, Download, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, normalizeAmountInput } from '@/lib/utils';
import { useCan } from '@/stores/permissionsStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectDocumentUploadDialog } from '../ProjectDocumentUploadDialog';
import { ProjectTasksTab } from '../ProjectTasksTab';
import { ProjectHoursTab } from '../ProjectHoursTab';
import { ProjectNotesTab, type PmNote } from '../ProjectNotesTab';
import { useKimaiStatus } from '../kimai';
import { NameSuggestionLists } from '../nameSuggestions';
import type { PmTask } from '../tasks';
import { isPastDue } from '../dates';
import { underlineTabsList, underlineTabsTrigger, tabCountBadge } from '../tabStyles';
import { ProjectNotesBox } from '../ProjectNotesBox';

const DETAIL_TABS = ['meetings', 'tasks', 'notes', 'phases', 'documents', 'invoicesIssued', 'invoicesReceived', 'hours'] as const;

interface User { id: string; name: string; }

interface Phase { id: string; name: string; orderIndex: number; status: string; }
interface Document { id: string; originalName: string; filePath: string; fileSize: number | null; uploaderName: string | null; createdAt: string; }
interface Invoice { id: string; projectId: string; direction: 'issued' | 'received'; invoiceDate: string; amount: string; notes: string | null; createdAt: string; }
type InvoiceForm = { invoiceDate: string; amount: string; notes: string };
interface MeetingEntry {
  id: string; entryStatus: string; notes: string | null;
  meetingId: string; meetingDate: string; meetingNotes: string | null; createdAt: string;
}
interface Project {
  id: string; projectNumber: string; name: string; orderDate: string | null;
  priority: string; status: string; startDate: string | null; endDate: string | null;
  contractValue: string | null; invoicedAmount: string; receivedAmount: string; notes: string | null;
  employeeId: string | null; employeeName: string | null;
  customerName: string | null; facilityName: string | null;
  completedAt: string | null;
  kimaiProjectId: number | null; kimaiProjectName: string | null;
  phases: Phase[]; documents: Document[];
}

const ENTRY_STATUS_COLORS: Record<string, string> = { completed: 'default', active: 'outline', on_hold: 'secondary' };

function formatCurrency(v: string | null | undefined) {
  if (!v) return '—';
  const n = parseFloat(v);
  // de-DE: same format as sl-SI, but sl-SI skips the thousands separator for 4-digit amounts
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}


function PhaseIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === 'in_progress') return <Clock className="h-4 w-4 text-blue-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

function InvoiceList({
  invoices, form, onFormChange, onSubmit, onUpdate, onDelete, isPending, addLabel, totalLabel, canManage,
}: {
  invoices: Invoice[];
  form: InvoiceForm;
  onFormChange: (form: InvoiceForm) => void;
  onSubmit: () => void;
  onUpdate: (invoiceId: string, form: InvoiceForm) => Promise<unknown>;
  onDelete: (invoiceId: string) => void;
  isPending: boolean;
  addLabel: string;
  totalLabel: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<InvoiceForm>({ invoiceDate: '', amount: '', notes: '' });

  function startEdit(inv: Invoice) {
    setEditingId(inv.id);
    setEditForm({ invoiceDate: inv.invoiceDate.slice(0, 10), amount: inv.amount, notes: inv.notes ?? '' });
  }

  async function saveEdit() {
    if (!editingId) return;
    await onUpdate(editingId, editForm);
    setEditingId(null);
  }

  return (
    <div className="space-y-4 mt-4">
      {canManage && (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">{addLabel}</p>
          <form className="flex flex-wrap gap-3 items-end" onSubmit={e => { e.preventDefault(); onSubmit(); }}>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('pm.invoices.fieldDate')} *</label>
              <DateInput
                className="w-[160px]"
                value={form.invoiceDate}
                onChange={v => onFormChange({ ...form, invoiceDate: v })}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('pm.invoices.fieldAmount')} *</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-[140px]"
                value={form.amount}
                onChange={e => onFormChange({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <label className="text-xs text-muted-foreground">{t('pm.invoices.fieldNotes')}</label>
              <Input
                placeholder={t('pm.invoices.fieldNotes') + '...'}
                value={form.notes}
                onChange={e => onFormChange({ ...form, notes: e.target.value })}
              />
            </div>
            <Button type="submit" size="sm" disabled={isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" />{addLabel}
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      {invoices.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
      <div className="space-y-2">
        {invoices.map(inv => editingId === inv.id ? (
          <form
            key={inv.id}
            className="flex flex-wrap items-center gap-3 p-3 rounded-md border bg-card text-sm"
            onSubmit={e => { e.preventDefault(); saveEdit().catch(() => {}); }}
          >
            <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
            <DateInput
              className="w-[160px] h-8"
              value={editForm.invoiceDate}
              onChange={v => setEditForm({ ...editForm, invoiceDate: v })}
              required
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              className="w-[140px] h-8"
              value={editForm.amount}
              onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
              required
            />
            <Input
              className="flex-1 min-w-[180px] h-8"
              placeholder={t('pm.invoices.fieldNotes') + '...'}
              value={editForm.notes}
              onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
            />
            <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-green-600 shrink-0" title={t('common.save')}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingId(null)} title={t('common.cancel')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <div key={inv.id} className="flex items-center gap-3 p-3 rounded-md border bg-card text-sm">
            <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-mono text-xs text-muted-foreground min-w-[100px]">{formatDate(inv.invoiceDate)}</span>
            <span className="font-mono font-medium text-green-600 min-w-[110px] text-right">{formatCurrency(inv.amount)}</span>
            <span className="flex-1 text-muted-foreground truncate">{inv.notes ?? ''}</span>
            {canManage && (
              <>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => startEdit(inv)}
                  title={t('common.edit')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                  onClick={() => { if (confirm(t('pm.invoices.deleteConfirm'))) onDelete(inv.id); }}
                  title={t('common.delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      {invoices.length > 0 && (
        <div className="flex justify-end">
          <div className="text-sm font-medium flex gap-2">
            <span className="text-muted-foreground">{totalLabel}:</span>
            <span className="font-mono text-green-600">
              {formatCurrency(String(invoices.reduce((s, i) => s + parseFloat(i.amount), 0)))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const can = useCan();
  const canManage = can('projects', 'manage');
  const canDelete = can('projects', 'delete');

  // Open tab lives in the URL (?tab=tasks): coming back lands on the same tab, and links can point at one.
  // replace: switching tabs doesn't fill the browser history.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const requestedTab = (DETAIL_TABS as readonly string[]).includes(tabParam ?? '') ? tabParam! : 'meetings';
  function selectTab(tab: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (tab === 'meetings') next.delete('tab'); else next.set('tab', tab);
      return next;
    }, { replace: true });
  }

  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);
  const [phaseName, setPhaseName] = useState('');
  const [editPhase, setEditPhase] = useState<Phase | null>(null);
  const [issuedForm, setIssuedForm] = useState<InvoiceForm>({ invoiceDate: '', amount: '', notes: '' });
  const [receivedForm, setReceivedForm] = useState<InvoiceForm>({ invoiceDate: '', amount: '', notes: '' });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docDialogOpen, setDocDialogOpen] = useState(false);

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ['pm-project', id],
    queryFn: () => api.get(`/pm/projects/${id}`),
    enabled: !!id,
  });

  const { data: meetingHistory } = useQuery<MeetingEntry[]>({
    queryKey: ['pm-project-meetings', id],
    queryFn: () => api.get(`/pm/reports/project/${id}/meetings`),
    enabled: !!id,
  });

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ['pm-project-invoices', id],
    queryFn: () => api.get(`/pm/projects/${id}/invoices`),
    enabled: !!id,
  });

  const { data: tasks } = useQuery<PmTask[]>({
    queryKey: ['pm-project-tasks', id],
    queryFn: () => api.get(`/pm/projects/${id}/tasks`),
    enabled: !!id,
  });

  const { data: notes } = useQuery<PmNote[]>({
    queryKey: ['pm-project-notes', id],
    queryFn: () => api.get(`/pm/projects/${id}/notes`),
    enabled: !!id,
  });

  const { data: usersData } = useQuery<User[]>({
    queryKey: ['pm-employees'],
    queryFn: () => api.get('/pm/employees'),
    enabled: editDialogOpen,
  });

  const { data: kimaiStatus } = useKimaiStatus();

  const updateProject = useMutation({
    mutationFn: (body: Record<string, string>) => api.patch(`/pm/projects/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      qc.invalidateQueries({ queryKey: ['pm-name-suggestions'] });
      toast.success(t('pm.projects.savedOk'));
      setEditDialogOpen(false);
    },
    onError: () => toast.error(t('pm.projects.saveError')),
  });

  const deleteProject = useMutation({
    mutationFn: () => api.delete(`/pm/projects/${id}`),
    onSuccess: () => {
      navigate('/pm/projects');
      qc.removeQueries({ queryKey: ['pm-project', id] });
      for (const key of ['pm-projects', 'pm-report', 'pm-name-suggestions', 'pm-active-projects', 'pm-meetings', 'pm-meeting-detail', 'pm-meeting-tasks', 'pm-my-tasks', 'pm-my-task-count']) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      toast.success(t('pm.projects.deletedOk'));
    },
    onError: () => toast.error(t('pm.projects.deleteError')),
  });

  const quickStatusChange = useMutation({
    mutationFn: (status: string) => api.patch(`/pm/projects/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
    },
    onError: () => toast.error(t('pm.projects.saveError')),
  });

  function openEdit() {
    if (!project) return;
    setEditForm({
      projectNumber: project.projectNumber,
      name: project.name,
      orderDate: project.orderDate ?? '',
      employeeId: project.employeeId ?? '',
      customerName: project.customerName ?? '',
      facilityName: project.facilityName ?? '',
      priority: project.priority,
      status: project.status,
      startDate: project.startDate ?? '',
      endDate: project.endDate ?? '',
      contractValue: project.contractValue ?? '',
      notes: project.notes ?? '',
    });
    setEditDialogOpen(true);
  }

  const addInvoice = useMutation({
    mutationFn: (body: InvoiceForm & { direction: 'issued' | 'received' }) => api.post(`/pm/projects/${id}/invoices`, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['pm-project-invoices', id] });
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      if (variables.direction === 'issued') {
        toast.success(t('pm.invoices.issuedAddedOk'));
        setIssuedForm({ invoiceDate: '', amount: '', notes: '' });
      } else {
        toast.success(t('pm.invoices.receivedAddedOk'));
        setReceivedForm({ invoiceDate: '', amount: '', notes: '' });
      }
    },
    onError: () => toast.error(t('pm.invoices.error')),
  });

  const updateInvoice = useMutation({
    mutationFn: ({ invoiceId, form }: { invoiceId: string; form: InvoiceForm }) => api.patch(`/pm/projects/${id}/invoices/${invoiceId}`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project-invoices', id] });
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      toast.success(t('pm.invoices.updatedOk'));
    },
    onError: () => toast.error(t('pm.invoices.error')),
  });

  const deleteInvoice = useMutation({
    mutationFn: (invoiceId: string) => api.delete(`/pm/projects/${id}/invoices/${invoiceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project-invoices', id] });
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      toast.success(t('pm.invoices.deletedOk'));
    },
    onError: () => toast.error(t('pm.invoices.error')),
  });

  const addPhase = useMutation({
    mutationFn: (name: string) => editPhase
      ? api.patch(`/pm/projects/${id}/phases/${editPhase.id}`, { name })
      : api.post(`/pm/projects/${id}/phases`, { name, orderIndex: (project?.phases.length ?? 0) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      toast.success(editPhase ? t('pm.phases.updatedOk') : t('pm.phases.addedOk'));
      setPhaseDialogOpen(false);
      setPhaseName('');
      setEditPhase(null);
    },
    onError: () => toast.error(t('pm.phases.error')),
  });

  const updatePhaseStatus = useMutation({
    mutationFn: ({ phaseId, status }: { phaseId: string; status: string }) =>
      api.patch(`/pm/projects/${id}/phases/${phaseId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pm-project', id] }),
    onError: () => toast.error(t('pm.phases.error')),
  });

  const deletePhase = useMutation({
    mutationFn: (phaseId: string) => api.delete(`/pm/projects/${id}/phases/${phaseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      toast.success(t('pm.phases.deletedOk'));
    },
    onError: () => toast.error(t('pm.phases.error')),
  });

  const uploadDocument = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        await api.post(`/pm/projects/${id}/documents`, form);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      toast.success(t('pm.documents.uploadOk'));
      setDocDialogOpen(false);
    },
    onError: () => toast.error(t('pm.documents.uploadError')),
  });

  const deleteDocument = useMutation({
    mutationFn: (docId: string) => api.delete(`/pm/projects/${id}/documents/${docId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      toast.success(t('pm.documents.deletedOk'));
    },
    onError: () => toast.error(t('pm.documents.error')),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>;
  if (!project) return <div className="p-6 text-destructive">{t('pm.projects.notFound')}</div>;

  const contractVal = parseFloat(project.contractValue ?? '0');
  const invoiced = parseFloat(project.invoicedAmount ?? '0');
  const received = parseFloat(project.receivedAmount ?? '0');
  const remaining = contractVal - invoiced;
  const profit = invoiced - received;
  const invoicedPct = contractVal > 0 ? Math.min(100, (invoiced / contractVal) * 100) : 0;
  const isOverdue = project.status !== 'completed' && isPastDue(project.endDate);
  const issuedInvoices = (invoices ?? []).filter(inv => inv.direction !== 'received');
  const receivedInvoices = (invoices ?? []).filter(inv => inv.direction === 'received');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-end gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          {/* Breadcrumb: back to the list the project is in (archive for completed ones) */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link
              to={project.status === 'completed' ? '/pm/projects?view=archive' : '/pm/projects'}
              className="hover:text-foreground hover:underline"
            >
              {project.status === 'completed' ? t('pm.projects.archiveTitle') : t('pm.projects.title')}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-foreground font-medium" aria-current="page">{project.projectNumber}</span>
          </nav>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Select value={project.status} onValueChange={v => quickStatusChange.mutate(v)} disabled={!canManage || quickStatusChange.isPending}>
              <SelectTrigger className="h-7 w-auto text-xs px-2 gap-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('pm.status.active')}</SelectItem>
                <SelectItem value="on_hold">{t('pm.status.on_hold')}</SelectItem>
                <SelectItem value="completed">{t('pm.status.completed')}</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant={project.priority === 'high' ? 'destructive' : 'outline'}>{t(`pm.priority.${project.priority}`)}</Badge>
            {isOverdue && <Badge variant="destructive">{t('pm.projects.overdue')}</Badge>}
          </div>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />{t('pm.projects.edit')}
          </Button>
        )}
        {/* Delete normally lives in the edit dialog, which needs 'manage' */}
        {canDelete && !canManage && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />{t('common.delete')}
          </Button>
        )}
      </div>

      {/* Money tiles: the figures people check first */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border p-4 space-y-1">
          <div className="text-sm text-muted-foreground">{t('pm.fields.value')}</div>
          <div className="text-2xl font-bold tracking-tight">{formatCurrency(project.contractValue)}</div>
        </div>
        <div className="rounded-lg border p-4 space-y-1">
          <div className="text-sm text-muted-foreground">{t('pm.fields.invoiced')}</div>
          <div className="text-2xl font-bold tracking-tight">{formatCurrency(project.invoicedAmount)}</div>
          {contractVal > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${invoicedPct >= 100 ? 'bg-green-600' : 'bg-primary'}`} style={{ width: `${invoicedPct}%` }} />
              </div>
              <span className="text-xs font-semibold text-primary">{invoicedPct.toFixed(0)} %</span>
            </div>
          )}
        </div>
        <div className="rounded-lg border p-4 space-y-1">
          <div className="text-sm text-muted-foreground">{t('pm.fields.remaining')}</div>
          <div className="text-2xl font-bold tracking-tight">{formatCurrency(String(remaining))}</div>
        </div>
        <div className={`rounded-lg border p-4 space-y-1 ${profit >= 0
          ? 'border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300'
          : 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'}`}>
          <div className="text-sm">{t('pm.fields.profit')}</div>
          <div className={`text-2xl font-bold tracking-tight ${profit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {formatCurrency(String(profit))}
          </div>
          {/* Profit = invoiced − received invoices, so show what was subtracted */}
          <div className="text-xs">{t('pm.fields.received')}: {formatCurrency(project.receivedAmount)}</div>
        </div>
      </div>

      {/* Who and when, in one compact strip */}
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2 rounded-lg bg-muted/50 px-4 py-3 text-sm">
        <span><span className="text-muted-foreground">{t('pm.fields.employee')} </span><span className="font-medium">{project.employeeName ?? '—'}</span></span>
        <span><span className="text-muted-foreground">{t('pm.fields.customer')} </span><span className="font-medium">{project.customerName ?? '—'}</span></span>
        <span><span className="text-muted-foreground">{t('pm.fields.facility')} </span><span className="font-medium">{project.facilityName ?? '—'}</span></span>
        <span className="hidden sm:inline h-4 w-px bg-border" aria-hidden="true" />
        <span><span className="text-muted-foreground">{t('pm.fields.orderDate')} </span>{project.orderDate ? formatDate(project.orderDate) : '—'}</span>
        <span><span className="text-muted-foreground">{t('pm.fields.startDateShort')} </span>{project.startDate ? formatDate(project.startDate) : '—'}</span>
        <span>
          <span className="text-muted-foreground">{t('pm.fields.deadline')} </span>
          <span className={isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'font-semibold'}>{project.endDate ? formatDate(project.endDate) : '—'}</span>
        </span>
        {project.completedAt && (
          <span><span className="text-muted-foreground">{t('pm.fields.completedAt')} </span><span className="text-green-600 font-medium">{formatDate(project.completedAt)}</span></span>
        )}
      </div>

      <ProjectNotesBox projectId={project.id} notes={project.notes} canManage={canManage} />

      {/* Tabs */}
      <Tabs value={requestedTab === 'hours' && !kimaiStatus?.configured ? 'meetings' : requestedTab} onValueChange={selectTab}>
        <TabsList className={underlineTabsList}>
          {([
            ['meetings', t('pm.meetings.tab'), meetingHistory?.length ?? 0],
            ['tasks', t('pm.tasks.tab'), (tasks ?? []).filter(task => task.status === 'open').length],
            ['notes', t('pm.notes.tab'), notes?.length ?? 0],
            ['phases', t('pm.phases.tab'), project.phases.length],
            ['documents', t('pm.documents.tab'), project.documents.length],
            ['invoicesIssued', t('pm.invoices.tabIssued'), issuedInvoices.length],
            ['invoicesReceived', t('pm.invoices.tabReceived'), receivedInvoices.length],
          ] as const).map(([value, label, count]) => (
            <TabsTrigger key={value} value={value} className={underlineTabsTrigger}>
              {label}<span className={tabCountBadge}>{count}</span>
            </TabsTrigger>
          ))}
          {kimaiStatus?.configured && <TabsTrigger value="hours" className={underlineTabsTrigger}>{t('pm.kimai.tab')}</TabsTrigger>}
        </TabsList>

        {/* Hours (Kimai) */}
        {kimaiStatus?.configured && (
          <TabsContent value="hours">
            <ProjectHoursTab project={project} />
          </TabsContent>
        )}

        {/* Tasks */}
        <TabsContent value="tasks">
          <ProjectTasksTab projectId={project.id} tasks={tasks ?? []} defaultAssigneeId={project.employeeId} />
        </TabsContent>

        {/* Notes */}
        <TabsContent value="notes">
          <ProjectNotesTab projectId={project.id} notes={notes ?? []} assigneeId={project.employeeId} />
        </TabsContent>

        {/* Phases */}
        <TabsContent value="phases" className="space-y-3 mt-4">
          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setEditPhase(null); setPhaseName(''); setPhaseDialogOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" />{t('pm.phases.add')}
              </Button>
            </div>
          )}
          {project.phases.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
          <div className="space-y-2">
            {project.phases.map(phase => (
              <div key={phase.id} className="flex items-center gap-3 p-3 rounded-md border bg-card">
                <PhaseIcon status={phase.status} />
                <span className="flex-1 text-sm font-medium">{phase.name}</span>
                <Select value={phase.status} disabled={!canManage} onValueChange={v => updatePhaseStatus.mutate({ phaseId: phase.id, status: v })}>
                  <SelectTrigger className="w-[130px] h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t('pm.phaseStatus.pending')}</SelectItem>
                    <SelectItem value="in_progress">{t('pm.phaseStatus.in_progress')}</SelectItem>
                    <SelectItem value="completed">{t('pm.phaseStatus.completed')}</SelectItem>
                  </SelectContent>
                </Select>
                {canManage && (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditPhase(phase); setPhaseName(phase.name); setPhaseDialogOpen(true); }} title={t('common.edit')}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm(t('pm.phases.deleteConfirm'))) deletePhase.mutate(phase.id); }} title={t('common.delete')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Meeting History */}
        <TabsContent value="meetings" className="space-y-3 mt-4">
          {(meetingHistory ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
          <div className="space-y-3">
            {(meetingHistory ?? []).map(entry => (
              <div key={entry.id} className="flex gap-4 p-3 rounded-md border bg-card text-sm">
                <Link to={`/pm/meetings/${entry.meetingId}`} className="min-w-[90px] text-muted-foreground font-mono text-xs pt-0.5 hover:text-foreground hover:underline underline-offset-2">
                  {formatDate(entry.meetingDate)}
                </Link>
                <div className="flex-1">
                  <Badge variant={ENTRY_STATUS_COLORS[entry.entryStatus] as any} className="mb-1 text-xs">
                    {t(`pm.status.${entry.entryStatus}`)}
                  </Badge>
                  {entry.notes && <p className="text-muted-foreground">{entry.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Documents */}
        <TabsContent value="documents" className="space-y-3 mt-4">
          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setDocDialogOpen(true)}>
                <Upload className="h-3.5 w-3.5 mr-1" />{t('pm.documents.upload')}
              </Button>
            </div>
          )}
          {project.documents.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
          <div className="space-y-2">
            {project.documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-md border bg-card">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <button
                  className="flex-1 text-sm text-left hover:underline truncate"
                  onClick={() => window.open(doc.filePath, '_blank', 'noopener,noreferrer')}
                >
                  {doc.originalName}
                </button>
                <span className="text-xs text-muted-foreground shrink-0">
                  {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ''} · {doc.uploaderName}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
                  <a href={doc.filePath} download={doc.originalName} title={t('common.download')}>
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </Button>
                {canManage && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => { if (confirm(t('pm.documents.deleteConfirm'))) deleteDocument.mutate(doc.id); }} title={t('common.delete')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Invoices issued */}
        <TabsContent value="invoicesIssued">
          <InvoiceList
            invoices={issuedInvoices}
            form={issuedForm}
            onFormChange={setIssuedForm}
            onSubmit={() => addInvoice.mutate({ ...issuedForm, direction: 'issued' })}
            onUpdate={(invoiceId, form) => updateInvoice.mutateAsync({ invoiceId, form })}
            onDelete={invoiceId => deleteInvoice.mutate(invoiceId)}
            isPending={addInvoice.isPending}
            addLabel={t('pm.invoices.addIssued')}
            totalLabel={t('pm.invoices.totalIssued')}
            canManage={canManage}
          />
        </TabsContent>

        {/* Invoices received */}
        <TabsContent value="invoicesReceived">
          <InvoiceList
            invoices={receivedInvoices}
            form={receivedForm}
            onFormChange={setReceivedForm}
            onSubmit={() => addInvoice.mutate({ ...receivedForm, direction: 'received' })}
            onUpdate={(invoiceId, form) => updateInvoice.mutateAsync({ invoiceId, form })}
            onDelete={invoiceId => deleteInvoice.mutate(invoiceId)}
            isPending={addInvoice.isPending}
            addLabel={t('pm.invoices.addReceived')}
            totalLabel={t('pm.invoices.totalReceived')}
            canManage={canManage}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Project Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('pm.projects.edit')}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); updateProject.mutate({ ...editForm, employeeId: editForm.employeeId || null as any, customerName: editForm.customerName || null as any, facilityName: editForm.facilityName || null as any, orderDate: editForm.orderDate || null as any, startDate: editForm.startDate || null as any, endDate: editForm.endDate || null as any, contractValue: editForm.contractValue || null as any, }); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.workOrder')} *</label>
                <Input value={editForm.projectNumber ?? ''} onChange={e => setEditForm(f => ({ ...f, projectNumber: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.projectName')} *</label>
                <Input value={editForm.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.orderDate')}</label>
                <DateInput value={editForm.orderDate ?? ''} onChange={v => setEditForm(f => ({ ...f, orderDate: v }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.employee')}</label>
                <Select value={editForm.employeeId || '__none__'} onValueChange={v => setEditForm(f => ({ ...f, employeeId: v === '__none__' ? '' : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {(usersData ?? []).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.customer')}</label>
                <Input list="pm-edit-customers" autoComplete="off" value={editForm.customerName ?? ''} onChange={e => setEditForm(f => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.facility')}</label>
                <Input list="pm-edit-facilities" autoComplete="off" value={editForm.facilityName ?? ''} onChange={e => setEditForm(f => ({ ...f, facilityName: e.target.value }))} />
              </div>
              <NameSuggestionLists id="pm-edit" customerName={editForm.customerName ?? ''} enabled={editDialogOpen} />
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.priority')}</label>
                <Select value={editForm.priority ?? 'medium'} onValueChange={v => setEditForm(f => ({ ...f, priority: v }))}>
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
                <Select value={editForm.status ?? 'active'} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
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
                <DateInput value={editForm.startDate ?? ''} onChange={v => setEditForm(f => ({ ...f, startDate: v }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.endDate')}</label>
                <DateInput value={editForm.endDate ?? ''} onChange={v => setEditForm(f => ({ ...f, endDate: v }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium">{t('pm.fields.contractValue')}</label>
                <Input inputMode="decimal" pattern="-?\d+\.?\d*" placeholder="0.00" value={editForm.contractValue ?? ''} onChange={e => setEditForm(f => ({ ...f, contractValue: normalizeAmountInput(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('pm.fields.notes')}</label>
              <Textarea rows={3} value={editForm.notes ?? ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              {canDelete && (
                <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => { setEditDialogOpen(false); setDeleteDialogOpen(true); }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />{t('pm.projects.delete')}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={updateProject.isPending}>{updateProject.isPending ? t('common.loading') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete project confirm dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('pm.projects.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('pm.projects.deleteConfirmDesc')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" disabled={deleteProject.isPending} onClick={() => deleteProject.mutate()}>
              {deleteProject.isPending ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase Dialog */}
      <Dialog open={phaseDialogOpen} onOpenChange={setPhaseDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editPhase ? t('pm.phases.edit') : t('pm.phases.new')}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('pm.phases.nameLabel')} *</label>
            <Input value={phaseName} onChange={e => setPhaseName(e.target.value)} placeholder={t('pm.phases.namePlaceholder')} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhaseDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => addPhase.mutate(phaseName)} disabled={!phaseName.trim() || addPhase.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectDocumentUploadDialog
        open={docDialogOpen}
        onClose={() => setDocDialogOpen(false)}
        onUpload={(files) => uploadDocument.mutate(files)}
        uploading={uploadDocument.isPending}
      />
    </div>
  );
}
