import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Trash2, Upload, FileText, Pencil, CheckCircle2, Circle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Phase { id: string; name: string; orderIndex: number; status: string; }
interface Document { id: string; originalName: string; filePath: string; fileSize: number | null; uploaderName: string | null; createdAt: string; }
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
  phases: Phase[]; documents: Document[];
}

const ENTRY_STATUS_COLORS: Record<string, string> = { done: 'default', in_progress: 'outline', blocked: 'destructive' };

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
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post(`/pm/projects/${id}/documents`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project', id] });
      toast.success(t('pm.documents.uploadOk'));
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.projectNumber}</h1>
            <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>{t(`pm.status.${project.status}`)}</Badge>
            <Badge variant={project.priority === 'high' ? 'destructive' : 'outline'}>{t(`pm.priority.${project.priority}`)}</Badge>
            {isOverdue && <Badge variant="destructive">{t('pm.projects.overdue')}</Badge>}
          </div>
          <p className="text-muted-foreground">{project.name}</p>
        </div>
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
      <Tabs defaultValue="phases">
        <TabsList>
          <TabsTrigger value="phases">{t('pm.phases.tab')} ({project.phases.length})</TabsTrigger>
          <TabsTrigger value="meetings">{t('pm.meetings.tab')} ({meetingHistory?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="documents">{t('pm.documents.tab')} ({project.documents.length})</TabsTrigger>
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
                    {t(`pm.entryStatus.${entry.entryStatus}`)}
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
            <label>
              <Button size="sm" asChild>
                <span><Upload className="h-3.5 w-3.5 mr-1" />{t('pm.documents.upload')}</span>
              </Button>
              <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadDocument.mutate(e.target.files[0]); e.target.value = ''; }} />
            </label>
          </div>
          {project.documents.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
          <div className="space-y-2">
            {project.documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-md border bg-card">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={doc.filePath} target="_blank" rel="noreferrer" className="flex-1 text-sm hover:underline truncate">{doc.originalName}</a>
                <span className="text-xs text-muted-foreground shrink-0">
                  {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ''} · {doc.uploaderName}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => { if (confirm(t('pm.documents.deleteConfirm'))) deleteDocument.mutate(doc.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
