import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Loader2, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCan } from '@/stores/permissionsStore';
import { TaskLine } from '../tasks';
import { useEmployeeOrder } from '../employeeOrder';
import { ConfirmDialog, StatusBadge } from '../meetings/components';
import { employeeAccent, groupByEmployee, groupTasksByProject, initials, longDate } from '../meetings/utils';
import type { MeetingDetail } from '../meetings/types';

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
      <div className={cn('text-2xl font-semibold tabular-nums leading-none', tone)}>{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function MeetingDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = useCan();
  const employeeOrder = useEmployeeOrder();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: meeting, isLoading, isError } = useQuery<MeetingDetail>({
    queryKey: ['pm-meeting-detail', id],
    queryFn: () => api.get(`/pm/meetings/${id}`),
  });

  const groups = useMemo(() => groupByEmployee(meeting?.entries ?? [], employeeOrder), [meeting, employeeOrder]);
  const tasksByProject = useMemo(() => groupTasksByProject(meeting?.tasks ?? []), [meeting]);

  const deleteMeeting = useMutation({
    mutationFn: () => api.delete(`/pm/meetings/${id}`),
    onSuccess: () => {
      for (const key of ['pm-meetings', 'pm-meetings-summary', 'pm-active-projects', 'pm-project-meetings']) qc.invalidateQueries({ queryKey: [key] });
      toast.success(t('pm.meetings.deletedOk'));
      navigate('/pm/meetings', { replace: true });
    },
    onError: () => toast.error(t('pm.meetings.error')),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="h-5 w-5 mr-2 animate-spin" />{t('common.loading')}</div>;
  }
  if (isError || !meeting) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-muted-foreground">{t('pm.meetings.notFound')}</p>
        <Button variant="outline" onClick={() => navigate('/pm/meetings')}><ArrowLeft className="h-4 w-4 mr-2" />{t('pm.meetings.backToList')}</Button>
      </div>
    );
  }

  const entries = meeting.entries;
  const noted = entries.filter(e => e.notes?.trim()).length;
  const completed = entries.filter(e => e.entryStatus === 'completed').length;
  const onHold = entries.filter(e => e.entryStatus === 'on_hold').length;
  const tasksCreated = meeting.tasks.filter(task => task.meetingId === meeting.id).length;
  const tasksClosed = meeting.tasks.filter(task => task.completedMeetingId === meeting.id).length;

  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-[1300px]">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => navigate('/pm/meetings')} title={t('pm.meetings.backToList')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('pm.meetings.title')}</p>
          <h1 className="text-2xl font-bold leading-tight">{longDate(meeting.meetingDate, i18n.language)}</h1>
          {meeting.createdByName && (
            <p className="text-sm text-muted-foreground mt-0.5">{t('pm.meetings.createdBy', { name: meeting.createdByName })}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-md border">
            <Button variant="ghost" size="sm" className="rounded-r-none" disabled={!meeting.prev}
              title={meeting.prev ? formatDate(meeting.prev.meetingDate) : undefined}
              onClick={() => meeting.prev && navigate(`/pm/meetings/${meeting.prev.id}`)}>
              <ChevronLeft className="h-4 w-4 mr-1" />{t('pm.meetings.previousMeeting')}
            </Button>
            <div className="w-px self-stretch bg-border" />
            <Button variant="ghost" size="sm" className="rounded-l-none" disabled={!meeting.next}
              title={meeting.next ? formatDate(meeting.next.meetingDate) : undefined}
              onClick={() => meeting.next && navigate(`/pm/meetings/${meeting.next.id}`)}>
              {t('pm.meetings.nextMeeting')}<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
          {can('projects', 'manage') && (
            <Button onClick={() => navigate(`/pm/meetings/${meeting.id}/edit`)}><Pencil className="h-4 w-4 mr-2" />{t('common.edit')}</Button>
          )}
          {can('projects', 'delete') && (
            <Button variant="outline" size="icon" className="text-destructive hover:text-destructive" title={t('common.delete')} onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Numbers at a glance */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label={t('pm.meetings.statProjects')} value={entries.length} />
        <Stat label={t('pm.meetings.statWithNotes')} value={noted} />
        <Stat label={t('pm.meetings.statCompleted')} value={completed} tone={completed ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
        <Stat label={t('pm.meetings.statOnHold')} value={onHold} tone={onHold ? 'text-amber-600 dark:text-amber-400' : undefined} />
        <Stat label={t('pm.meetings.statTasksCreated')} value={tasksCreated} />
        <Stat label={t('pm.meetings.statTasksClosed')} value={tasksClosed} />
      </div>

      {meeting.notes && (
        <section className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-1.5">{t('pm.meetings.fieldNotes')}</h2>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{meeting.notes}</p>
        </section>
      )}

      {entries.length === 0 && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{t('common.noData')}</div>
      )}

      <div className="space-y-3">
        {groups.map(group => {
          const isCollapsed = collapsed.has(group.key);
          const accent = employeeAccent(group.employeeId, employeeOrder);
          return (
            <section key={group.key} className="rounded-lg border bg-card overflow-hidden shadow-sm">
              <button type="button" onClick={() => toggleGroup(group.key)}
                className={cn('relative w-full flex items-center gap-3 px-4 py-2.5 text-left', accent.soft)}>
                <span className={cn('absolute inset-y-0 left-0 w-1', accent.bar)} />
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white', accent.bar)}>
                  {initials(group.employeeName)}
                </span>
                <span className="font-semibold text-sm flex-1 min-w-0 truncate">{group.employeeName ?? t('pm.reports.unassigned')}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{group.items.length}</span>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} />
              </button>
              {!isCollapsed && (
                <div className="divide-y">
                  {group.items.map(entry => {
                    const tasks = tasksByProject.get(entry.projectId) ?? [];
                    return (
                      <div key={entry.id} className="px-4 py-3 md:grid md:grid-cols-[minmax(0,16rem)_7.5rem_minmax(0,1fr)] md:gap-4 space-y-1.5 md:space-y-0">
                        <div className="min-w-0">
                          <Link to={`/pm/projects/${entry.projectId}`} className="font-medium hover:underline underline-offset-2 break-words">
                            {entry.projectName}
                          </Link>
                          <div className="text-xs text-muted-foreground font-mono">{entry.projectNumber}</div>
                        </div>
                        <div><StatusBadge status={entry.entryStatus} /></div>
                        <div className="min-w-0 text-sm">
                          {entry.notes
                            ? <p className="whitespace-pre-wrap break-words">{entry.notes}</p>
                            : <p className="text-muted-foreground">—</p>}
                          {tasks.length > 0 && (
                            <div className="mt-2 space-y-0.5 rounded-md border border-dashed bg-muted/20 px-3 py-1.5">
                              {tasks.map(task => {
                                const closedHere = task.completedMeetingId === meeting.id;
                                return (
                                  <TaskLine
                                    key={task.id}
                                    title={task.title}
                                    assigneeName={task.assigneeName}
                                    dueDate={task.dueDate}
                                    completedAt={task.completedAt}
                                    done={task.status === 'done'}
                                    meta={<Badge variant={closedHere ? 'secondary' : 'outline'} className="text-[10px] px-1 py-0 shrink-0">
                                      {t(closedHere ? 'pm.tasks.closedHere' : 'pm.tasks.createdHere')}
                                    </Badge>}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t('pm.meetings.deleteConfirm')}
        text={t('pm.meetings.deleteText', { date: formatDate(meeting.meetingDate) })}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        busy={deleteMeeting.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => deleteMeeting.mutate()}
      />
    </div>
  );
}
