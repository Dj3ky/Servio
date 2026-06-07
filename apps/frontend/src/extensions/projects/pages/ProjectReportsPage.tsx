import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Users, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SummaryData {
  statusCounts: { status: string; count: number }[];
  totals: { totalContractValue: string; totalInvoiced: string; totalRemaining: string };
  employeeStats: { employeeId: string | null; employeeName: string | null; count: number; totalValue: string; totalInvoiced: string }[];
}

interface WorkloadGroup {
  employeeId: string | null;
  employeeName: string | null;
  projects: WorkloadProject[];
}

interface WorkloadProject {
  id: string; projectNumber: string; name: string; priority: string; status: string;
  endDate: string | null; contractValue: string | null; invoicedAmount: string;
  customerName: string | null;
}

interface OverdueProject {
  id: string; projectNumber: string; name: string; priority: string; status: string;
  endDate: string | null; contractValue: string | null; invoicedAmount: string;
  employeeName: string | null; customerName: string | null;
}

interface RevenueTrendRow { month: string; revenue: number; invoiceCount: number; }
interface CompletionsRow { month: string; count: number; }
interface OutstandingProject {
  id: string; projectNumber: string; name: string; customerName: string | null;
  employeeName: string | null; contractValue: string | null; invoicedAmount: string;
  completedAt: string | null;
}

const PRIORITY_COLORS: Record<string, string> = { high: 'destructive', medium: 'default', low: 'secondary' };

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

const chartStyle = {
  contentStyle: {
    borderRadius: '8px',
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--popover))',
    fontSize: 12,
  },
  labelStyle: { color: 'hsl(var(--popover-foreground))', fontWeight: 600 },
};

