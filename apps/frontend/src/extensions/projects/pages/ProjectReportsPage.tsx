import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Users, ChevronDown, ChevronUp, AlertCircle, Printer } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

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

  async function printReport() {
    const fmtEur = (v: number | string | null | undefined) => {
      const n = parseFloat(String(v ?? 0));
      return isNaN(n) || n === 0 ? '—' : new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(n);
    };
    const generated = new Date().toLocaleDateString('sl-SI');

    // Fetch project lists on demand
    const [activeResp, archivedResp] = await Promise.all([
      api.get<{ data: any[] }>(`/pm/projects?archived=false&limit=500`),
      api.get<{ data: any[] }>(`/pm/projects?archived=true&limit=500`),
    ]);
    const activeProjects: any[] = activeResp.data ?? [];
    const completedThisYear: any[] = (archivedResp.data ?? []).filter((p: any) => {
      if (!p.completedAt) return false;
      return new Date(p.completedAt).getFullYear() === revenueYear;
    });

    function groupByEmp(projects: any[]) {
      const groups: { employeeName: string | null; projects: any[] }[] = [];
      const seen = new Map<string, number>();
      for (const p of projects) {
        const key = p.employeeId ?? '__none__';
        if (!seen.has(key)) { seen.set(key, groups.length); groups.push({ employeeName: p.employeeName, projects: [] }); }
        groups[seen.get(key)!].projects.push(p);
      }
      return groups;
    }

    function projectTable(projects: any[], showCompleted = false) {
      if (projects.length === 0) return '<p style="color:#888;font-size:11px;padding:6px 0">—</p>';
      const rows = projects.map(p => {
        const remaining = parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0');
        const isOverdue = !showCompleted && p.endDate && new Date(p.endDate) < new Date();
        return `<tr>
          <td><strong>${p.projectNumber}</strong><br><span style="font-size:9px;color:#666">${p.name}</span></td>
          <td>${p.customerName ?? '—'}</td>
          <td>${p.facilityName ?? '—'}</td>
          ${showCompleted
            ? `<td style="color:#15803d">${p.completedAt ? new Date(p.completedAt).toLocaleDateString('sl-SI') : '—'}</td>`
            : `<td style="${isOverdue ? 'color:#dc2626;font-weight:600' : ''}">${p.endDate ?? '—'}</td>`}
          <td style="text-align:right">${fmtEur(p.contractValue)}</td>
          <td style="text-align:right">${fmtEur(p.invoicedAmount)}</td>
          <td style="text-align:right;${!showCompleted && remaining > 0 ? 'color:#15803d' : showCompleted && remaining > 0 ? 'color:#dc2626' : ''}">${fmtEur(remaining)}</td>
        </tr>`;
      }).join('');
      const dateHeader = showCompleted ? 'Zaključeno' : 'Rok';
      return `<table><thead><tr>
        <th>Delovni nalog</th><th>Naročnik</th><th>Objekt</th><th>${dateHeader}</th>
        <th style="text-align:right">Vrednost</th><th style="text-align:right">Fakturirano</th><th style="text-align:right">${showCompleted ? 'Nefakt.' : 'Ostalo'}</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    }

    function groupedSection(projects: any[], showCompleted = false) {
      const groups = groupByEmp(projects);
      return groups.map((g, i) => {
        const COLORS = ['#dbeafe','#d1fae5','#ede9fe','#fef3c7','#fee2e2','#cffafe','#ffedd5','#ccfbf1'];
        const bg = COLORS[i % COLORS.length];
        return `<div style="margin-bottom:12px">
          <div style="background:${bg};border-left:4px solid #6366f1;padding:5px 10px;font-weight:700;font-size:11px;margin-bottom:3px">
            ${g.employeeName ?? 'Nedodeljeno'} (${g.projects.length})
          </div>
          ${projectTable(g.projects, showCompleted)}
        </div>`;
      }).join('');
    }

    // Monthly revenue + completions table
    const monthRows = (revenueTrend ?? []).map((r, i) => {
      const c = completions?.[i]?.count ?? 0;
      return `<tr>
        <td>${r.month}</td>
        <td style="text-align:right;${r.revenue > 0 ? 'color:#15803d;font-weight:600' : 'color:#aaa'}">${fmtEur(r.revenue)}</td>
        <td style="text-align:right">${r.invoiceCount > 0 ? r.invoiceCount : '—'}</td>
        <td style="text-align:right">${c > 0 ? c : '—'}</td>
      </tr>`;
    }).join('');

    // Outstanding section
    const outstandingRows = (outstanding ?? []).map(p => {
      const gap = parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0');
      return `<tr>
        <td><strong>${p.projectNumber}</strong><br><span style="font-size:9px;color:#666">${p.name}</span></td>
        <td>${p.customerName ?? '—'}</td>
        <td>${p.employeeName ?? '—'}</td>
        <td>${p.completedAt ? new Date(p.completedAt).toLocaleDateString('sl-SI') : '—'}</td>
        <td style="text-align:right">${fmtEur(p.contractValue)}</td>
        <td style="text-align:right">${fmtEur(p.invoicedAmount)}</td>
        <td style="text-align:right;color:#dc2626;font-weight:600">${fmtEur(gap)}</td>
      </tr>`;
    }).join('');

    const totalOutstandingAmt = (outstanding ?? []).reduce((s, p) =>
      s + parseFloat(p.contractValue ?? '0') - parseFloat(p.invoicedAmount ?? '0'), 0);

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Poročilo projektov ${revenueYear}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; }
        h2 { font-size: 15px; margin: 0 0 2px 0; }
        h3 { font-size: 12px; margin: 16px 0 6px 0; border-bottom: 2px solid #6366f1; padding-bottom: 3px; color: #4338ca; }
        .meta { font-size: 10px; color: #666; margin-bottom: 14px; }
        .summary { display: flex; gap: 12px; margin-bottom: 16px; }
        .stat { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
        .stat-label { font-size: 9px; color: #888; margin-bottom: 2px; }
        .stat-value { font-size: 14px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px; }
        th { background: #f1f5f9; text-align: left; padding: 4px 6px; border-bottom: 1px solid #cbd5e1; font-size: 10px; }
        td { padding: 3px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
        tr:last-child td { border-bottom: none; }
        .page-break { page-break-before: always; }
        tfoot td { background: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1; }
        @media print { button { display: none; } }
      </style>
    </head><body>
      <h2>Poročilo projektov — ${revenueYear}</h2>
      <div class="meta">Generirano: ${generated} &nbsp;|&nbsp; Aktivni projekti: ${activeProjects.length} &nbsp;|&nbsp; Zaključeni ${revenueYear}: ${completedThisYear.length}</div>

      <!-- Summary -->
      <div class="summary">
        <div class="stat">
          <div class="stat-label">Skupna vrednost (aktivni)</div>
          <div class="stat-value">${fmtEur(summary?.totals.totalContractValue)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Fakturirano (aktivni)</div>
          <div class="stat-value" style="color:#2563eb">${fmtEur(summary?.totals.totalInvoiced)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Ostalo za fakturiranje (aktivni)</div>
          <div class="stat-value" style="color:#15803d">${fmtEur(summary?.totals.totalRemaining)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Prihodki ${revenueYear} (fakture)</div>
          <div class="stat-value" style="color:#15803d">${fmtEur(totalRevenue)}</div>
        </div>
        ${totalOutstandingAmt > 0 ? `<div class="stat" style="border-color:#fca5a5">
          <div class="stat-label" style="color:#dc2626">Nefakturirano (zaključeni)</div>
          <div class="stat-value" style="color:#dc2626">${fmtEur(totalOutstandingAmt)}</div>
        </div>` : ''}
      </div>

      <!-- Monthly revenue -->
      <h3>Mesečni prihodki ${revenueYear}</h3>
      <table style="width:320px">
        <thead><tr><th>Mesec</th><th style="text-align:right">Fakturirano</th><th style="text-align:right">Faktur</th><th style="text-align:right">Zaključeni</th></tr></thead>
        <tbody>${monthRows}</tbody>
        <tfoot><tr><td><strong>Skupaj</strong></td><td style="text-align:right">${fmtEur(totalRevenue)}</td><td></td><td></td></tr></tfoot>
      </table>

      <!-- Active projects -->
      <div class="page-break">
        <h3>Aktivni projekti (${activeProjects.length})</h3>
        ${groupedSection(activeProjects, false)}
      </div>

      <!-- Completed this year -->
      <div class="page-break">
        <h3>Zaključeni projekti ${revenueYear} (${completedThisYear.length})</h3>
        ${completedThisYear.length === 0 ? '<p style="color:#888;font-size:11px">Ni zaključenih projektov za to leto.</p>' : groupedSection(completedThisYear, true)}
      </div>

      ${outstandingRows ? `<div class="page-break">
        <h3>Nefakturirani zaključeni projekti</h3>
        <table>
          <thead><tr><th>Delovni nalog</th><th>Naročnik</th><th>Zaposleni</th><th>Zaključeno</th><th style="text-align:right">Vrednost</th><th style="text-align:right">Fakturirano</th><th style="text-align:right">Nefakturirano</th></tr></thead>
          <tbody>${outstandingRows}</tbody>
          <tfoot><tr><td colspan="6" style="text-align:right">Skupaj nefakturirano</td><td style="text-align:right;color:#dc2626">${fmtEur(totalOutstandingAmt)}</td></tr></tfoot>
        </table>
      </div>` : ''}
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('pm.reports.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pm.reports.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={printReport} className="shrink-0 mt-1">
          <Printer className="h-4 w-4 mr-2" />{t('pm.reports.printReport')} {revenueYear}
        </Button>
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
