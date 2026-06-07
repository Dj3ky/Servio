import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

function fmt(v: string | null | undefined) {
  if (!v) return '—';
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(parseFloat(v));
}

export default function ProjectReportsPage() {
  const { t } = useTranslation();
  const [collapsedWorkload, setCollapsedWorkload] = useState<Set<string>>(new Set());

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('pm.reports.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('pm.reports.subtitle')}</p>
      </div>

      {/* Summary cards — active + on-hold projects only */}
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

      <Tabs defaultValue="workload">
        <TabsList>
          <TabsTrigger value="workload">{t('pm.reports.tabWorkload')}</TabsTrigger>
          <TabsTrigger value="status">{t('pm.reports.tabStatus')}</TabsTrigger>
          <TabsTrigger value="overdue">{t('pm.reports.tabOverdue')} {overdue && overdue.length > 0 && `(${overdue.length})`}</TabsTrigger>
          <TabsTrigger value="employee">{t('pm.reports.tabEmployee')}</TabsTrigger>
        </TabsList>

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
                  {collapsed
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
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
                              <td className={`px-3 py-2 text-right font-mono text-xs ${remaining > 0 ? 'text-green-600' : ''}`}>{fmt(String(remaining))}</td>
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
                        <td className="px-4 py-3 text-right font-mono text-xs">{fmt(String(remaining))}</td>
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
                        <td className={`px-4 py-3 text-right font-mono text-xs ${remaining > 0 ? 'text-green-600' : ''}`}>{fmt(String(remaining))}</td>
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
