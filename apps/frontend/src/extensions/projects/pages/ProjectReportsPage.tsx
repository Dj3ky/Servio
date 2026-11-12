import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, BarChart3, Building2, ChevronDown, ChevronRight, Clock, Download, PieChart as PieChartIcon,
  Printer, ReceiptText, Users, X,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEmployeeOrder, sortByEmployeeOrder } from '../employeeOrder';
import { isPastDue, localToday } from '../dates';
import { useNameSuggestions } from '../nameSuggestions';
import { daysSince } from '../meetings/utils';
import { StatusBadge } from '../meetings/components';
import { ProjectQuickView } from '../meetings/ProjectQuickView';
import { csvDate, csvMoney, downloadCsv, eur, eurShort, monthName, num, pct, type CsvCell } from '../reports/format';
import {
  Avatar, KpiTile, Legend, Meter, Person, SeverityBadge, SortTh, Sparkline, TableSkeleton, useSort, type Severity,
} from '../reports/parts';
import { printProjectReport } from '../reports/printReport';
import type {
  CompletionsRow, CustomerRow, OutstandingProject, OverdueProject, PipelineRow, RevenueTrendRow, SummaryData, WorkloadGroup,
} from '../reports/types';

const TABS = ['revenue', 'outstanding', 'overdue', 'workload', 'customers', 'status'] as const;
type Tab = typeof TABS[number];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - i);

const PREV_YEAR_COLOR = '#f97316';
const STATUS_COLORS: Record<string, string> = { active: 'hsl(var(--primary))', on_hold: '#f59e0b' };

const chartTooltip = {
  contentStyle: {
    borderRadius: '8px',
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--popover))',
    fontSize: 12,
  },
  labelStyle: { color: 'hsl(var(--popover-foreground))', fontWeight: 600 },
};

const ageSeverity = (days: number): Severity => (days > 90 ? 'high' : days > 30 ? 'medium' : 'low');
const lateSeverity = (days: number): Severity => (days > 60 ? 'high' : days > 30 ? 'medium' : 'low');

type AgeBucket = 'recent' | 'mid' | 'old';
const ageBucket = (days: number): AgeBucket => (days > 90 ? 'old' : days > 30 ? 'mid' : 'recent');