function fmt(v: string | number | null | undefined) {
  const n = parseFloat(String(v ?? 0));
  if (!v || isNaN(n)) return '—';
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtShort(v: number) {
  if (v === 0) return '0';
  if (v >= 1000) return `€${(v / 1000).toFixed(0)}k`;
  return `€${v.toFixed(0)}`;
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - i);

export default function ProjectReportsPage() {
  const { t } = useTranslation();
  const [collapsedWorkload, setCollapsedWorkload] = useState<Set<string>>(new Set());
  const [revenueYear, setRevenueYear] = useState(currentYear);

  function toggleWorkload(key: string) {
    setCollapsedWorkload(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const { data: summary, isLoading: loadingSummary } = useQuery<SummaryData>({
    queryKey: ['pm-report', 'summary'],
    queryFn: () => api.get('/pm/reports/summary'),
  });

  const { data: workload, isLoading: loadingWorkload } = useQuery<WorkloadGroup[]>({
    queryKey: ['pm-report', 'workload'],
    queryFn: () => api.get('/pm/reports/workload'),
  });

  const { data: overdue, isLoading: loadingOverdue } = useQuery<OverdueProject[]>({
    queryKey: ['pm-report', 'overdue'],
    queryFn: () => api.get('/pm/reports/overdue'),
  });

  const { data: revenueTrend, isLoading: loadingRevenue } = useQuery<RevenueTrendRow[]>({
    queryKey: ['pm-report', 'revenue-trend', revenueYear],
    queryFn: () => api.get(`/pm/reports/revenue-trend?year=${revenueYear}`),
  });

  const { data: completions, isLoading: loadingCompletions } = useQuery<CompletionsRow[]>({
    queryKey: ['pm-report', 'completions', revenueYear],
    queryFn: () => api.get(`/pm/reports/completions?year=${revenueYear}`),
  });

  const { data: outstanding, isLoading: loadingOutstanding } = useQuery<OutstandingProject[]>({
    queryKey: ['pm-report', 'outstanding'],
    queryFn: () => api.get('/pm/reports/outstanding'),
  });

  const totalOutstanding = (outstanding ?? []).reduce((sum, p) => {
    return sum + parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0');
  }, 0);

  const totalRevenue = (revenueTrend ?? []).reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('pm.reports.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('pm.reports.subtitle')}</p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('pm.reports.activeSummaryNote')}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('pm.reports.totalValue')}</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold font-mono">{fmt(summary.totals.totalContractValue)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('pm.reports.totalInvoiced')}</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold font-mono text-primary">{fmt(summary.totals.totalInvoiced)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{t('pm.reports.totalRemaining')}</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold font-mono text-green-600">{fmt(summary.totals.totalRemaining)}</p></CardContent>
            </Card>
          </div>
        </div>
      )}

      <Tabs defaultValue="revenue">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="revenue">{t('pm.reports.tabRevenue')}</TabsTrigger>
          <TabsTrigger value="outstanding" className="relative">
            {t('pm.reports.tabOutstanding')}
            {outstanding && outstanding.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold w-4 h-4">{outstanding.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="workload">{t('pm.reports.tabWorkload')}</TabsTrigger>
          <TabsTrigger value="status">{t('pm.reports.tabStatus')}</TabsTrigger>
          <TabsTrigger value="overdue">{t('pm.reports.tabOverdue')} {overdue && overdue.length > 0 && `(${overdue.length})`}</TabsTrigger>
          <TabsTrigger value="employee">{t('pm.reports.tabEmployee')}</TabsTrigger>
        </TabsList>

        {/* Revenue + Completions charts */}
        <TabsContent value="revenue" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Select value={String(revenueYear)} onValueChange={v => setRevenueYear(Number(v))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            {!loadingRevenue && revenueTrend && (
              <span className="text-sm text-muted-foreground">{t('pm.reports.yearTotal')}: <span className="font-semibold text-foreground">{fmt(totalRevenue)}</span></span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Monthly Revenue */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('pm.reports.monthlyRevenue')}</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingRevenue
                  ? <div className="h-[210px] flex items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>
                  : (
                    <ResponsiveContainer width="100%" height={210}>
                      <AreaChart data={revenueTrend ?? []} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
                        <Tooltip
                          contentStyle={chartStyle.contentStyle}
                          labelStyle={chartStyle.labelStyle}
                          formatter={(value: number, _name, props) => [
                            fmt(value),
                            `${t('pm.reports.invoiced')} (${props.payload?.invoiceCount ?? 0} inv.)`,
                          ]}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} fill="url(#revenueGrad)" dot={false} activeDot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
              </CardContent>
            </Card>

            {/* Completions per month */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('pm.reports.completionsPerMonth')}</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingCompletions
                  ? <div className="h-[210px] flex items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>
                  : (
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={completions ?? []} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="completionsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.4} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={chartStyle.contentStyle}
                          labelStyle={chartStyle.labelStyle}
                          formatter={(value: number) => [value, t('pm.reports.completions')]}
                        />
                        <Bar dataKey="count" fill="url(#completionsGrad)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Outstanding — completed but not fully invoiced */}
        <TabsContent value="outstanding" className="mt-4 space-y-3">
          {loadingOutstanding && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {!loadingOutstanding && (outstanding ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">{t('pm.reports.noOutstanding')}</p>
          )}
          {(outstanding ?? []).length > 0 && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                <span>{t('pm.reports.outstandingNote')}: <strong>{fmt(totalOutstanding)}</strong> {t('pm.reports.outstandingNoteAcross')} {outstanding!.length} {t('pm.reports.outstandingNoteProjects')}</span>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colWorkOrder')}</th>
                      <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colCustomer')}</th>
                      <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colEmployee')}</th>
                      <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colCompletedAt')}</th>
                      <th className="text-right px-4 py-3 font-medium">{t('pm.reports.colValue')}</th>
                      <th className="text-right px-4 py-3 font-medium">{t('pm.reports.colInvoiced')}</th>
                      <th className="text-right px-4 py-3 font-medium text-destructive">{t('pm.reports.colOutstanding')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(outstanding ?? []).map(p => {
                      const gap = parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0');
                      return (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="px-4 py-3">
                            <div className="font-medium">{p.projectNumber}</div>
                            <div className="text-xs text-muted-foreground">{p.name}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{p.customerName ?? '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.employeeName ?? '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                            {p.completedAt ? new Date(p.completedAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{fmt(p.contractValue)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{fmt(p.invoicedAmount)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-destructive">{fmt(gap)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/50">
                      <td colSpan={6} className="px-4 py-2 text-sm font-semibold text-right">{t('pm.reports.totalOutstanding')}</td>
                      <td className="px-4 py-2 text-right font-mono text-sm font-bold text-destructive">{fmt(totalOutstanding)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* Workload — collapsible by employee */}
        <TabsContent value="workload" className="mt-4 space-y-3">
          {loadingWorkload && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {(workload ?? []).length === 0 && !loadingWorkload && (
            <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
          )}
          {(workload ?? []).map((group, idx) => {
            const key = group.employeeId ?? '__unassigned__';
            const collapsed = collapsedWorkload.has(key);
            return (
              <div key={key} className="rounded-md border overflow-hidden">
                <button
                  className={`w-full px-4 py-2 text-sm font-semibold flex items-center gap-2 text-left ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}
                  onClick={() => toggleWorkload(key)}
                >
                  <Users className="h-4 w-4 opacity-70 shrink-0" />
                  <span className="flex-1">{group.employeeName ?? t('pm.reports.unassigned')}</span>
                  <span className="font-normal text-muted-foreground">({group.projects.length})</span>
                  {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                </button>
                {!collapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">{t('pm.reports.colWorkOrder')}</th>
                          <th className="text-left px-3 py-2 font-medium">{t('pm.reports.colCustomer')}</th>
                          <th className="text-left px-3 py-2 font-medium">{t('pm.reports.colPriority')}</th>
                          <th className="text-left px-3 py-2 font-medium">{t('pm.reports.colDeadline')}</th>
                          <th className="text-right px-3 py-2 font-medium">{t('pm.reports.colValue')}</th>
                          <th className="text-right px-3 py-2 font-medium">{t('pm.reports.colRemaining')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.projects.map(p => {
                          const remaining = parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0');
                          const isOverdue = p.endDate && new Date(p.endDate) < new Date();
                          return (
                            <tr key={p.id} className="border-b last:border-0">
                              <td className="px-3 py-2">
                                <div className="font-medium">{p.projectNumber}</div>
                                <div className="text-xs text-muted-foreground">{p.name}</div>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">{p.customerName ?? '—'}</td>
                              <td className="px-3 py-2">
                                <Badge variant={PRIORITY_COLORS[p.priority] as any} className="text-xs">{t(`pm.priority.${p.priority}`)}</Badge>
                              </td>
                              <td className={`px-3 py-2 font-mono text-xs ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>{p.endDate ?? '—'}</td>
                              <td className="px-3 py-2 text-right font-mono text-xs">{fmt(p.contractValue)}</td>
                              <td className={`px-3 py-2 text-right font-mono text-xs ${remaining > 0 ? 'text-green-600' : ''}`}>{fmt(remaining)}</td>
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
        </TabsContent>

        {/* By status */}
        <TabsContent value="status" className="mt-4">
          {loadingSummary && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {summary && (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colStatus')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('pm.reports.colProjectCount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.statusCounts.map(s => (
                    <tr key={s.status} className="border-b last:border-0">
                      <td className="px-4 py-3">{t(`pm.status.${s.status}`, { defaultValue: s.status })}</td>
                      <td className="px-4 py-3 text-right font-semibold">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Overdue */}
        <TabsContent value="overdue" className="mt-4">
          {loadingOverdue && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {(overdue ?? []).length === 0 && !loadingOverdue && (
            <p className="text-sm text-muted-foreground">{t('pm.reports.noOverdue')}</p>
          )}
          {(overdue ?? []).length > 0 && (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colWorkOrder')}</th>
                    <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colEmployee')}</th>
                    <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colCustomer')}</th>
                    <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colDeadline')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('pm.reports.colRemaining')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(overdue ?? []).map(p => {
                    const remaining = parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0');
                    return (
                      <tr key={p.id} className="border-b last:border-0 bg-destructive/5">
                        <td className="px-4 py-3">
                          <div className="font-medium">{p.projectNumber}</div>
                          <div className="text-xs text-muted-foreground">{p.name}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{p.employeeName ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.customerName ?? '—'}</td>
                        <td className="px-4 py-3 text-destructive font-medium font-mono text-xs">{p.endDate}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{fmt(remaining)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* By employee summary */}
        <TabsContent value="employee" className="mt-4">
          {loadingSummary && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {summary && (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">{t('pm.reports.colEmployee')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('pm.reports.colProjects')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('pm.reports.colTotalValue')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('pm.reports.colInvoiced')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('pm.reports.colRemaining')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.employeeStats.map(e => {
                    const remaining = parseFloat(e.totalValue ?? '0') - parseFloat(e.totalInvoiced ?? '0');
                    return (
                      <tr key={e.employeeId ?? 'unassigned'} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{e.employeeName ?? t('pm.reports.unassigned')}</td>
                        <td className="px-4 py-3 text-right">{e.count}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{fmt(e.totalValue)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{fmt(e.totalInvoiced)}</td>
                        <td className={`px-4 py-3 text-right font-mono text-xs ${remaining > 0 ? 'text-green-600' : ''}`}>{fmt(remaining)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
