import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Trash2, Upload, FileText, Pencil, CheckCircle2, Circle, Clock, Receipt, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectDocumentUploadDialog } from '../ProjectDocumentUploadDialog';

interface User { id: string; name: string; }

interface Phase { id: string; name: string; orderIndex: number; status: string; }
interface Document { id: string; originalName: string; filePath: string; fileSize: number | null; uploaderName: string | null; createdAt: string; }
interface Invoice { id: string; projectId: string; invoiceDate: string; amount: string; notes: string | null; createdAt: string; }
interface MeetingEntry {
  id: string; entryStatus: string; notes: string | null;
  meetingId: string; meetingDate: string; meetingNotes: string | null; createdAt: string;
}
interface Project {
  id: string; projectNumber: string; name: string; orderDate: string | null;
  priority: string; status: string; startDate: string | null; endDate: string | null;
  contractValue: string | null; invoicedAmount: string; notes: string | null;
  employeeId: string | null; employeeName: string | null;
  customerName: string | null; facilityName: string | null;
  completedAt: string | null;
  phases: Phase[]; documents: Document[];
}

const ENTRY_STATUS_COLORS: Record<string, string> = { completed: 'default', active: 'outline', on_hold: 'secondary' };

function formatCurrency(v: string | null | undefined) {
  if (!v) return '—';
  const n = parseFloat(v);
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(n);
}


function PhaseIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === 'in_progress') return <Clock className="h-4 w-4 text-blue-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);
  const [phaseName, setPhaseName] = useState('');
  const [editPhase, setEditPhase] = useState<Phase | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ invoiceDate: '', amount: '', notes: '' });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
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

  const { data: usersData } = useQuery<User[]>({
    queryKey: ['pm-employees'],
    queryFn: () => api.get('/pm/employees'),
    enabled: editDialogOpen,
  });

  const updateProject = useMutation({
    mutationFn: (body: Record<string, string>) => api.patch(`/pm/projects/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      toast.success(t('pm.projects.savedOk'));
      setEditDialogOpen(false);
    },
    onError: () => toast.error(t('pm.projects.saveError')),
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
    mutationFn: (body: typeof invoiceForm) => api.post(`/pm/projects/${id}/invoices`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project-invoices', id] });
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      toast.success(t('pm.invoices.addedOk'));
      setInvoiceForm({ invoiceDate: '', amount: '', notes: '' });
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
  const remaining = contractVal - invoiced;
  const invoicedPct = contractVal > 0 ? Math.min(100, (invoiced / contractVal) * 100) : 0;
  const isOverdue = project.endDate && project.status !== 'completed' && new Date(project.endDate) < new Date();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/pm/projects')}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Select value={project.status} onValueChange={v => quickStatusChange.mutate(v)} disabled={quickStatusChange.isPending}>
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
          <p className="text-muted-foreground">{project.projectNumber}</p>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />{t('pm.projects.edit')}
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t('pm.fields.employee')}</span><span className="font-medium">{project.employeeName ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t('pm.fields.customer')}</span><span className="font-medium">{project.customerName ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t('pm.fields.facility')}</span><span className="font-medium">{project.facilityName ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t('pm.fields.orderDate')}</span><span>{project.orderDate ?? '—'}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t('pm.fields.startDateShort')}</span><span>{project.startDate ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t('pm.fields.deadline')}</span><span className={isOverdue ? 'text-destructive font-medium' : ''}>{project.endDate ?? '—'}</span></div>
            {project.completedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('pm.fields.completedAt')}</span>
                <span className="text-green-600 font-medium">{new Date(project.completedAt).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t('pm.fields.value')}</span><span className="font-mono font-medium">{formatCurrency(project.contractValue)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t('pm.fields.invoiced')}</span><span className="font-mono">{formatCurrency(project.invoicedAmount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t('pm.fields.remaining')}</span><span className={`font-mono font-medium ${remaining > 0 ? 'text-green-600' : ''}`}>{formatCurrency(String(remaining))}</span></div>
            {contractVal > 0 && (
              <div className="mt-2">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${invoicedPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{invoicedPct.toFixed(0)}{t('pm.projects.invoicedPct')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {project.notes && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground italic">{project.notes}</CardContent></Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="meetings">
        <TabsList>
          <TabsTrigger value="meetings">{t('pm.meetings.tab')} ({meetingHistory?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="phases">{t('pm.phases.tab')} ({project.phases.length})</TabsTrigger>
          <TabsTrigger value="documents">{t('pm.documents.tab')} ({project.documents.length})</TabsTrigger>
          <TabsTrigger value="invoices">{t('pm.invoices.tab')} ({invoices?.length ?? 0})</TabsTrigger>
        </TabsList>

        {/* Phases */}
        <TabsContent value="phases" className="space-y-3 mt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditPhase(null); setPhaseName(''); setPhaseDialogOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" />{t('pm.phases.add')}
            </Button>
          </div>
          {project.phases.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
          <div className="space-y-2">
            {project.phases.map(phase => (
              <div key={phase.id} className="flex items-center gap-3 p-3 rounded-md border bg-card">
                <PhaseIcon status={phase.status} />
                <span className="flex-1 text-sm font-medium">{phase.name}</span>
                <Select value={phase.status} onValueChange={v => updatePhaseStatus.mutate({ phaseId: phase.id, status: v })}>
                  <SelectTrigger className="w-[130px] h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t('pm.phaseStatus.pending')}</SelectItem>
                    <SelectItem value="in_progress">{t('pm.phaseStatus.in_progress')}</SelectItem>
                    <SelectItem value="completed">{t('pm.phaseStatus.completed')}</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditPhase(phase); setPhaseName(phase.name); setPhaseDialogOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm(t('pm.phases.deleteConfirm'))) deletePhase.mutate(phase.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
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
                <div className="min-w-[90px] text-muted-foreground font-mono text-xs pt-0.5">{entry.meetingDate}</div>
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
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setDocDialogOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" />{t('pm.documents.upload')}
            </Button>
          </div>
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
                  <a href={doc.filePath} download={doc.originalName}>
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => { if (confirm(t('pm.documents.deleteConfirm'))) deleteDocument.mutate(doc.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices" className="space-y-4 mt-4">
          {/* Add invoice form */}
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-medium mb-3">{t('pm.invoices.add')}</p>
              <form
                className="flex flex-wrap gap-3 items-end"
                onSubmit={e => { e.preventDefault(); addInvoice.mutate(invoiceForm); }}
              >
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('pm.invoices.fieldDate')} *</label>
                  <Input
                    type="date"
                    className="w-[160px]"
                    value={invoiceForm.invoiceDate}
                    onChange={e => setInvoiceForm(f => ({ ...f, invoiceDate: e.target.value }))}
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
                    value={invoiceForm.amount}
                    onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1 flex-1 min-w-[180px]">
                  <label className="text-xs text-muted-foreground">{t('pm.invoices.fieldNotes')}</label>
                  <Input
                    placeholder={t('pm.invoices.fieldNotes') + '...'}
                    value={invoiceForm.notes}
                    onChange={e => setInvoiceForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <Button type="submit" size="sm" disabled={addInvoice.isPending}>
                  <Plus className="h-3.5 w-3.5 mr-1" />{t('pm.invoices.add')}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Invoice list */}
          {(invoices ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
          <div className="space-y-2">
            {(invoices ?? []).map(inv => (
              <div key={inv.id} className="flex items-center gap-3 p-3 rounded-md border bg-card text-sm">
                <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs text-muted-foreground min-w-[100px]">{inv.invoiceDate}</span>
                <span className="font-mono font-medium text-green-600 min-w-[110px] text-right">{formatCurrency(inv.amount)}</span>
                <span className="flex-1 text-muted-foreground truncate">{inv.notes ?? ''}</span>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                  onClick={() => { if (confirm(t('pm.invoices.deleteConfirm'))) deleteInvoice.mutate(inv.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {/* Running total */}
          {(invoices ?? []).length > 0 && (
            <div className="flex justify-end">
              <div className="text-sm font-medium flex gap-2">
                <span className="text-muted-foreground">{t('pm.invoices.total')}:</span>
                <span className="font-mono text-green-600">
                  {formatCurrency(String((invoices ?? []).reduce((s, i) => s + parseFloat(i.amount), 0)))}
                </span>
              </div>
            </div>
          )}
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
                <Input type="date" value={editForm.orderDate ?? ''} onChange={e => setEditForm(f => ({ ...f, orderDate: e.target.value }))} />
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
                <Input value={editForm.customerName ?? ''} onChange={e => setEditForm(f => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.facility')}</label>
                <Input value={editForm.facilityName ?? ''} onChange={e => setEditForm(f => ({ ...f, facilityName: e.target.value }))} />
              </div>
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
                <Input type="date" value={editForm.startDate ?? ''} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.fields.endDate')}</label>
                <Input type="date" value={editForm.endDate ?? ''} onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium">{t('pm.fields.contractValue')}</label>
                <Input type="number" step="0.01" placeholder="0.00" value={editForm.contractValue ?? ''} onChange={e => setEditForm(f => ({ ...f, contractValue: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('pm.fields.notes')}</label>
              <Textarea rows={3} value={editForm.notes ?? ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={updateProject.isPending}>{updateProject.isPending ? t('common.loading') : t('common.save')}</Button>
            </DialogFooter>
          </form>
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
