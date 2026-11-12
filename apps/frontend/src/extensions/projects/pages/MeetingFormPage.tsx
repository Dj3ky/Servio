import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, History, Loader2, Save, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { localToday } from '../dates';
import type { PmTask } from '../tasks';
import { MeetingEntriesEditor } from '../meetings/MeetingEntriesEditor';
import { AutoTextarea, ConfirmDialog, ProgressBar } from '../meetings/components';
import { ProjectQuickView } from '../meetings/ProjectQuickView';
import { groupTasksByProject, safeStorage } from '../meetings/utils';
import type { ActiveProject, EntryStatus, FormEntry, MeetingDetail, MeetingListItem, NewTaskDraft } from '../meetings/types';

// Unsaved work kept in localStorage so a crash or closed tab doesn't lose a long meeting
interface MeetingDraft {
  savedAt: string;
  meetingDate: string;
  notes: string;
  entries: Record<string, { entryStatus: EntryStatus; notes: string }>;
  newTasks: NewTaskDraft[];
  taskToggles: Record<string, boolean>;
}

function formKey(date: string, notes: string, entries: FormEntry[]) {
  return JSON.stringify([date, notes, entries.map(e => [e.projectId, e.entryStatus, e.notes])]);
}

function fromActiveProject(p: ActiveProject): FormEntry {
  return {
    projectId: p.id, projectNumber: p.projectNumber, projectName: p.name, sortIndex: p.sortIndex,
    employeeId: p.employeeId, employeeName: p.employeeName,
    entryStatus: 'active', notes: '',
    lastEntryNotes: p.lastEntryNotes, lastMeetingDate: p.lastMeetingDate, projectNotes: p.notes,
  };
}

