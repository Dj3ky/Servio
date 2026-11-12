import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarDays, CheckCheck, ChevronDown, ChevronRight, CircleCheck, FolderKanban, History, ListChecks,
  MessageSquareText, Pause, Plus, Search, TriangleAlert, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCan } from '@/stores/permissionsStore';
import { localToday } from '../dates';
import { capitalize, daysSince, parseLocalDate, safeStorage } from '../meetings/utils';
import type { MeetingListItem, MeetingSummary } from '../meetings/types';

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - i);

function SummaryTile({ icon, label, value, hint, tone, to }: {
  icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone?: string; to?: string;
}) {
  const body = (
    <>
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground', tone)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight tabular-nums truncate">{value}</div>
        {hint && <div className="text-xs text-muted-foreground truncate">{hint}</div>}
      </div>
    </>
  );
  const className = 'flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm';
  return to
    ? <Link to={to} className={cn(className, 'hover:border-primary/40 transition-colors')}>{body}</Link>
    : <div className={className}>{body}</div>;
}

function Chip({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground', className)}>
      {icon}{children}
    </span>
  );
}

export default function MeetingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  // null = default state (only the most recent month expanded)
  const [expandedMonths, setExpandedMonths] = useState<Set<string> | null>(null);
  const today = localToday();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery<{ data: MeetingListItem[] }>({
    queryKey: ['pm-meetings', yearFilter, query],
    queryFn: () => api.get(`/pm/meetings?limit=100&year=${yearFilter}${query ? `&q=${encodeURIComponent(query)}` : ''}`),
  });

  const { data: summary } = useQuery<MeetingSummary>({
    queryKey: ['pm-meetings-summary', today],
    queryFn: () => api.get(`/pm/meetings/stats/summary?today=${today}`),
  });

  // An unsaved new meeting left in this browser
  const [hasDraft] = useState(() => !!safeStorage.get('pm-meeting-draft:new'));

  const meetings = data?.data ?? [];
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }), [i18n.language]);

  // Group meetings by month (YYYY-MM), preserving API order
  const meetingsByMonth = useMemo(() => {
    const groups: { key: string; label: string; meetings: MeetingListItem[] }[] = [];
    const seen = new Map<string, number>();
    for (const m of meetings) {
      const key = m.meetingDate.slice(0, 7);
      if (!seen.has(key)) {
        const label = parseLocalDate(`${key}-01`).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
        seen.set(key, groups.length);
        groups.push({ key, label: capitalize(label), meetings: [] });
      }
      groups[seen.get(key)!].meetings.push(m);
    }
    return groups;
  }, [meetings, i18n.language]);

  // While searching every month with a hit is open
  const openMonths = query
    ? new Set(meetingsByMonth.map(g => g.key))
    : expandedMonths ?? new Set(meetingsByMonth.slice(0, 1).map(g => g.key));

  function toggleMonth(key: string) {
    const next = new Set(openMonths);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpandedMonths(next);
  }

  const lastDays = summary?.lastMeetingDate ? daysSince(summary.lastMeetingDate, today) : null;

  function renderCard(m: MeetingListItem) {
    const date = parseLocalDate(m.meetingDate);
    const weekday = date.toLocaleDateString(i18n.language, { weekday: 'short' }).replace('.', '');
    const month = date.toLocaleDateString(i18n.language, { month: 'short' }).replace('.', '');
    const isToday = m.meetingDate.slice(0, 10) === today;
    return (
      <Link
        key={m.id}
        to={`/pm/meetings/${m.id}`}
        className="group flex gap-4 rounded-lg border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
      >
        <div className={cn(
          'flex w-14 shrink-0 flex-col items-center justify-center rounded-md border py-1.5 leading-none',
          isToday ? 'border-primary bg-primary text-primary-foreground' : 'bg-muted/40',
        )}>
          <span className={cn('text-[10px] font-semibold uppercase tracking-wide', isToday ? 'opacity-90' : 'text-muted-foreground')}>{weekday}</span>
          <span className="text-2xl font-bold tabular-nums my-0.5">{date.getDate()}</span>
          <span className={cn('text-[10px] uppercase tracking-wide', isToday ? 'opacity-90' : 'text-muted-foreground')}>{month}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold">
              {capitalize(date.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }))}
            </span>
            {m.createdByName && <span className="text-xs text-muted-foreground">· {m.createdByName}</span>}
          </div>
          {m.notes
            ? <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-line">{m.notes}</p>
            : <p className="text-sm text-muted-foreground/60 italic">{t('pm.meetings.noGeneralNotes')}</p>}
          <div className="flex flex-wrap gap-1.5">
            <Chip icon={<FolderKanban className="h-3 w-3" />}>{t('pm.meetings.chipProjects', { count: m.projectCount })}</Chip>
            {m.notedCount > 0 && <Chip icon={<MessageSquareText className="h-3 w-3" />}>{t('pm.meetings.chipNotes', { count: m.notedCount })}</Chip>}
            {m.completedCount > 0 && (
              <Chip icon={<CircleCheck className="h-3 w-3" />} className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                {t('pm.meetings.chipCompleted', { count: m.completedCount })}
              </Chip>
            )}
            {m.onHoldCount > 0 && (
              <Chip icon={<Pause className="h-3 w-3" />} className="bg-amber-500/10 text-amber-800 dark:text-amber-300">
                {t('pm.meetings.chipOnHold', { count: m.onHoldCount })}
              </Chip>
            )}
            {m.tasksCreated > 0 && <Chip icon={<Plus className="h-3 w-3" />}>{t('pm.meetings.chipTasksCreated', { count: m.tasksCreated })}</Chip>}
            {m.tasksClosed > 0 && <Chip icon={<CheckCheck className="h-3 w-3" />}>{t('pm.meetings.chipTasksClosed', { count: m.tasksClosed })}</Chip>}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 self-center shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t('pm.meetings.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pm.meetings.subtitle')}</p>
        </div>
        {can('projects', 'manage') && (
          <Button onClick={() => navigate('/pm/meetings/new')}><Plus className="h-4 w-4 mr-2" />{t('pm.meetings.new')}</Button>
        )}
      </div>

      {/* At a glance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryTile
          icon={<CalendarDays className="h-4 w-4" />}
          label={t('pm.meetings.lastMeeting')}
          value={lastDays === null ? '—' : capitalize(rtf.format(-lastDays, 'day'))}
          hint={summary?.lastMeetingDate ? capitalize(parseLocalDate(summary.lastMeetingDate).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })) : undefined}
          tone={lastDays !== null && lastDays > 10 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : undefined}
        />
        <SummaryTile icon={<FolderKanban className="h-4 w-4" />} label={t('pm.meetings.activeProjects')} value={summary?.activeProjects ?? '—'} to="/pm/projects" />
        <SummaryTile icon={<ListChecks className="h-4 w-4" />} label={t('pm.meetings.openTasks')} value={summary?.openTasks ?? '—'} to="/pm/tasks" />
        <SummaryTile
          icon={<TriangleAlert className="h-4 w-4" />}
          label={t('pm.meetings.overdueTasks')}
          value={summary?.overdueTasks ?? '—'}
          tone={summary?.overdueTasks ? 'bg-red-500/15 text-red-600 dark:text-red-400' : undefined}
          to="/pm/tasks"
        />
      </div>

      {hasDraft && can('projects', 'manage') && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm">
          <History className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="flex-1">{t('pm.meetings.draftPending')}</span>
          <Button size="sm" onClick={() => navigate('/pm/meetings/new')}>{t('pm.meetings.draftContinue')}</Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 pr-9" placeholder={t('pm.meetings.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch('')} title={t('common.reset')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={String(yearFilter)} onValueChange={v => { setYearFilter(Number(v)); setExpandedMonths(null); }}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {YEAR_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        {data && <span className="text-sm text-muted-foreground">{t('pm.meetings.meetingCount', { count: meetings.length })}</span>}
      </div>

      {/* Meetings by month */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <div key={i} className="h-28 rounded-lg border bg-muted/30 animate-pulse" />)}
        </div>
      )}
      {!isLoading && meetings.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{query ? t('pm.meetings.noSearchResults') : t('pm.meetings.noMeetingsYear', { year: yearFilter })}</p>
          {!query && can('projects', 'manage') && (
            <Button variant="outline" size="sm" onClick={() => navigate('/pm/meetings/new')}><Plus className="h-4 w-4 mr-1.5" />{t('pm.meetings.new')}</Button>
          )}
        </div>
      )}

      <div className="space-y-5">
        {meetingsByMonth.map(group => {
          const open = openMonths.has(group.key);
          return (
            <section key={group.key} className="space-y-2.5">
              <button type="button" onClick={() => toggleMonth(group.key)}
                className="flex w-full items-center gap-2 text-left text-sm font-semibold text-muted-foreground hover:text-foreground">
                <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} />
                <span className="text-foreground">{group.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{group.meetings.length}</span>
                <span className="h-px flex-1 bg-border" />
              </button>
              {open && <div className="space-y-2.5">{group.meetings.map(renderCard)}</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
