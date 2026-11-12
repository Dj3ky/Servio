import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Building2, CalendarRange, Check, ExternalLink, ListChecks, MessagesSquare, StickyNote, Wallet, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { localToday } from '../dates';
import { TaskLine, type PmTask } from '../tasks';
import { useEmployeeOrder } from '../employeeOrder';
import { ProgressBar, StatusBadge } from './components';
import { daysSince, employeeAccent, initials } from './utils';

interface QuickProject {
  id: string; projectNumber: string; name: string; orderDate: string | null;
  priority: string; status: string; startDate: string | null; endDate: string | null; completedAt: string | null;
  contractValue: string | null; invoicedAmount: string | null; receivedAmount: string | null; notes: string | null;
  employeeId: string | null; employeeName: string | null; customerName: string | null; facilityName: string | null;
  phases: { id: string; name: string; status: string }[];
  documents: { id: string }[];
}
interface HistoryEntry { id: string; entryStatus: string; notes: string | null; meetingId: string; meetingDate: string }

const PRIORITY_CLASS: Record<string, string> = {
  high: 'bg-red-500/10 text-red-700 dark:text-red-300 border-transparent',
  medium: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-transparent',
  low: 'bg-muted text-muted-foreground border-transparent',
};

const money = (v: string | null | undefined) =>
  v == null || v === '' ? '—' : new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v));

function Section({ icon, title, aside, children }: { icon: ReactNode; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}<span className="flex-1">{title}</span>{aside}
      </div>
      {children}
    </section>
  );
}