export default function MeetingFormPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const draftKey = `pm-meeting-draft:${id ?? 'new'}`;

  const [meetingDate, setMeetingDate] = useState(localToday());
  const [notes, setNotes] = useState('');
  const [entries, setEntries] = useState<FormEntry[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [snapshot, setSnapshot] = useState('');
  const [newTasks, setNewTasks] = useState<NewTaskDraft[]>([]);
  const [taskToggles, setTaskToggles] = useState<Record<string, boolean>>({});
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [draftOffer, setDraftOffer] = useState<MeetingDraft | null>(null);
  // Where to go once saved; also switches the unsaved-changes guard off
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const { data: detail, isError: detailError } = useQuery<MeetingDetail>({
    queryKey: ['pm-meeting-detail', id],
    queryFn: () => api.get(`/pm/meetings/${id}`),
    enabled: isEdit,
  });

  // When editing, "last meeting" must be the one before this meeting, not the meeting itself
  const lastBefore = isEdit ? detail?.meetingDate?.slice(0, 10) : undefined;
  const { data: activeProjects } = useQuery<ActiveProject[]>({
    queryKey: ['pm-active-projects', lastBefore ?? null],
    queryFn: () => api.get(`/pm/meetings/active-projects/list${lastBefore ? `?before=${lastBefore}` : ''}`),
    enabled: !isEdit || !!lastBefore,
  });

  // Open tasks to carry over; when editing, also the tasks created or closed in that meeting
  const { data: formTasks } = useQuery<PmTask[]>({
    queryKey: ['pm-meeting-tasks', id ?? null],
    queryFn: () => api.get(`/pm/meetings/tasks/list${id ? `?meetingId=${id}` : ''}`),
  });
  const tasksByProject = useMemo(() => groupTasksByProject(formTasks ?? []), [formTasks]);

  // Meetings of the selected year, to warn about a second meeting on the same day
  const year = meetingDate.slice(0, 4);
  const { data: yearMeetings } = useQuery<{ data: MeetingListItem[] }>({
    queryKey: ['pm-meetings', Number(year), ''],
    queryFn: () => api.get(`/pm/meetings?limit=100&year=${year}`),
    enabled: /^\d{4}$/.test(year),
  });
  const sameDay = yearMeetings?.data.find(m => m.meetingDate.slice(0, 10) === meetingDate && m.id !== id);

  // Build the form once everything it needs has loaded
  useEffect(() => {
    if (initialized || !activeProjects || !formTasks || (isEdit && !detail)) return;
    let date = localToday();
    let meetingNotes = '';
    let list: FormEntry[];
    if (isEdit && detail) {
      date = detail.meetingDate.slice(0, 10);
      meetingNotes = detail.notes ?? '';
      const activeById = new Map(activeProjects.map(p => [p.id, p]));
      const existing = new Set(detail.entries.map(e => e.projectId));
      // Keep every saved entry (even if the project is no longer active), then add active projects not yet in the meeting
      list = [
        ...detail.entries.map(e => {
          const p = activeById.get(e.projectId);
          return {
            projectId: e.projectId, projectNumber: e.projectNumber, projectName: e.projectName, sortIndex: e.projectSortIndex,
            employeeId: e.employeeId, employeeName: e.employeeName,
            entryStatus: e.entryStatus, notes: e.notes ?? '',
            lastEntryNotes: p?.lastEntryNotes ?? null, lastMeetingDate: p?.lastMeetingDate ?? null, projectNotes: p?.notes ?? null,
          };
        }),
        ...activeProjects.filter(p => !existing.has(p.id)).map(fromActiveProject),
      ];
    } else {
      list = activeProjects.map(fromActiveProject);
    }
    // Manual project order within each employee, like the backend and the Projects page
    list.sort((a, b) => a.sortIndex - b.sortIndex);
    setMeetingDate(date);
    setNotes(meetingNotes);
    setEntries(list);
    setSnapshot(formKey(date, meetingNotes, list));
    setDraftOffer(safeStorage.get<MeetingDraft>(draftKey));
    setInitialized(true);
  }, [initialized, activeProjects, formTasks, detail, isEdit, draftKey]);

  const taskProjectById = useMemo(() => new Map((formTasks ?? []).map(task => [task.id, task.projectId])), [formTasks]);
  const projectsWithTaskChanges = useMemo(() => new Set([
    ...newTasks.map(d => d.projectId),
    ...Object.keys(taskToggles).map(taskId => taskProjectById.get(taskId)).filter((p): p is string => !!p),
  ]), [newTasks, taskToggles, taskProjectById]);

  // A project counts as reviewed once it has a note, a non-default status, or task changes
  const isReviewed = (e: FormEntry) => !!e.notes.trim() || e.entryStatus !== 'active' || projectsWithTaskChanges.has(e.projectId);
  const reviewedCount = entries.filter(isReviewed).length;

  const taskDirty = newTasks.length > 0 || Object.keys(taskToggles).length > 0;
  const dirty = initialized && !savedTo && (formKey(meetingDate, notes, entries) !== snapshot || taskDirty);
  const blocker = useUnsavedChangesGuard(dirty);

  // Autosave the draft while there are unsaved changes (not while a restore offer is still open)
  useEffect(() => {
    if (!initialized || draftOffer || savedTo) return;
    if (!dirty) { safeStorage.remove(draftKey); return; }
    const timer = setTimeout(() => {
      safeStorage.set(draftKey, {
        savedAt: new Date().toISOString(), meetingDate, notes,
        entries: Object.fromEntries(entries.map(e => [e.projectId, { entryStatus: e.entryStatus, notes: e.notes }])),
        newTasks, taskToggles,
      } satisfies MeetingDraft);
    }, 600);
    return () => clearTimeout(timer);
  }, [initialized, draftOffer, savedTo, dirty, draftKey, meetingDate, notes, entries, newTasks, taskToggles]);

  function restoreDraft() {
    if (!draftOffer) return;
    const projectIds = new Set(entries.map(e => e.projectId));
    setMeetingDate(draftOffer.meetingDate || meetingDate);
    setNotes(draftOffer.notes ?? '');
    setEntries(prev => prev.map(e => draftOffer.entries[e.projectId] ? { ...e, ...draftOffer.entries[e.projectId] } : e));
    setNewTasks((draftOffer.newTasks ?? []).filter(d => projectIds.has(d.projectId)));
    setTaskToggles(Object.fromEntries(Object.entries(draftOffer.taskToggles ?? {}).filter(([taskId]) => taskProjectById.has(taskId))));
    setDraftOffer(null);
  }

  function dismissDraft() {
    safeStorage.remove(draftKey);
    setDraftOffer(null);
  }

  function updateEntry(projectId: string, patch: { entryStatus?: EntryStatus; notes?: string }) {
    setEntries(prev => prev.map(e => e.projectId === projectId ? { ...e, ...patch } : e));
  }

  function toggleTask(task: PmTask, done: boolean) {
    setTaskToggles(prev => {
      const next = { ...prev };
      if (done === (task.status === 'done')) delete next[task.id]; else next[task.id] = done;
      return next;
    });
  }

  const save = useMutation({
    mutationFn: () => {
      const toggled = Object.entries(taskToggles);
      const body = {
        meetingDate,
        notes: notes.trim() || null,
        entries: entries.map(e => ({ projectId: e.projectId, entryStatus: e.entryStatus, notes: e.notes.trim() || null })),
        tasks: {
          create: newTasks.map(({ key: _key, ...draft }) => draft),
          complete: toggled.filter(([, done]) => done).map(([taskId]) => taskId),
          reopen: toggled.filter(([, done]) => !done).map(([taskId]) => taskId),
        },
      };
      return isEdit ? api.patch<{ id: string }>(`/pm/meetings/${id}`, body) : api.post<{ id: string }>('/pm/meetings', body);
    },
    onSuccess: (saved) => {
      safeStorage.remove(draftKey);
      for (const key of ['pm-meetings', 'pm-meetings-summary', 'pm-meeting-detail', 'pm-active-projects', 'pm-meeting-tasks',
        'pm-project-tasks', 'pm-my-tasks', 'pm-my-task-count', 'notifications', 'pm-projects', 'pm-report', 'pm-project-meetings']) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      toast.success(t('pm.meetings.savedOk'));
      setSavedTo(`/pm/meetings/${saved.id}`);
    },
    onError: () => toast.error(t('pm.meetings.saveError')),
  });

  // Navigate after the render that switched the guard off
  useEffect(() => { if (savedTo) navigate(savedTo, { replace: true }); }, [savedTo, navigate]);

  const canSave = initialized && !!meetingDate && !save.isPending && !savedTo;

  // Ctrl/Cmd+Enter or Ctrl/Cmd+S saves
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => { if (canSave) save.mutate(); };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Enter' || e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function confirmLeave() {
    safeStorage.remove(draftKey);
    if (blocker.state === 'blocked') blocker.proceed();
  }

  const backTo = isEdit ? `/pm/meetings/${id}` : '/pm/meetings';

  if (detailError) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-muted-foreground">{t('pm.meetings.notFound')}</p>
        <Button variant="outline" onClick={() => navigate('/pm/meetings')}><ArrowLeft className="h-4 w-4 mr-2" />{t('pm.meetings.backToList')}</Button>
      </div>
    );
  }

  return (
    <div className="pb-10">
      {/* Header stays visible while scrolling through the projects.
          Sticky stops at the scroll container's padding edge, so the negative top offset
          (same as <main>'s p-4 / lg:p-6) pins it flush under the top bar with no gap. */}
      <div className="sticky -top-4 lg:-top-6 z-20 -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 mb-6 border-b bg-background shadow-sm">
        <div className="px-4 lg:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(backTo)} title={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">
              {isEdit ? t('pm.meetings.editHeading') : t('pm.meetings.newTitle')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {initialized ? t('pm.meetings.reviewedCount', { done: reviewedCount, total: entries.length }) : t('common.loading')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">{t('pm.meetings.fieldDate')}</label>
            <DateInput className="h-9 w-[150px]" value={meetingDate} onChange={setMeetingDate} />
          </div>
          <div className="hidden md:block w-40 lg:w-56">
            <ProgressBar value={reviewedCount} max={entries.length} className="h-2" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(backTo)}>{t('common.cancel')}</Button>
            <Button onClick={() => save.mutate()} disabled={!canSave} title="Ctrl+Enter">
              {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {isEdit ? t('common.save') : t('pm.meetings.save')}
            </Button>
          </div>
        </div>
        <ProgressBar value={reviewedCount} max={entries.length} className="md:hidden h-0.5 rounded-none" />
      </div>

      {!initialized ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />{t('common.loading')}
        </div>
      ) : (
        <div className="space-y-6 max-w-[1500px]">
          {draftOffer && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm">
              <History className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="flex-1 min-w-[200px]">{t('pm.meetings.draftFound', { time: formatDateTime(draftOffer.savedAt) })}</span>
              <Button size="sm" variant="outline" onClick={dismissDraft}>{t('pm.meetings.draftDiscard')}</Button>
              <Button size="sm" onClick={restoreDraft}>{t('pm.meetings.draftRestore')}</Button>
            </div>
          )}

          {sameDay && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span>{t('pm.meetings.sameDayWarning', { date: formatDate(meetingDate) })}</span>
              <Link to={`/pm/meetings/${sameDay.id}`} className="underline underline-offset-2 font-medium">{t('pm.meetings.openMeeting')}</Link>
            </div>
          )}

          <section className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
            <label className="text-sm font-semibold" htmlFor="meeting-notes">{t('pm.meetings.fieldNotes')}</label>
            <AutoTextarea id="meeting-notes" className="min-h-[60px]" placeholder={t('pm.meetings.notesPlaceholder')}
              value={notes} onChange={e => setNotes(e.target.value)} />
          </section>

          <MeetingEntriesEditor
            entries={entries}
            onEntryChange={updateEntry}
            isReviewed={isReviewed}
            onQuickView={setQuickViewId}
            highlightProjectId={quickViewId}
            tasks={{ tasksByProject, newTasks, setNewTasks, taskToggles, toggleTask }}
          />
        </div>
      )}

      <ProjectQuickView projectId={quickViewId} onClose={() => setQuickViewId(null)} />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('pm.meetings.discardTitle')}
        text={t('pm.meetings.discardText')}
        cancelLabel={t('pm.meetings.discardKeepEditing')}
        confirmLabel={t('pm.meetings.discardConfirm')}
        onCancel={() => blocker.state === 'blocked' && blocker.reset()}
        onConfirm={confirmLeave}
      />
    </div>
  );
}
