import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, ChevronRight, LayoutList, Users, ChevronDown, ChevronUp } from 'lucide-react';
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
  employeeId: string | null; employeeName: string | null;
}
interface ActiveProject {
  id: string; projectNumber: string; name: string; priority: string; status: string;
  employeeId: string | null; employeeName: string | null;
  lastEntryStatus: string | null; lastEntryNotes: string | null; lastMeetingDate: string | null;
}
interface EntryDraft {
  projectId: string; projectNumber: string; projectName: string; priority: string;
  entryStatus: string; notes: string;
  employeeId: string | null; employeeName: string | null;
  lastMeetingDate: string | null; lastEntryNotes: string | null;
}

const ENTRY_STATUS_COLORS: Record<string, string> = { completed: 'default', active: 'outline', on_hold: 'secondary' };

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

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - i);

export default function MeetingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [meetingNotes, setMeetingNotes] = useState('');
  const [entries, setEntries] = useState<EntryDraft[]>([]);
  const [groupByEmployee, setGroupByEmployee] = useState(false);
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [collapsedDialogGroups, setCollapsedDialogGroups] = useState<Set<string>>(new Set());
  const [collapsedDetailGroups, setCollapsedDetailGroups] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editEntries, setEditEntries] = useState<MeetingEntry[]>([]);

  const { data, isLoading } = useQuery<{ data: Meeting[] }>({
    queryKey: ['pm-meetings', yearFilter],
    queryFn: () => api.get(`/pm/meetings?limit=100&year=${yearFilter}`),
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

  function initEntries(projects: ActiveProject[]) {
    setEntries(projects.map(p => ({
      projectId: p.id,
      projectNumber: p.projectNumber,
      projectName: p.name,
      priority: p.priority,
      entryStatus: 'active',
      notes: '',
      employeeId: p.employeeId,
      employeeName: p.employeeName,
      lastMeetingDate: p.lastMeetingDate,
      lastEntryNotes: p.lastEntryNotes,
    })));
    setCollapsedDialogGroups(new Set());
  }

  function toggleDialogGroup(key: string) {
    setCollapsedDialogGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleDetailGroup(key: string) {
    setCollapsedDetailGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Group new-meeting entries by employee
  const entriesByEmployee = useMemo(() => {
    const groups: { key: string; employeeName: string | null; entries: EntryDraft[] }[] = [];
    const seen = new Map<string, number>();
    for (const e of entries) {
      const key = e.employeeId ?? '__none__';
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({ key, employeeName: e.employeeName, entries: [] });
      }
      groups[seen.get(key)!].entries.push(e);
    }
    return groups;
  }, [entries]);

  // Group detail entries by employee
  const detailByEmployee = useMemo(() => {
    if (!detail) return [];
    const groups: { key: string; employeeName: string | null; entries: MeetingEntry[] }[] = [];
    const seen = new Map<string, number>();
    for (const e of detail.entries) {
      const key = e.employeeId ?? '__none__';
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({ key, employeeName: e.employeeName, entries: [] });
      }
      groups[seen.get(key)!].entries.push(e);
    }
    return groups;
  }, [detail]);

  if (newOpen && activeProjects && entries.length === 0 && activeProjects.length > 0) {
    initEntries(activeProjects);
  }

  function updateEntry(projectId: string, field: 'entryStatus' | 'notes', value: string) {
    setEntries(prev => prev.map(e => e.projectId === projectId ? { ...e, [field]: value } : e));
  }

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const createMeeting = useMutation({
    mutationFn: () => api.post('/pm/meetings', {
      meetingDate,
      notes: meetingNotes || null,
      entries: entries.map(e => ({ projectId: e.projectId, entryStatus: e.entryStatus, notes: e.notes || null })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-meetings'] });
      qc.invalidateQueries({ queryKey: ['pm-active-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      toast.success(t('pm.meetings.savedOk'));
      setNewOpen(false);
    },
    onError: () => toast.error(t('pm.meetings.saveError')),
  });

  const deleteMeeting = useMutation({
    mutationFn: (id: string) => api.delete(`/pm/meetings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-meetings'] });
      toast.success(t('pm.meetings.deletedOk'));
    },
    onError: () => toast.error(t('pm.meetings.error')),
  });

  const updateMeeting = useMutation({
    mutationFn: (id: string) => api.patch(`/pm/meetings/${id}`, {
      notes: editNotes || null,
      entries: editEntries.map(e => ({ projectId: e.projectId, entryStatus: e.entryStatus, notes: e.notes || null })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-meetings'] });
      qc.invalidateQueries({ queryKey: ['pm-meeting-detail', detailId] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-report'] });
      toast.success(t('pm.meetings.savedOk'));
      setEditMode(false);
    },
    onError: () => toast.error(t('pm.meetings.saveError')),
  });

  function openEditMode() {
    if (!detail) return;
    setEditDate(detail.meetingDate);
    setEditNotes(detail.notes ?? '');
    setEditEntries(detail.entries.map(e => ({ ...e })));
    setEditMode(true);
  }

  function updateEditEntry(projectId: string, field: 'entryStatus' | 'notes', value: string) {
    setEditEntries(prev => prev.map(e => e.projectId === projectId ? { ...e, [field]: value } : e));
  }

  // Group edit entries by employee
  const editEntriesByEmployee = useMemo(() => {
    const groups: { key: string; employeeName: string | null; entries: MeetingEntry[] }[] = [];
    const seen = new Map<string, number>();
    for (const e of editEntries) {
      const key = e.employeeId ?? '__none__';
      if (!seen.has(key)) { seen.set(key, groups.length); groups.push({ key, employeeName: e.employeeName, entries: [] }); }
      groups[seen.get(key)!].entries.push(e);
    }
    return groups;
  }, [editEntries]);

  const meetings = data?.data ?? [];

  const grouped = useMemo(() => {
    const groups: { key: string; name: string | null; meetings: Meeting[] }[] = [];
    const seen = new Map<string, number>();
    for (const m of meetings) {
      const key = m.createdByName ?? '__none__';
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({ key, name: m.createdByName, meetings: [] });
      }
      groups[seen.get(key)!].meetings.push(m);
    }
    return groups;
  }, [meetings]);

  const tableHead = (
    <tr className="border-b bg-muted/50 text-muted-foreground">
      <th className="text-left px-4 py-3 font-medium">{t('pm.meetings.colDate')}</th>
      <th className="text-left px-4 py-3 font-medium">{t('pm.meetings.colNotes')}</th>
      {!groupByEmployee && <th className="text-left px-4 py-3 font-medium">{t('pm.meetings.colCreatedBy')}</th>}
      <th className="px-4 py-3" />
    </tr>
  );

  function renderRow(m: Meeting) {
    return (
      <tr key={m.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => { setCollapsedDetailGroups(new Set()); setEditMode(false); setDetailId(m.id); }}>
        <td className="px-4 py-3 font-mono">{m.meetingDate}</td>
        <td className="px-4 py-3 text-muted-foreground truncate max-w-[300px]">{m.notes ?? '—'}</td>
        {!groupByEmployee && <td className="px-4 py-3 text-muted-foreground">{m.createdByName ?? '—'}</td>}
        <td className="px-4 py-3 text-right">
          <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
        </td>
      </tr>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t('pm.meetings.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pm.meetings.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Year filter */}
          <Select value={String(yearFilter)} onValueChange={v => setYearFilter(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* View toggle */}
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
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />{t('pm.meetings.new')}</Button>
        </div>
      </div>

      {/* Flat list */}
      {!groupByEmployee && (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>{tableHead}</thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">{t('common.loading')}</td></tr>}
              {!isLoading && meetings.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">{t('common.noData')}</td></tr>}
              {meetings.map(renderRow)}
            </tbody>
          </table>
        </div>
      )}

      {/* Grouped by employee */}
      {groupByEmployee && (
        <div className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</p>}
          {!isLoading && grouped.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">{t('common.noData')}</p>}
          {grouped.map((group, idx) => {
            const collapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key} className="rounded-md border overflow-hidden">
                <button
                  className={`w-full px-4 py-2 text-sm font-semibold flex items-center gap-2 text-left ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}
                  onClick={() => toggleGroup(group.key)}
                >
                  <Users className="h-4 w-4 opacity-70 shrink-0" />
                  <span className="flex-1">{group.name ?? t('pm.reports.unassigned')}</span>
                  <span className="font-normal text-muted-foreground">({group.meetings.length})</span>
                  {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </button>
                {!collapsed && (
                  <table className="w-full text-sm">
                    <thead>{tableHead}</thead>
                    <tbody>{group.meetings.map(renderRow)}</tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New meeting dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('pm.meetings.newTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.meetings.fieldDate')} *</label>
                <Input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('pm.meetings.fieldNotes')}</label>
              <Textarea placeholder={t('pm.meetings.notesPlaceholder')} value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('pm.meetings.projectsSection')} ({entries.length})</p>
              {entries.length === 0 && <p className="text-sm text-muted-foreground">{t('pm.meetings.noActiveProjects')}</p>}
              <div className="space-y-2">
                {entriesByEmployee.map((group, idx) => {
                  const collapsed = collapsedDialogGroups.has(group.key);
                  return (
                    <div key={group.key} className="rounded-md border overflow-hidden">
                      <button
                        type="button"
                        className={`w-full px-3 py-2 text-sm font-semibold flex items-center gap-2 text-left ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}
                        onClick={() => toggleDialogGroup(group.key)}
                      >
                        <Users className="h-3.5 w-3.5 opacity-70 shrink-0" />
                        <span className="flex-1">{group.employeeName ?? t('pm.reports.unassigned')}</span>
                        <span className="font-normal text-muted-foreground">({group.entries.length})</span>
                        {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                      {!collapsed && (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 text-muted-foreground">
                              <th className="text-left px-3 py-2 font-medium">{t('pm.meetings.colProject')}</th>
                              <th className="text-left px-3 py-2 font-medium w-[150px]">{t('common.status')}</th>
                              <th className="text-left px-3 py-2 font-medium">{t('pm.meetings.colNote')}</th>
                              <th className="text-left px-3 py-2 font-medium w-[200px]">{t('pm.meetings.colLastMeeting')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.entries.map(entry => (
                              <tr key={entry.projectId} className="border-b">
                                <td className="px-3 py-2">
                                  <div className="font-medium">{entry.projectNumber}</div>
                                  <div className="text-xs text-muted-foreground">{entry.projectName}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <Select value={entry.entryStatus} onValueChange={v => updateEntry(entry.projectId, 'entryStatus', v)}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="active">{t('pm.status.active')}</SelectItem>
                                      <SelectItem value="on_hold">{t('pm.status.on_hold')}</SelectItem>
                                      <SelectItem value="completed">{t('pm.status.completed')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    className="h-7 text-xs"
                                    placeholder={t('pm.meetings.notePlaceholder')}
                                    value={entry.notes}
                                    onChange={e => updateEntry(entry.projectId, 'notes', e.target.value)}
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  {entry.lastMeetingDate
                                    ? <div>
                                        <div className="text-xs font-mono text-muted-foreground">{entry.lastMeetingDate}</div>
                                        {entry.lastEntryNotes && <div className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-[180px]">{entry.lastEntryNotes}</div>}
                                      </div>
                                    : <span className="text-xs text-muted-foreground">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => createMeeting.mutate()} disabled={createMeeting.isPending || !meetingDate}>
              {createMeeting.isPending ? t('common.loading') : t('pm.meetings.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Meeting detail / edit dialog */}
      <Dialog open={!!detailId} onOpenChange={v => { if (!v) { setDetailId(null); setEditMode(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editMode
                ? t('pm.meetings.editTitle', { date: detail?.meetingDate ?? '' })
                : t('pm.meetings.dialogTitle', { date: detail?.meetingDate ?? '' })}
            </DialogTitle>
          </DialogHeader>

          {detail && !editMode && (
            <div className="space-y-3">
              {detail.notes && <p className="text-sm text-muted-foreground italic border-l-2 pl-3">{detail.notes}</p>}
              {detail.entries.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
              {detailByEmployee.map((group, idx) => {
                const collapsed = collapsedDetailGroups.has(group.key);
                return (
                  <div key={group.key} className="rounded-md border overflow-hidden">
                    <button
                      className={`w-full px-3 py-2 text-sm font-semibold flex items-center gap-2 text-left ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}
                      onClick={() => toggleDetailGroup(group.key)}
                    >
                      <Users className="h-3.5 w-3.5 opacity-70 shrink-0" />
                      <span className="flex-1">{group.employeeName ?? t('pm.reports.unassigned')}</span>
                      <span className="font-normal text-muted-foreground">({group.entries.length})</span>
                      {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {!collapsed && (
                      <div className="divide-y">
                        {group.entries.map(entry => (
                          <div
                            key={entry.id}
                            className="flex gap-3 p-3 text-sm cursor-pointer hover:bg-muted/30"
                            onClick={() => { setDetailId(null); navigate(`/pm/projects/${entry.projectId}`); }}
                          >
                            <div className="min-w-[120px]">
                              <div className="font-medium">{entry.projectNumber}</div>
                              <div className="text-xs text-muted-foreground">{entry.projectName}</div>
                            </div>
                            <div className="flex-1">
                              <Badge variant={ENTRY_STATUS_COLORS[entry.entryStatus] as any} className="text-xs mb-1">
                                {t(`pm.status.${entry.entryStatus}`)}
                              </Badge>
                              {entry.notes && <p className="text-muted-foreground">{entry.notes}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {detail && editMode && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t('pm.meetings.fieldNotes')}</label>
                <Textarea placeholder={t('pm.meetings.notesPlaceholder')} value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('pm.meetings.projectsSection')} ({editEntries.length})</p>
                {editEntriesByEmployee.map((group, idx) => (
                  <div key={group.key} className="rounded-md border overflow-hidden">
                    <div className={`px-3 py-2 text-sm font-semibold flex items-center gap-2 ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}>
                      <Users className="h-3.5 w-3.5 opacity-70 shrink-0" />
                      <span className="flex-1">{group.employeeName ?? t('pm.reports.unassigned')}</span>
                      <span className="font-normal text-muted-foreground">({group.entries.length})</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">{t('pm.meetings.colProject')}</th>
                          <th className="text-left px-3 py-2 font-medium w-[160px]">{t('common.status')}</th>
                          <th className="text-left px-3 py-2 font-medium">{t('pm.meetings.colNote')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.entries.map(entry => (
                          <tr key={entry.id} className="border-b">
                            <td className="px-3 py-2">
                              <div className="font-medium">{entry.projectNumber}</div>
                              <div className="text-xs text-muted-foreground">{entry.projectName}</div>
                            </td>
                            <td className="px-3 py-2">
                              <Select value={entry.entryStatus} onValueChange={v => updateEditEntry(entry.projectId, 'entryStatus', v)}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">{t('pm.status.active')}</SelectItem>
                                  <SelectItem value="on_hold">{t('pm.status.on_hold')}</SelectItem>
                                  <SelectItem value="completed">{t('pm.status.completed')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-7 text-xs"
                                placeholder={t('pm.meetings.notePlaceholder')}
                                value={entry.notes ?? ''}
                                onChange={e => updateEditEntry(entry.projectId, 'notes', e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            {!editMode ? (
              <>
                <Button variant="outline" onClick={() => setDetailId(null)}>{t('common.close')}</Button>
                <Button variant="outline" onClick={openEditMode}>{t('common.edit')}</Button>
                {detail && (
                  <Button variant="destructive" onClick={() => { if (confirm(t('pm.meetings.deleteConfirm'))) { deleteMeeting.mutate(detail.id); setDetailId(null); } }}>
                    {t('common.delete')}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditMode(false)}>{t('common.cancel')}</Button>
                <Button onClick={() => updateMeeting.mutate(detail!.id)} disabled={updateMeeting.isPending}>
                  {updateMeeting.isPending ? t('common.loading') : t('common.save')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