// Timeline: elapsed share of start → end, with days left or overdue
function Timeline({ project }: { project: QuickProject }) {
  const { t } = useTranslation();
  const today = localToday();
  const { startDate: start, endDate: end } = project;
  if (!start && !end) return <p className="text-sm text-muted-foreground">{t('pm.quickView.noDates')}</p>;

  const done = project.status === 'completed';
  let label: ReactNode = null;
  let pct = 0;
  let late = false;
  if (done) {
    pct = 100;
    label = project.completedAt ? t('pm.tasks.completedOn', { date: formatDate(project.completedAt) }) : t('pm.status.completed');
  } else if (start && today < start.slice(0, 10)) {
    label = t('pm.quickView.notStarted');
  } else if (end) {
    const left = -daysSince(end, today);
    late = left < 0;
    label = left === 0 ? t('pm.quickView.endsToday') : late ? t('pm.quickView.overdueBy', { count: -left }) : t('pm.quickView.daysLeft', { count: left });
    if (start) {
      const total = Math.max(1, daysSince(start, end));
      pct = Math.min(100, Math.max(0, Math.round((daysSince(start, today) / total) * 100)));
    } else pct = late ? 100 : 0;
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums">{start ? formatDate(start) : '—'}</span>
        <span className="h-px flex-1 mx-3 bg-border" />
        <span className="tabular-nums">{end ? formatDate(end) : '—'}</span>
      </div>
      <ProgressBar value={pct} max={100} className="h-2" barClassName={late ? 'bg-red-500' : done ? 'bg-emerald-500' : undefined} />
      {label && (
        <p className={cn('text-xs font-medium', late ? 'text-red-600 dark:text-red-400' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
          {label}
        </p>
      )}
    </div>
  );
}

// Side panel with a project summary, opened from a project name in the meeting form.
// Non-modal: the form stays usable, and clicking another project name swaps the content.
export function ProjectQuickView({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const employeeOrder = useEmployeeOrder();
  const [notesExpanded, setNotesExpanded] = useState(false);
  useEffect(() => setNotesExpanded(false), [projectId]);

  const { data: project, isLoading } = useQuery<QuickProject>({
    queryKey: ['pm-project', projectId],
    queryFn: () => api.get(`/pm/projects/${projectId}`),
    enabled: !!projectId,
  });
  const { data: tasks } = useQuery<PmTask[]>({
    queryKey: ['pm-project-tasks', projectId],
    queryFn: () => api.get(`/pm/projects/${projectId}/tasks`),
    enabled: !!projectId,
  });
  const { data: history } = useQuery<HistoryEntry[]>({
    queryKey: ['pm-project-meetings', projectId],
    queryFn: () => api.get(`/pm/reports/project/${projectId}/meetings`),
    enabled: !!projectId,
  });

  const openTasks = (tasks ?? []).filter(task => task.status === 'open');
  const recent = (history ?? []).slice(0, 4);
  const contract = Number(project?.contractValue ?? 0);
  const invoiced = Number(project?.invoicedAmount ?? 0);
  const invoicedPct = contract > 0 ? Math.round((invoiced / contract) * 100) : null;
  const accent = employeeAccent(project?.employeeId ?? null, employeeOrder);
  const longNotes = (project?.notes?.length ?? 0) > 280;

  return (
    <DialogPrimitive.Root open={!!projectId} onOpenChange={o => { if (!o) onClose(); }} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onInteractOutside={e => e.preventDefault()}
          onOpenAutoFocus={e => e.preventDefault()}
          className="fixed inset-y-0 right-0 z-50 flex w-full sm:w-[440px] flex-col border-l bg-background shadow-2xl outline-none data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right"
        >
          {/* Header */}
          <div className="border-b px-5 pt-5 pb-4 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex flex-wrap items-center gap-1.5 flex-1">
                {project && (
                  <>
                    <span className="font-mono text-xs text-muted-foreground mr-1">{project.projectNumber}</span>
                    <StatusBadge status={project.status} />
                    <Badge variant="outline" className={cn('text-xs font-medium', PRIORITY_CLASS[project.priority])}>{t(`pm.priority.${project.priority}`)}</Badge>
                  </>
                )}
              </div>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-1 shrink-0" title={t('common.close')}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Title className="text-xl font-semibold leading-snug break-words">
              {project?.name ?? (isLoading ? <span className="block h-6 w-2/3 rounded bg-muted animate-pulse" /> : '—')}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description asChild>
              <div className="space-y-2">
                {(project?.customerName || project?.facilityName) && (
                  <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{[project.customerName, project.facilityName].filter(Boolean).join(' · ')}</span>
                  </p>
                )}
                {project && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white', accent.bar)}>
                      {initials(project.employeeName)}
                    </span>
                    <span>{project.employeeName ?? t('pm.reports.unassigned')}</span>
                  </div>
                )}
              </div>
            </DialogPrimitive.Description>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            {isLoading && [0, 1, 2].map(i => <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />)}

            {project && (
              <>
                <Section icon={<CalendarRange className="h-3.5 w-3.5" />} title={t('pm.quickView.timeline')}>
                  <Timeline project={project} />
                </Section>

                <Section icon={<Wallet className="h-3.5 w-3.5" />} title={t('pm.quickView.finances')}>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      [t('pm.projects.fieldContractValue'), money(project.contractValue)],
                      [t('pm.projects.fieldInvoiced'), money(project.invoicedAmount)],
                      [t('pm.quickView.received'), money(project.receivedAmount)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border p-2.5 min-w-0">
                        <div className="text-[11px] text-muted-foreground truncate">{label}</div>
                        <div className="text-sm font-semibold tabular-nums truncate" title={value}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {invoicedPct !== null && (
                    <div className="space-y-1">
                      <ProgressBar value={Math.min(invoicedPct, 100)} max={100} />
                      <p className="text-xs text-muted-foreground">{invoicedPct} {t('pm.projects.invoicedPct')}</p>
                    </div>
                  )}
                </Section>

                {project.phases.length > 0 && (
                  <Section icon={<Check className="h-3.5 w-3.5" />} title={t('pm.phases.tab')}
                    aside={<span className="normal-case font-normal tabular-nums">{project.phases.filter(p => p.status === 'completed').length}/{project.phases.length}</span>}>
                    <ol className="flex flex-wrap gap-1.5">
                      {project.phases.map((phase, i) => (
                        <li key={phase.id} className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                          phase.status === 'completed' && 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                          phase.status === 'in_progress' && 'border-primary/40 bg-primary/10 text-foreground font-medium',
                          phase.status === 'pending' && 'text-muted-foreground',
                        )}>
                          {phase.status === 'completed' ? <Check className="h-3 w-3" /> : <span className="tabular-nums opacity-70">{i + 1}</span>}
                          {phase.name}
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}

                <Section icon={<ListChecks className="h-3.5 w-3.5" />} title={t('pm.meetings.openTasks')}
                  aside={openTasks.length > 0 && <span className="normal-case font-normal tabular-nums">{openTasks.length}</span>}>
                  {openTasks.length === 0
                    ? <p className="text-sm text-muted-foreground">{t('pm.tasks.noneOpen')}</p>
                    : <div className="rounded-lg border px-3 py-1.5">
                        {openTasks.map(task => (
                          <TaskLine key={task.id} title={task.title} assigneeName={task.assigneeName} dueDate={task.dueDate} done={false} />
                        ))}
                      </div>}
                </Section>

                <Section icon={<MessagesSquare className="h-3.5 w-3.5" />} title={t('pm.quickView.recentMeetings')}>
                  {recent.length === 0
                    ? <p className="text-sm text-muted-foreground">{t('pm.quickView.noMeetings')}</p>
                    : (
                      <ol className="relative space-y-3 border-l pl-4 ml-1">
                        {recent.map(entry => (
                          <li key={entry.id} className="relative">
                            <span className={cn(
                              'absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background',
                              entry.entryStatus === 'completed' ? 'bg-emerald-500' : entry.entryStatus === 'on_hold' ? 'bg-amber-500' : 'bg-primary',
                            )} />
                            <div className="flex items-center gap-2">
                              <a href={`/pm/meetings/${entry.meetingId}`} target="_blank" rel="noopener"
                                className="text-xs font-medium tabular-nums hover:underline underline-offset-2">
                                {formatDate(entry.meetingDate)}
                              </a>
                              {entry.entryStatus !== 'active' && <StatusBadge status={entry.entryStatus} className="text-[10px] px-1.5 py-0" />}
                            </div>
                            <p className={cn('text-sm whitespace-pre-wrap break-words', !entry.notes && 'text-muted-foreground')}>{entry.notes || '—'}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                </Section>

                {project.notes && (
                  <Section icon={<StickyNote className="h-3.5 w-3.5" />} title={t('pm.projects.fieldNotes')}>
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                      <p className={cn('text-sm whitespace-pre-wrap break-words', longNotes && !notesExpanded && 'line-clamp-6')}>{project.notes}</p>
                      {longNotes && (
                        <button type="button" className="mt-1 text-xs font-medium text-primary hover:underline" onClick={() => setNotesExpanded(v => !v)}>
                          {notesExpanded ? t('pm.projects.showLess') : t('pm.projects.showMore')}
                        </button>
                      )}
                    </div>
                  </Section>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {project && (
            <div className="border-t px-5 py-3 flex items-center gap-2">
              {project.documents.length > 0 && (
                <span className="text-xs text-muted-foreground mr-auto">{t('pm.quickView.documents', { count: project.documents.length })}</span>
              )}
              {/* New tab so unsaved meeting edits underneath aren't lost */}
              <Button className="ml-auto" onClick={() => window.open(`/pm/projects/${project.id}`, '_blank', 'noopener')}>
                {t('pm.meetings.openProject')}<ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
