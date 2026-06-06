import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Meeting {
  id: string; meetingDate: string; notes: string | null;
  createdByName: string | null; createdAt: string;
}
interface MeetingDetail extends Meeting {
  entries: MeetingEntry[];
}
interface MeetingEntry {
  id: string; projectId: string; projectNumber: string; projectName: string;
  projectPriority: string; entryStatus: string; notes: string | null;
}
interface ActiveProject {
  id: string; projectNumber: string; name: string; priority: string; status: string;
}

interface EntryDraft {
  projectId: string; projectNumber: string; projectName: string; priority: string;
  entryStatus: string; notes: string;
}

const ENTRY_STATUS_LABELS: Record<string, string> = { done: 'Dokončano', in_progress: 'V teku', blocked: 'Blokirano' };
const ENTRY_STATUS_COLORS: Record<string, string> = { done: 'default', in_progress: 'outline', blocked: 'destructive' };

export default function MeetingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [meetingNotes, setMeetingNotes] = useState('');
  const [entries, setEntries] = useState<EntryDraft[]>([]);

  const { data, isLoading } = useQuery<{ data: Meeting[] }>({
    queryKey: ['pm-meetings'],
    queryFn: () => api.get('/pm/meetings?limit=50'),
  });

  const { data: activeProjects } = useQuery<ActiveProject[]>({
    queryKey: ['pm-active-projects'],
    queryFn: () => api.get('/pm/meetings/active-projects/list'),
    enabled: newOpen,
  });

  const { data: detail } = useQuery<MeetingDetail>({
    queryKey: ['pm-meeting-detail', detailId],
    queryFn: () => api.get(`/pm/meetings/${detailId}`),
    enabled: !!detailId,
  });

  function openNew() {
    setMeetingDate(new Date().toISOString().split('T')[0]);
    setMeetingNotes('');
    setEntries([]);
    setNewOpen(true);
  }

  // When active projects load, initialize entries
  function initEntries(projects: ActiveProject[]) {
    setEntries(projects.map(p => ({
      projectId: p.id,
      projectNumber: p.projectNumber,
      projectName: p.name,
      priority: p.priority,
      entryStatus: 'in_progress',
      notes: '',
    })));
  }

  // Load active projects into entries when dialog opens
  if (newOpen && activeProjects && entries.length === 0 && activeProjects.length > 0) {
    initEntries(activeProjects);
  }

  function updateEntry(projectId: string, field: 'entryStatus' | 'notes', value: string) {
    setEntries(prev => prev.map(e => e.projectId === projectId ? { ...e, [field]: value } : e));
  }

  const createMeeting = useMutation({
    mutationFn: () => api.post('/pm/meetings', {
      meetingDate,
      notes: meetingNotes || null,
      entries: entries.map(e => ({ projectId: e.projectId, entryStatus: e.entryStatus, notes: e.notes || null })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-meetings'] });
      toast.success('Sestanek shranjen');
      setNewOpen(false);
    },
    onError: () => toast.error('Napaka pri shranjevanju'),
  });

  const deleteMeeting = useMutation({
    mutationFn: (id: string) => api.delete(`/pm/meetings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-meetings'] });
      toast.success('Sestanek izbrisan');
    },
    onError: () => toast.error('Napaka'),
  });

  const meetings = data?.data ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tedni sestanki</h1>
          <p className="text-sm text-muted-foreground">Pregled napredka projektov po tednih</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nov sestanek</Button>
      </div>

      {/* Meetings list */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <th className="text-left px-4 py-3 font-medium">Datum</th>
              <th className="text-left px-4 py-3 font-medium">Opombe</th>
              <th className="text-left px-4 py-3 font-medium">Ustvaril</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">{t('common.loading')}</td></tr>
            )}
            {!isLoading && meetings.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>
            )}
            {meetings.map(m => (
              <tr key={m.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setDetailId(m.id)}>
                <td className="px-4 py-3 font-mono">{m.meetingDate}</td>
                <td className="px-4 py-3 text-muted-foreground truncate max-w-[300px]">{m.notes ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.createdByName ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New meeting dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nov tedenski sestanek</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Datum sestanka *</label>
                <Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Splošne opombe</label>
              <Textarea placeholder="Opombe za sestanek..." value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} rows={2} />
            </div>

            {/* Projects grid */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Projekti ({entries.length})</p>
              {entries.length === 0 && <p className="text-sm text-muted-foreground">Ni aktivnih projektov.</p>}
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">DN / Projekt</th>
                      <th className="text-left px-3 py-2 font-medium w-[160px]">Status</th>
                      <th className="text-left px-3 py-2 font-medium">Opomba</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(entry => (
                      <tr key={entry.projectId} className="border-b">
                        <td className="px-3 py-2">
                          <div className="font-medium">{entry.projectNumber}</div>
                          <div className="text-xs text-muted-foreground">{entry.projectName}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Select value={entry.entryStatus} onValueChange={v => updateEntry(entry.projectId, 'entryStatus', v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="in_progress">V teku</SelectItem>
                              <SelectItem value="done">Dokončano</SelectItem>
                              <SelectItem value="blocked">Blokirano</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            className="h-7 text-xs"
                            placeholder="Kaj je bilo narejenega..."
                            value={entry.notes}
                            onChange={e => updateEntry(entry.projectId, 'notes', e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => createMeeting.mutate()} disabled={createMeeting.isPending || !meetingDate}>
              {createMeeting.isPending ? t('common.loading') : 'Shrani sestanek'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meeting detail dialog */}
      <Dialog open={!!detailId} onOpenChange={v => { if (!v) setDetailId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sestanek — {detail?.meetingDate}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              {detail.notes && <p className="text-sm text-muted-foreground italic border-l-2 pl-3">{detail.notes}</p>}
              <div className="space-y-2">
                {detail.entries.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
                {detail.entries.map(entry => (
                  <div key={entry.id} className="flex gap-3 p-3 rounded-md border text-sm cursor-pointer hover:bg-muted/30" onClick={() => { setDetailId(null); navigate(`/pm/projects/${entry.projectId}`); }}>
                    <div className="min-w-[120px]">
                      <div className="font-medium">{entry.projectNumber}</div>
                      <div className="text-xs text-muted-foreground">{entry.projectName}</div>
                    </div>
                    <div className="flex-1">
                      <Badge variant={ENTRY_STATUS_COLORS[entry.entryStatus] as any} className="text-xs mb-1">
                        {ENTRY_STATUS_LABELS[entry.entryStatus]}
                      </Badge>
                      {entry.notes && <p className="text-muted-foreground">{entry.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>{t('common.close')}</Button>
            {detail && (
              <Button variant="destructive" onClick={() => { if (confirm('Izbriši sestanek?')) { deleteMeeting.mutate(detail.id); setDetailId(null); } }}>
                {t('common.delete')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
