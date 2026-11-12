import { useMemo, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, CircleCheck, Circle, Copy, Filter, Plus, X } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TaskLine, TaskForm, usePmEmployees, type PmTask } from '../tasks';
import { ProjectNotesHint } from '../ProjectNotesHint';
import { useEmployeeOrder } from '../employeeOrder';
import { AutoTextarea, ProgressBar, StatusToggle } from './components';
import { employeeAccent, groupByEmployee, initials } from './utils';
import type { EntryStatus, FormEntry, NewTaskDraft } from './types';

// Shared column template so every manager's rows line up with each other
const ROW_GRID = 'xl:grid xl:grid-cols-[minmax(0,1.1fr)_15rem_minmax(0,1.5fr)_minmax(0,1fr)] xl:gap-4 xl:items-start';

export interface TaskState {
  tasksByProject: Map<string, PmTask[]>;
  newTasks: NewTaskDraft[];
  setNewTasks: Dispatch<SetStateAction<NewTaskDraft[]>>;
  taskToggles: Record<string, boolean>;
  toggleTask: (task: PmTask, done: boolean) => void;
}

// Enter in a project note jumps to the next project note; Shift+Enter adds a new line
function focusNextNote(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
  e.preventDefault();
  const notes = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea[data-meeting-note]'));
  const next = notes[notes.indexOf(e.currentTarget) + 1];
  if (next) { next.focus(); next.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

export function MeetingEntriesEditor({
  entries, onEntryChange, isReviewed, tasks, onQuickView, highlightProjectId,
}: {
  highlightProjectId?: string | null; // row whose project panel is open
  entries: FormEntry[];
  onEntryChange: (projectId: string, patch: { entryStatus?: EntryStatus; notes?: string }) => void;
  isReviewed: (entry: FormEntry) => boolean;
  tasks: TaskState;
  onQuickView: (projectId: string) => void;
}) {
  const { t } = useTranslation();
  const employeeOrder = useEmployeeOrder();
  const employees = usePmEmployees();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  // "Not reviewed only" keeps the rows that were unreviewed when it was switched on,
  // so a row doesn't vanish while someone is typing its note
  const [unreviewedSnapshot, setUnreviewedSnapshot] = useState<Set<string> | null>(null);

  const groups = useMemo(() => groupByEmployee(entries, employeeOrder), [entries, employeeOrder]);

  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleUnreviewedFilter() {
    setUnreviewedSnapshot(prev => prev ? null : new Set(entries.filter(e => !isReviewed(e)).map(e => e.projectId)));
  }

  const allCollapsed = groups.length > 0 && groups.every(g => collapsed.has(g.key));

  function renderTasks(entry: FormEntry) {
    const existing = tasks.tasksByProject.get(entry.projectId) ?? [];
    const drafts = tasks.newTasks.filter(d => d.projectId === entry.projectId);
    const adding = addingTaskFor === entry.projectId;
    if (existing.length === 0 && drafts.length === 0 && !adding) return null;
    return (
      <div className="mt-2 ml-7 rounded-md border border-dashed bg-muted/20 px-3 py-1.5 space-y-0.5">
        {existing.map(task => (
          <TaskLine
            key={task.id}
            title={task.title}
            assigneeName={task.assigneeName}
            dueDate={task.dueDate}
            completedAt={task.completedAt}
            done={tasks.taskToggles[task.id] ?? task.status === 'done'}
            onToggle={done => tasks.toggleTask(task, done)}
            meta={task.meetingDate && <span className="text-muted-foreground shrink-0">{t('pm.tasks.fromMeeting', { date: formatDate(task.meetingDate) })}</span>}
          />
        ))}
        {drafts.map(d => (
          <TaskLine
            key={d.key}
            title={d.title}
            assigneeName={employees.find(u => u.id === d.assigneeId)?.name ?? null}
            dueDate={d.dueDate}
            done={false}
            meta={<Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{t('pm.tasks.createdHere')}</Badge>}
          >
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" title={t('common.delete')}
              onClick={() => tasks.setNewTasks(prev => prev.filter(x => x.key !== d.key))}>
              <X className="h-3 w-3" />
            </Button>
          </TaskLine>
        ))}
        {adding && (
          <div className="py-1">
            <TaskForm
              autoFocus
              defaultAssigneeId={entry.employeeId}
              onAdd={draft => tasks.setNewTasks(prev => [...prev, { ...draft, projectId: entry.projectId, key: crypto.randomUUID() }])}
              onCancel={() => setAddingTaskFor(null)}
            />
          </div>
        )}
      </div>
    );
  }

  function renderRow(entry: FormEntry) {
    const reviewed = isReviewed(entry);
    return (
      <div key={entry.projectId} className={cn(
        'px-4 py-3 transition-colors',
        highlightProjectId === entry.projectId
          ? 'bg-primary/[0.06] shadow-[inset_3px_0_0_hsl(var(--primary))]'
          : reviewed ? 'bg-transparent' : 'bg-amber-500/[0.03]',
      )}>
        <div className={cn('space-y-2 xl:space-y-0', ROW_GRID)}>
          {/* Project */}
          <div className="flex items-start gap-2 min-w-0">
            {reviewed
              ? <CircleCheck className="h-5 w-5 mt-0.5 shrink-0 text-emerald-500" />
              : <Circle className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground/40" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => onQuickView(entry.projectId)}
                  className="font-medium text-left leading-snug hover:underline underline-offset-2 break-words">
                  {entry.projectName}
                </button>
                <ProjectNotesHint notes={entry.projectNotes} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{entry.projectNumber}</span>
                <button type="button"
                  className="inline-flex items-center gap-0.5 rounded px-1 -mx-1 hover:bg-muted hover:text-foreground"
                  onClick={() => setAddingTaskFor(addingTaskFor === entry.projectId ? null : entry.projectId)}>
                  <Plus className="h-3 w-3" />{t('pm.tasks.add')}
                </button>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="pl-7 xl:pl-0 max-w-sm xl:max-w-none">
            <StatusToggle value={entry.entryStatus} onChange={v => onEntryChange(entry.projectId, { entryStatus: v })} />
          </div>

          {/* This meeting's note */}
          <div className="pl-7 xl:pl-0">
            <AutoTextarea
              placeholder={t('pm.meetings.notePlaceholder')}
              value={entry.notes}
              onChange={e => onEntryChange(entry.projectId, { notes: e.target.value })}
              onKeyDown={focusNextNote}
              data-meeting-note
            />
          </div>

          {/* Last meeting's note */}
          <div className="pl-7 xl:pl-0 text-xs min-w-0">
            <div className="xl:hidden text-muted-foreground font-medium mb-0.5">{t('pm.meetings.colLastMeeting')}</div>
            {entry.lastEntryNotes ? (
              <div className="group flex items-start gap-1">
                <p className="flex-1 min-w-0 italic text-muted-foreground whitespace-pre-wrap break-words pt-1">{entry.lastEntryNotes}</p>
                {!entry.notes.trim() && (
                  <Button type="button" variant="ghost" size="sm"
                    className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
                    title={t('pm.meetings.carryOverTitle')}
                    onClick={() => onEntryChange(entry.projectId, { notes: entry.lastEntryNotes! })}>
                    <Copy className="h-3 w-3 mr-1" />{t('pm.meetings.carryOver')}
                  </Button>
                )}
              </div>
            ) : <span className="text-muted-foreground">—</span>}
          </div>
        </div>
        {renderTasks(entry)}
      </div>
    );
  }

  const reviewedTotal = entries.filter(isReviewed).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-base font-semibold mr-auto">
          {t('pm.meetings.projectsSection')}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{t('pm.meetings.reviewedCount', { done: reviewedTotal, total: entries.length })}</span>
        </h2>
        <Button type="button" variant={unreviewedSnapshot ? 'secondary' : 'outline'} size="sm" className="h-8" onClick={toggleUnreviewedFilter}>
          <Filter className="h-3.5 w-3.5 mr-1.5" />{t('pm.meetings.showUnreviewed')}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8"
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map(g => g.key)))}>
          {allCollapsed
            ? <><ChevronsUpDown className="h-3.5 w-3.5 mr-1.5" />{t('pm.meetings.expandAll')}</>
            : <><ChevronsDownUp className="h-3.5 w-3.5 mr-1.5" />{t('pm.meetings.collapseAll')}</>}
        </Button>
      </div>

      {entries.length === 0 && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{t('pm.meetings.noActiveProjects')}</div>
      )}
      {unreviewedSnapshot && unreviewedSnapshot.size === 0 && (
        <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">{t('pm.meetings.allReviewed')}</div>
      )}

      {groups.map(group => {
        const visible = unreviewedSnapshot ? group.items.filter(e => unreviewedSnapshot.has(e.projectId)) : group.items;
        if (visible.length === 0) return null;
        const isCollapsed = collapsed.has(group.key);
        const done = group.items.filter(isReviewed).length;
        const accent = employeeAccent(group.employeeId, employeeOrder);
        const lastDate = group.items.map(e => e.lastMeetingDate).filter(Boolean).sort().at(-1);
        return (
          <section key={group.key} className="rounded-lg border bg-card overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className={cn('relative w-full flex items-center gap-3 px-4 py-2.5 text-left', accent.soft)}
            >
              <span className={cn('absolute inset-y-0 left-0 w-1', accent.bar)} />
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white', accent.bar)}>
                {initials(group.employeeName)}
              </span>
              <span className="font-semibold text-sm flex-1 min-w-0 truncate">{group.employeeName ?? t('pm.reports.unassigned')}</span>
              <span className="hidden sm:flex items-center gap-2 w-40">
                <ProgressBar value={done} max={group.items.length} />
              </span>
              <span className={cn('text-xs tabular-nums font-medium', done === group.items.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                {done}/{group.items.length}
              </span>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} />
            </button>
            {!isCollapsed && (
              <>
                <div className={cn('hidden px-4 py-1.5 border-y bg-muted/40 text-xs font-medium text-muted-foreground', ROW_GRID)}>
                  <div className="pl-7">{t('pm.meetings.colProject')}</div>
                  <div>{t('common.status')}</div>
                  <div>{t('pm.meetings.colNote')}</div>
                  <div>
                    {t('pm.meetings.colLastMeeting')}
                    {lastDate && <span className="ml-1.5 font-normal">· {formatDate(lastDate)}</span>}
                  </div>
                </div>
                <div className="divide-y">{visible.map(renderRow)}</div>
              </>
            )}
          </section>
        );
      })}

      <p className="text-xs text-muted-foreground">{t('pm.meetings.keyboardHint')}</p>
    </div>
  );
}