function Panel({ title, note, aside, children, className }: {
  title: string; note?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-5 flex flex-col gap-4 min-w-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ProjectCell({ id, name, number, onOpen }: { id: string; name: string; number: string; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="text-left group" onClick={e => { e.stopPropagation(); onOpen(id); }}>
      <div className="font-medium group-hover:underline underline-offset-2">{name}</div>
      <div className="text-xs text-muted-foreground font-mono">{number}</div>
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

export default function ProjectReportsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = localToday();
  const employeeOrder = useEmployeeOrder();

  // Tab, year and customer live in the URL, so a filtered view can be bookmarked or sent on
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'revenue';
  const year = Number(params.get('year')) || currentYear;
  const customer = params.get('customer') ?? '';

  function setParam(key: string, value: string | null) {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }
  const setTab = (v: string) => setParam('tab', v === 'revenue' ? null : v);
  const setYear = (v: number) => setParam('year', v === currentYear ? null : String(v));
  const setCustomer = (v: string) => setParam('customer', v || null);

  const [quickId, setQuickId] = useState<string | null>(null);
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set());
  const [agingFilter, setAgingFilter] = useState<AgeBucket | null>(null);

  // Customer filter: what is typed, and the applied customer (only set once the text matches a known customer)
  const [customerInput, setCustomerInput] = useState(customer);
  useEffect(() => { setCustomerInput(customer); }, [customer]);

  const suggestions = useNameSuggestions();
  // One entry per customer, ignoring case / spaces like the backend does
  const customerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const name of suggestions?.customers ?? []) {
      const key = name.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, name.trim());
    }
    return [...seen.values()];
  }, [suggestions]);

  function changeCustomerInput(value: string) {
    setCustomerInput(value);
    if (!value.trim()) { setCustomer(''); return; }
    const match = customerOptions.find(c => c.toLowerCase() === value.trim().toLowerCase());
    if (match) setCustomer(match);
  }

  // Adds the customer filter to a report URL
  const withCustomer = (url: string) =>
    customer ? `${url}${url.includes('?') ? '&' : '?'}customer=${encodeURIComponent(customer)}` : url;

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: summary, isLoading: loadingSummary } = useQuery<SummaryData>({
    queryKey: ['pm-report', 'summary', customer],
    queryFn: () => api.get(withCustomer('/pm/reports/summary')),
  });
  const { data: workload, isLoading: loadingWorkload } = useQuery<WorkloadGroup[]>({
    queryKey: ['pm-report', 'workload', customer],
    queryFn: () => api.get(withCustomer('/pm/reports/workload')),
  });
  const { data: overdue, isLoading: loadingOverdue } = useQuery<OverdueProject[]>({
    queryKey: ['pm-report', 'overdue', customer],
    queryFn: () => api.get(withCustomer('/pm/reports/overdue')),
  });
  const { data: revenueTrend, isLoading: loadingRevenue } = useQuery<RevenueTrendRow[]>({
    queryKey: ['pm-report', 'revenue-trend', year, customer],
    queryFn: () => api.get(withCustomer(`/pm/reports/revenue-trend?year=${year}`)),
  });
  const { data: completions, isLoading: loadingCompletions } = useQuery<CompletionsRow[]>({
    queryKey: ['pm-report', 'completions', year, customer],
    queryFn: () => api.get(withCustomer(`/pm/reports/completions?year=${year}`)),
  });
  const { data: outstanding, isLoading: loadingOutstanding } = useQuery<OutstandingProject[]>({
    queryKey: ['pm-report', 'outstanding', customer],
    queryFn: () => api.get(withCustomer('/pm/reports/outstanding')),
  });
  const { data: pipeline, isLoading: loadingPipeline } = useQuery<PipelineRow[]>({
    queryKey: ['pm-report', 'pipeline', customer],
    queryFn: () => api.get(withCustomer('/pm/reports/pipeline')),
  });
  // Not filtered: it is the list of customers to choose from
  const { data: byCustomer, isLoading: loadingByCustomer } = useQuery<CustomerRow[]>({
    queryKey: ['pm-report', 'by-customer'],
    queryFn: () => api.get('/pm/reports/by-customer'),
  });

  // ── Derived numbers ─────────────────────────────────────────────────────────

  const openStatuses = (summary?.statusCounts ?? []).filter(s => s.status !== 'completed');
  const openCount = openStatuses.reduce((s, r) => s + Number(r.count), 0);
  const completedOverall = Number(summary?.statusCounts.find(s => s.status === 'completed')?.count ?? 0);
  const totalValue = num(summary?.totals.totalContractValue);
  const totalInvoiced = num(summary?.totals.totalInvoiced);
  const totalRemaining = num(summary?.totals.totalRemaining);

  // Compare like with like: for the current year only the months so far
  const monthsSoFar = year === currentYear ? new Date().getMonth() + 1 : 12;
  const trend = revenueTrend ?? [];
  const totalRevenue = trend.reduce((s, r) => s + r.revenue, 0);
  const revenueSoFar = trend.slice(0, monthsSoFar).reduce((s, r) => s + r.revenue, 0);
  const prevSoFar = trend.slice(0, monthsSoFar).reduce((s, r) => s + r.prevRevenue, 0);
  const yoy = prevSoFar > 0 ? ((revenueSoFar - prevSoFar) / prevSoFar) * 100 : null;
  const bestMonth = trend.reduce<RevenueTrendRow | null>((best, r) => (r.revenue > (best?.revenue ?? 0) ? r : best), null);
  const monthlyAverage = monthsSoFar > 0 ? revenueSoFar / monthsSoFar : 0;
  const completedInYear = (completions ?? []).reduce((s, c) => s + c.count, 0);
  const fmtPct = (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

  const revenueChart = trend.map(r => ({ ...r, label: monthName(r.month, lang) }));
  const completionsChart = (completions ?? []).map(c => ({ ...c, label: monthName(c.month, lang) }));

  const outstandingRows = useMemo(() => (outstanding ?? []).map(p => {
    const age = p.completedAt ? Math.max(0, daysSince(p.completedAt.slice(0, 10), today)) : 0;
    const value = num(p.contractValue);
    const invoiced = num(p.invoicedAmount);
    return { ...p, age, value, invoiced, gap: value - invoiced, bucket: ageBucket(age) };
  }), [outstanding, today]);
  const totalOutstanding = outstandingRows.reduce((s, p) => s + p.gap, 0);
  const agingTotals = (['recent', 'mid', 'old'] as const).map(bucket => {
    const rows = outstandingRows.filter(r => r.bucket === bucket);
    return { bucket, count: rows.length, amount: rows.reduce((s, r) => s + r.gap, 0) };
  });
  const oldOutstanding = agingTotals[2].amount;
  const visibleOutstanding = agingFilter ? outstandingRows.filter(r => r.bucket === agingFilter) : outstandingRows;

  const overdueRows = useMemo(() => (overdue ?? []).map(p => ({
    ...p,
    late: p.endDate ? daysSince(p.endDate, today) : 0,
    remaining: num(p.contractValue) - num(p.invoicedAmount),
  })), [overdue, today]);

  const pastDeadlineRemaining = pipeline?.find(p => p.bucket === 'overdue')?.remaining ?? 0;
  const pipelineMax = Math.max(...(pipeline ?? []).map(p => p.remaining), 0) || 1;

  const managers = useMemo(() => sortByEmployeeOrder(workload ?? [], employeeOrder).map(g => {
    const value = g.projects.reduce((s, p) => s + num(p.contractValue), 0);
    const invoiced = g.projects.reduce((s, p) => s + num(p.invoicedAmount), 0);
    return {
      ...g,
      key: g.employeeId ?? '__unassigned__',
      value, invoiced, remaining: value - invoiced,
      overdueCount: g.projects.filter(p => isPastDue(p.endDate)).length,
    };
  }), [workload, employeeOrder]);
  const managerMax = Math.max(...managers.map(m => m.value), 0) || 1;

  const customerMax = Math.max(...(byCustomer ?? []).map(c => num(c.contractValue)), 0) || 1;

  // ── Sorting ─────────────────────────────────────────────────────────────────

  const outSort = useSort(visibleOutstanding, {
    name: r => r.name, customer: r => r.customerName ?? '', manager: r => r.employeeName ?? '',
    age: r => r.age, invoicedPct: r => pct(r.invoiced, r.value), gap: r => r.gap,
  }, 'gap');
  const lateSort = useSort(overdueRows, {
    name: r => r.name, customer: r => r.customerName ?? '', manager: r => r.employeeName ?? '',
    late: r => r.late, remaining: r => r.remaining,
  }, 'late');
  const custSort = useSort(byCustomer ?? [], {
    name: r => r.customerName ?? '', active: r => r.activeCount, completed: r => r.completedCount,
    value: r => num(r.contractValue), remaining: r => num(r.remainingActive), unbilled: r => num(r.unbilledCompleted),
  }, 'value');

  // ── Actions ─────────────────────────────────────────────────────────────────

  function toggleManager(key: string) {
    setExpandedManagers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function exportCsv() {
    const r = (k: string) => t(`pm.reports.${k}`);
    let header: string[] = [];
    let rows: CsvCell[][] = [];
    switch (tab) {
      case 'revenue':
        header = [r('colMonth'), `${r('invoiced')} ${year}`, `${r('invoiced')} ${year - 1}`, r('colInvoiceCount'), r('completions')];
        rows = trend.map((m, i) => [monthName(m.month, lang), csvMoney(m.revenue), csvMoney(m.prevRevenue), m.invoiceCount, completions?.[i]?.count ?? 0]);
        break;
      case 'outstanding':
        header = [r('colNumber'), r('colName'), r('colCustomer'), r('colEmployee'), r('colCompletedAt'), r('colDaysSince'), r('colValue'), r('colInvoiced'), r('colOutstanding')];
        rows = outSort.sorted.map(p => [p.projectNumber, p.name, p.customerName, p.employeeName, csvDate(p.completedAt), p.age, csvMoney(p.value), csvMoney(p.invoiced), csvMoney(p.gap)]);
        break;
      case 'workload':
        header = [r('colEmployee'), r('colNumber'), r('colName'), r('colCustomer'), r('colStatus'), r('colPriority'), r('colDeadline'), r('colValue'), r('colInvoiced'), r('colRemaining')];
        rows = managers.flatMap(m => m.projects.map(p => [
          m.employeeName ?? r('unassigned'), p.projectNumber, p.name, p.customerName, t(`pm.status.${p.status}`), t(`pm.priority.${p.priority}`),
          csvDate(p.endDate), csvMoney(p.contractValue), csvMoney(p.invoicedAmount), csvMoney(num(p.contractValue) - num(p.invoicedAmount)),
        ]));
        break;
      case 'status':
        header = [r('colStatus'), r('colProjectCount')];
        rows = (summary?.statusCounts ?? []).map(s => [t(`pm.status.${s.status}`, { defaultValue: s.status }), s.count]);
        break;
      case 'overdue':
        header = [r('colNumber'), r('colName'), r('colCustomer'), r('colEmployee'), r('colDeadline'), r('colLate'), r('colRemaining')];
        rows = lateSort.sorted.map(p => [p.projectNumber, p.name, p.customerName, p.employeeName, csvDate(p.endDate), p.late, csvMoney(p.remaining)]);
        break;
      case 'customers':
        header = [r('colCustomer'), r('colActive'), r('colCompleted'), r('colTotalValue'), r('colInvoiced'), r('colRemaining'), r('colOutstanding')];
        rows = custSort.sorted.map(c => [c.customerName ?? r('noCustomer'), c.activeCount, c.completedCount, csvMoney(c.contractValue), csvMoney(c.invoiced), csvMoney(c.remainingActive), csvMoney(c.unbilledCompleted)]);
        break;
    }
    const suffix = customer ? `-${customer.replace(/[^\p{L}\p{N}]+/gu, '_')}` : '';
    downloadCsv(`${t('pm.reports.csvFilename')}-${tab}-${year}${suffix}.csv`, header, rows);
  }

  function print() {
    void printProjectReport({ year, customer, lang, summary, revenueTrend, completions, outstanding, employeeOrder, withCustomer });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('pm.reports.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pm.reports.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]" aria-label={t('pm.reports.year')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />{t('pm.reports.exportCsv')}
          </Button>
          <Button onClick={print}>
            <Printer className="h-4 w-4 mr-2" />{t('pm.reports.printReport')} {year}
          </Button>
        </div>
      </div>

      {/* Customer filter — applies to everything below and to the printed report */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="w-[320px] max-w-full pl-9"
            list="pm-report-customers"
            autoComplete="off"
            aria-label={t('pm.reports.colCustomer')}
            placeholder={t('pm.reports.allCustomers')}
            value={customerInput}
            onChange={e => changeCustomerInput(e.target.value)}
          />
        </div>
        <datalist id="pm-report-customers">
          {customerOptions.map(name => <option key={name} value={name} />)}
        </datalist>
        {customer && (
          <Badge variant="secondary" className="gap-1 pr-1">
            {t('pm.reports.showingFor', { customer })}
            <button type="button" className="rounded-sm hover:bg-muted p-0.5" onClick={() => setCustomer('')} title={t('pm.reports.clearFilter')}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {!customer && customerInput.trim() && (
          <span className="text-xs text-muted-foreground">{t('pm.reports.pickCustomer')}</span>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile
          label={t('pm.reports.kpiOpenValue')}
          value={eur(totalValue)}
          loading={loadingSummary}
          foot={t('pm.reports.openProjects', { count: openCount })}
        >
          {/* Split of open projects by status */}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {openStatuses.map(s => (
              <div key={s.status} title={`${t(`pm.status.${s.status}`, { defaultValue: s.status })}: ${s.count}`}
                style={{ width: `${pct(Number(s.count), openCount)}%`, background: STATUS_COLORS[s.status] ?? '#94a3b8' }} />
            ))}
          </div>
        </KpiTile>
        <KpiTile
          label={t('pm.reports.totalInvoiced')}
          value={eur(totalInvoiced)}
          tone="primary"
          loading={loadingSummary}
          delta={totalValue > 0 ? `${pct(totalInvoiced, totalValue)} %` : null}
          foot={t('pm.reports.kpiInvoicedPct', { pct: pct(totalInvoiced, totalValue) })}
        >
          <Meter value={pct(totalInvoiced, totalValue)} className="h-2" />
        </KpiTile>
        <KpiTile
          label={t('pm.reports.totalRemaining')}
          value={eur(totalRemaining)}
          tone="success"
          loading={loadingSummary}
          deltaTone={pastDeadlineRemaining > 0 ? 'danger' : 'neutral'}
          delta={pastDeadlineRemaining > 0 ? t('pm.reports.overdueCount', { count: overdueRows.length }) : null}
          foot={pastDeadlineRemaining > 0
            ? t('pm.reports.kpiPastDeadline', { amount: eur(pastDeadlineRemaining) })
            : t('pm.reports.kpiNothingPastDeadline')}
        >
          <Meter value={pct(pastDeadlineRemaining, totalRemaining)} className="h-2" barClassName="bg-red-500" />
        </KpiTile>
        <KpiTile
          label={t('pm.reports.kpiRevenue', { year })}
          value={eur(totalRevenue)}
          loading={loadingRevenue}
          delta={yoy !== null ? fmtPct(yoy) : null}
          deltaTone={yoy === null ? 'neutral' : yoy >= 0 ? 'up' : 'down'}
          foot={prevSoFar > 0
            ? t('pm.reports.kpiSamePeriod', { year: year - 1, amount: eur(prevSoFar) })
            : t('pm.reports.kpiNoPrevData', { year: year - 1 })}
        >
          <Sparkline values={trend.slice(0, monthsSoFar).map(r => r.revenue)} highlight={monthsSoFar - 1} />
        </KpiTile>
        <KpiTile
          label={t('pm.reports.kpiUnbilled')}
          value={eur(totalOutstanding)}
          tone={totalOutstanding > 0 ? 'danger' : 'default'}
          loading={loadingOutstanding}
          delta={outstandingRows.length > 0 ? t('pm.reports.projectsCount', { count: outstandingRows.length }) : null}
          deltaTone="danger"
          foot={oldOutstanding > 0
            ? t('pm.reports.kpiUnbilledOld', { amount: eur(oldOutstanding) })
            : t('pm.reports.kpiUnbilledNone')}
        >
          {/* Split by age: grey recent, orange 31–90, red older */}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {agingTotals.map(a => (
              <div key={a.bucket} style={{ width: `${pct(a.amount, totalOutstanding)}%` }}
                className={a.bucket === 'old' ? 'bg-red-500' : a.bucket === 'mid' ? 'bg-orange-400' : 'bg-slate-400'} />
            ))}
          </div>
        </KpiTile>
      </div>

      {/* Completed work left unbilled for over 90 days is easy to forget */}
      {tab !== 'outstanding' && oldOutstanding > 0 && (
        <button
          type="button"
          onClick={() => { setAgingFilter('old'); setTab('outstanding'); }}
          className="flex w-full items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-left text-sm hover:bg-destructive/15"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <span>{t('pm.reports.oldUnbilledHint', { amount: eur(oldOutstanding), count: agingTotals[2].count })}</span>
        </button>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        {/* Underline tabs; one scrolling row on narrow screens instead of wrapping */}
        <div className="-mx-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="h-auto w-full min-w-max justify-start gap-1 rounded-none border-b bg-transparent p-0">
            {([
              { value: 'revenue', label: t('pm.reports.tabRevenue'), icon: BarChart3 },
              { value: 'outstanding', label: t('pm.reports.tabOutstanding'), icon: ReceiptText, count: loadingOutstanding ? null : outstandingRows.length },
              { value: 'overdue', label: t('pm.reports.tabOverdue'), icon: Clock, count: loadingOverdue ? null : overdueRows.length },
              { value: 'workload', label: t('pm.reports.tabWorkload'), icon: Users },
              { value: 'customers', label: t('pm.reports.tabCustomers'), icon: Building2 },
              { value: 'status', label: t('pm.reports.tabStatus'), icon: PieChartIcon },
            ] satisfies { value: Tab; label: string; icon: typeof Clock; count?: number | null }[]).map(item => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="group relative -mb-px h-11 gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 text-muted-foreground shadow-none hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <item.icon className="h-4 w-4 opacity-70 group-data-[state=active]:opacity-100 group-data-[state=active]:text-primary" />
                {item.label}
                {'count' in item && item.count != null && (
                  <span className={cn(
                    'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    item.count > 0 ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-muted text-muted-foreground',
                  )}>{item.count}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Revenue ─────────────────────────────────────────────────────── */}
        <TabsContent value="revenue" className="mt-4">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title={t('pm.reports.monthlyRevenue')}
              note={t('pm.reports.revenueVsPrev', { year, prev: year - 1 })}
              aside={<Legend items={[
                { label: String(year), swatch: 'bg-primary' },
                { label: String(year - 1), swatch: 'bg-orange-500' },
              ]} />}
            >
              {loadingRevenue ? <Skeleton className="h-[240px] w-full" /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={revenueChart} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={eurShort} />
                    <Tooltip
                      {...chartTooltip}
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                      formatter={(value: number, name: string, item: any) => [
                        name === 'revenue'
                          ? `${eur(value)} (${t('pm.reports.invoiceCount', { count: item.payload?.invoiceCount ?? 0 })})`
                          : eur(value),
                        name === 'revenue' ? String(year) : String(year - 1),
                      ]}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    <Line dataKey="prevRevenue" stroke={PREV_YEAR_COLOR} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>{t('pm.reports.yearTotal')}: <strong className="text-foreground">{eur(totalRevenue)}</strong></span>
                {bestMonth && (
                  <span>{t('pm.reports.bestMonth')}: <strong className="text-foreground">{monthName(bestMonth.month, lang)} · {eur(bestMonth.revenue)}</strong></span>
                )}
                <span>{t('pm.reports.monthlyAverage')}: <strong className="text-foreground">{eur(monthlyAverage)}</strong></span>
                {yoy !== null && (
                  <span className={cn('font-semibold', yoy >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300')}>
                    {t('pm.reports.vsPeriod', { delta: fmtPct(yoy), year: year - 1 })}
                  </span>
                )}
              </div>
            </Panel>

            <div className="grid gap-4 content-start">
              <Panel title={t('pm.reports.completionsPerMonth')} note={t('pm.reports.completedInYear', { year, count: completedInYear })}>
                {loadingCompletions ? <Skeleton className="h-[130px] w-full" /> : (
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={completionsChart} margin={{ top: 8, right: 0, bottom: 0, left: -28 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} tickFormatter={(v: string) => v.charAt(0)} />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip {...chartTooltip} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} formatter={(value: number) => [value, t('pm.reports.completions')]} />
                      <Bar dataKey="count" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Panel>

              <Panel title={t('pm.reports.pipelineTitle')} note={t('pm.reports.pipelineNote')}>
                {loadingPipeline ? <Skeleton className="h-[150px] w-full" /> : (
                  <div className="space-y-3">
                    {(pipeline ?? []).filter(p => p.count > 0).map(p => (
                      <div key={p.bucket} className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className={cn(p.bucket === 'overdue' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground')}>
                            {t(`pm.reports.pipeline.${p.bucket}`)} <span className="text-xs opacity-70">({p.count})</span>
                          </span>
                          <span className="font-mono font-semibold tabular-nums">{eur(p.remaining)}</span>
                        </div>
                        <Meter value={pct(p.remaining, pipelineMax)} className="h-2"
                          barClassName={p.bucket === 'overdue' ? 'bg-red-500' : p.bucket === 'none' ? 'bg-slate-400' : 'bg-teal-500'} />
                      </div>
                    ))}
                    {(pipeline ?? []).every(p => p.count === 0) && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </TabsContent>

        {/* ── Outstanding — completed but not fully invoiced ──────────────── */}
        <TabsContent value="outstanding" className="mt-4 space-y-4">
          {loadingOutstanding && <TableSkeleton />}
          {!loadingOutstanding && outstandingRows.length === 0 && <EmptyState>{t('pm.reports.noOutstanding')}</EmptyState>}
          {outstandingRows.length > 0 && (
            <>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                {agingTotals.map(a => {
                  const on = agingFilter === a.bucket;
                  return (
                    <button
                      key={a.bucket}
                      type="button"
                      onClick={() => setAgingFilter(on ? null : a.bucket)}
                      aria-pressed={on}
                      className={cn(
                        'relative overflow-hidden rounded-xl border bg-card px-4 pt-3 pb-4 text-left transition-colors hover:bg-muted/40',
                        on && 'ring-2 ring-foreground',
                      )}
                    >
                      <div className="text-xs font-semibold text-muted-foreground">{t(`pm.reports.aging.${a.bucket}`)}</div>
                      <div className="text-xl font-bold font-mono tabular-nums">{eur(a.amount)}</div>
                      <div className="text-xs text-muted-foreground">
                        {t('pm.reports.projectsCount', { count: a.count })} · {on ? t('pm.reports.agingFiltered') : t('pm.reports.agingClickToFilter')}
                      </div>
                      <span className={cn('absolute inset-x-0 bottom-0 h-1',
                        a.bucket === 'old' ? 'bg-red-500' : a.bucket === 'mid' ? 'bg-orange-400' : 'bg-slate-400')} />
                    </button>
                  );
                })}
              </div>

              <div className="rounded-xl border overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <SortTh label={t('pm.reports.colWorkOrder')} sortKey="name" sort={outSort.sort} onSort={outSort.toggle} />
                      <SortTh label={t('pm.reports.colCustomer')} sortKey="customer" sort={outSort.sort} onSort={outSort.toggle} />
                      <SortTh label={t('pm.reports.colEmployee')} sortKey="manager" sort={outSort.sort} onSort={outSort.toggle} />
                      <SortTh label={t('pm.reports.colCompletedAt')} sortKey="age" sort={outSort.sort} onSort={outSort.toggle} />
                      <SortTh label={t('pm.reports.colInvoiced')} sortKey="invoicedPct" sort={outSort.sort} onSort={outSort.toggle} className="w-[220px]" />
                      <SortTh label={t('pm.reports.colOutstanding')} sortKey="gap" sort={outSort.sort} onSort={outSort.toggle} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {outSort.sorted.map(p => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setQuickId(p.id)}>
                        <td className="px-4 py-3"><ProjectCell id={p.id} name={p.name} number={p.projectNumber} onOpen={setQuickId} /></td>
                        <td className="px-4 py-3 text-muted-foreground">{p.customerName ?? '—'}</td>
                        <td className="px-4 py-3"><Person employeeId={p.employeeId} name={p.employeeName} order={employeeOrder} fallback={t('pm.reports.unassigned')} /></td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs">{p.completedAt ? formatDate(p.completedAt) : '—'}</div>
                          {p.completedAt && <SeverityBadge severity={ageSeverity(p.age)}>{t('pm.reports.daysAgo', { count: p.age })}</SeverityBadge>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Meter value={pct(p.invoiced, p.value)} />
                            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{pct(p.invoiced, p.value)} %</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{t('pm.reports.invoicedOf', { invoiced: eur(p.invoiced), value: eur(p.value) })}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-red-600 dark:text-red-400">{eur(p.gap, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/50">
                      <td colSpan={5} className="px-4 py-2.5 text-right font-semibold">{t('pm.reports.totalOutstanding')}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-red-600 dark:text-red-400">
                        {eur(visibleOutstanding.reduce((s, p) => s + p.gap, 0), 2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Workload — one bar per manager, click to see the projects ───── */}
        <TabsContent value="workload" className="mt-4">
          <Panel
            title={t('pm.reports.tabWorkload')}
            note={t('pm.reports.workloadNote')}
            aside={<Legend items={[
              { label: t('pm.reports.invoiced'), swatch: 'bg-primary' },
              { label: t('pm.reports.colRemaining'), swatch: 'bg-primary/30' },
            ]} />}
          >
            {loadingWorkload && <TableSkeleton rows={4} />}
            {!loadingWorkload && managers.length === 0 && <EmptyState>{t('common.noData')}</EmptyState>}
            <div className="divide-y">
              {managers.map(m => {
                const open = expandedManagers.has(m.key);
                return (
                  <div key={m.key}>
                    <button
                      type="button"
                      onClick={() => toggleManager(m.key)}
                      aria-expanded={open}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[220px_minmax(0,1fr)_160px] items-center gap-x-4 gap-y-2 py-3 text-left hover:bg-muted/30 rounded-md px-2 -mx-2"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <Avatar employeeId={m.employeeId} name={m.employeeName} order={employeeOrder} size="md" />
                        <span className="min-w-0">
                          <span className="block font-semibold truncate">{m.employeeName ?? t('pm.reports.unassigned')}</span>
                          <span className="block text-xs text-muted-foreground">{t('pm.reports.projectsCount', { count: m.projects.length })} · {eur(m.value)}</span>
                        </span>
                      </span>
                      <span className="order-last col-span-2 md:order-none md:col-span-1 flex h-5 w-full overflow-hidden rounded-md bg-muted/40">
                        <span className="h-full bg-primary" style={{ width: `${pct(m.invoiced, managerMax)}%` }} title={`${t('pm.reports.invoiced')}: ${eur(m.invoiced)}`} />
                        <span className="h-full bg-primary/30" style={{ width: `${pct(Math.max(m.remaining, 0), managerMax)}%` }} title={`${t('pm.reports.colRemaining')}: ${eur(m.remaining)}`} />
                      </span>
                      <span className="text-right">
                        <span className="block font-mono font-semibold tabular-nums">{eur(m.remaining)}</span>
                        {m.overdueCount > 0 && (
                          <span className="block text-xs font-medium text-red-600 dark:text-red-400">{t('pm.reports.overdueCount', { count: m.overdueCount })}</span>
                        )}
                      </span>
                    </button>
                    {open && (
                      <div className="mb-3 overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[760px] table-fixed text-sm">
                          {/* Fixed widths so columns line up across all manager groups */}
                          <colgroup>
                            <col style={{ width: '28%' }} /><col style={{ width: '20%' }} /><col style={{ width: '12%' }} />
                            <col style={{ width: '12%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} />
                          </colgroup>
                          <thead>
                            <tr className="border-b bg-muted/50 text-muted-foreground">
                              <th className="text-left px-3 py-2 font-medium">{t('pm.reports.colWorkOrder')}</th>
                              <th className="text-left px-3 py-2 font-medium">{t('pm.reports.colCustomer')}</th>
                              <th className="text-left px-3 py-2 font-medium">{t('pm.reports.colStatus')}</th>
                              <th className="text-left px-3 py-2 font-medium">{t('pm.reports.colDeadline')}</th>
                              <th className="text-right px-3 py-2 font-medium">{t('pm.reports.colValue')}</th>
                              <th className="text-right px-3 py-2 font-medium">{t('pm.reports.colRemaining')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.projects.map(p => {
                              const remaining = num(p.contractValue) - num(p.invoicedAmount);
                              const late = isPastDue(p.endDate);
                              return (
                                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setQuickId(p.id)}>
                                  <td className="px-3 py-2"><ProjectCell id={p.id} name={p.name} number={p.projectNumber} onOpen={setQuickId} /></td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground truncate">{p.customerName ?? '—'}</td>
                                  <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                                  <td className={cn('px-3 py-2 font-mono text-xs', late ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground')}>
                                    {p.endDate ? formatDate(p.endDate) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-xs">{eur(p.contractValue)}</td>
                                  <td className={cn('px-3 py-2 text-right font-mono text-xs', remaining > 0 && 'text-emerald-600 dark:text-emerald-400')}>{eur(remaining)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </TabsContent>

        {/* ── Status ──────────────────────────────────────────────────────── */}
        <TabsContent value="status" className="mt-4">
          <Panel title={t('pm.reports.tabStatus')}>
            {loadingSummary ? <Skeleton className="h-[220px] w-full" /> : (
              <div className="flex flex-wrap items-center gap-10">
                <div className="relative h-[220px] w-[220px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={openStatuses.map(s => ({ ...s, count: Number(s.count) }))} dataKey="count" nameKey="status"
                        innerRadius={70} outerRadius={105} paddingAngle={openStatuses.length > 1 ? 2 : 0} stroke="none">
                        {openStatuses.map(s => <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? '#94a3b8'} />)}
                      </Pie>
                      <Tooltip {...chartTooltip} formatter={(value: number, name: string) => [value, t(`pm.status.${name}`, { defaultValue: name })]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold tabular-nums">{openCount}</span>
                    <span className="text-xs text-muted-foreground">{t('pm.reports.donutOpen')}</span>
                  </div>
                </div>
                <div className="flex-1 min-w-[260px] space-y-1">
                  {openStatuses.map(s => (
                    <div key={s.status} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40">
                      <span className="h-3 w-3 rounded-[4px]" style={{ background: STATUS_COLORS[s.status] ?? '#94a3b8' }} />
                      <span className="flex-1 font-medium">{t(`pm.status.${s.status}`, { defaultValue: s.status })}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{pct(Number(s.count), openCount)} %</span>
                      <span className="w-10 text-right font-mono font-bold tabular-nums">{s.count}</span>
                    </div>
                  ))}
                  <div className="my-2 border-t" />
                  <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                    <span className="h-3 w-3 rounded-[4px] bg-teal-500" />
                    <span className="flex-1 font-medium">{t('pm.reports.completedInYearLabel', { year })}</span>
                    <span className="w-10 text-right font-mono font-bold tabular-nums">{completedInYear}</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground">
                    <span className="h-3 w-3 rounded-[4px] bg-muted-foreground/40" />
                    <span className="flex-1">{t('pm.reports.completedOverall')}</span>
                    <span className="w-10 text-right font-mono tabular-nums">{completedOverall}</span>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </TabsContent>

        {/* ── Overdue ─────────────────────────────────────────────────────── */}
        <TabsContent value="overdue" className="mt-4">
          {loadingOverdue && <TableSkeleton />}
          {!loadingOverdue && overdueRows.length === 0 && <EmptyState>{t('pm.reports.noOverdue')}</EmptyState>}
          {overdueRows.length > 0 && (
            <div className="rounded-xl border overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <SortTh label={t('pm.reports.colWorkOrder')} sortKey="name" sort={lateSort.sort} onSort={lateSort.toggle} />
                    <SortTh label={t('pm.reports.colCustomer')} sortKey="customer" sort={lateSort.sort} onSort={lateSort.toggle} />
                    <SortTh label={t('pm.reports.colEmployee')} sortKey="manager" sort={lateSort.sort} onSort={lateSort.toggle} />
                    <SortTh label={t('pm.reports.colLate')} sortKey="late" sort={lateSort.sort} onSort={lateSort.toggle} />
                    <SortTh label={t('pm.reports.colRemaining')} sortKey="remaining" sort={lateSort.sort} onSort={lateSort.toggle} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {lateSort.sorted.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setQuickId(p.id)}>
                      <td className="px-4 py-3"><ProjectCell id={p.id} name={p.name} number={p.projectNumber} onOpen={setQuickId} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{p.customerName ?? '—'}</td>
                      <td className="px-4 py-3"><Person employeeId={p.employeeId} name={p.employeeName} order={employeeOrder} fallback={t('pm.reports.unassigned')} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={lateSeverity(p.late)}>{t('pm.reports.days', { count: p.late })}</SeverityBadge>
                          <span className="font-mono text-xs text-muted-foreground">{p.endDate ? formatDate(p.endDate) : '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{eur(p.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── By customer — all statuses; click a row to filter the whole page ── */}
        <TabsContent value="customers" className="mt-4 space-y-2">
          <p className="text-xs text-muted-foreground">{t('pm.reports.customersNote')}</p>
          {loadingByCustomer && <TableSkeleton />}
          {byCustomer && (
            <div className="rounded-xl border overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <SortTh label={t('pm.reports.colCustomer')} sortKey="name" sort={custSort.sort} onSort={custSort.toggle} />
                    <SortTh label={t('pm.reports.colActive')} sortKey="active" sort={custSort.sort} onSort={custSort.toggle} align="right" />
                    <SortTh label={t('pm.reports.colCompleted')} sortKey="completed" sort={custSort.sort} onSort={custSort.toggle} align="right" />
                    <SortTh label={t('pm.reports.colShare')} sortKey="value" sort={custSort.sort} onSort={custSort.toggle} className="w-[280px]" />
                    <SortTh label={t('pm.reports.colRemaining')} sortKey="remaining" sort={custSort.sort} onSort={custSort.toggle} align="right" />
                    <SortTh label={t('pm.reports.colOutstanding')} sortKey="unbilled" sort={custSort.sort} onSort={custSort.toggle} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {custSort.sorted.map(c => {
                    const selected = !!c.customerName && c.customerName.toLowerCase() === customer.toLowerCase();
                    return (
                      <tr
                        key={c.customerName ?? '__none__'}
                        className={cn('border-b last:border-0', c.customerName && 'cursor-pointer hover:bg-muted/30', selected && 'bg-primary/10')}
                        onClick={() => c.customerName && setCustomer(selected ? '' : c.customerName)}
                      >
                        <td className="px-4 py-3 font-medium">
                          {c.customerName ?? <span className="text-muted-foreground italic">{t('pm.reports.noCustomer')}</span>}
                          {c.variants > 1 && (
                            <Badge variant="outline" className="ml-2 text-[10px] font-normal" title={t('pm.reports.variantsHint')}>
                              {t('pm.reports.variants', { count: c.variants })}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.activeCount || '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.completedCount || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Meter value={pct(num(c.contractValue), customerMax)} className="h-2" />
                            <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums">{eur(c.contractValue)}</span>
                          </div>
                        </td>
                        <td className={cn('px-4 py-3 text-right font-mono text-xs', num(c.remainingActive) > 0 && 'text-emerald-600 dark:text-emerald-400')}>{eur(c.remainingActive)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-red-600 dark:text-red-400">{eur(c.unbilledCompleted)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ProjectQuickView projectId={quickId} onClose={() => setQuickId(null)} />
    </div>
  );
}
