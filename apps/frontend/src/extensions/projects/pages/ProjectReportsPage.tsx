import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
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

const STATUS_LABELS: Record<string, string> = { active: 'Aktivno', on_hold: 'Na čakanju', completed: 'Zaključeno' };
const PRIORITY_LABELS: Record<string, string> = { high: 'Visoka', medium: 'Srednja', low: 'Nizka' };
const PRIORITY_COLORS: Record<string, string> = { high: 'destructive', medium: 'default', low: 'secondary' };

function fmt(v: string | null | undefined) {
  if (!v) return '—';
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR' }).format(parseFloat(v));
}

export default function ProjectReportsPage() {
  const { t } = useTranslation();

  const { data: summary, isLoading: loadingSummary } = useQuery<SummaryData>({
    queryKey: ['pm-report-summary'],
    queryFn: () => api.get('/pm/reports/summary'),
  });

  const { data: workload, isLoading: loadingWorkload } = useQuery<WorkloadGroup[]>({
    queryKey: ['pm-report-workload'],
    queryFn: () => api.get('/pm/reports/workload'),
  });

  const { data: overdue, isLoading: loadingOverdue } = useQuery<OverdueProject[]>({
    queryKey: ['pm-report-overdue'],
    queryFn: () => api.get('/pm/reports/overdue'),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Poročila projektov</h1>
        <p className="text-sm text-muted-foreground">Pregled stanja, obremenitev in prihodkov</p>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Skupna vrednost pogodb</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold font-mono">{fmt(summary.totals.totalContractValue)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Skupaj fakturirano</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold font-mono text-primary">{fmt(summary.totals.totalInvoiced)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ostalo za fakturiranje</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold font-mono text-green-600">{fmt(summary.totals.totalRemaining)}</p></CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="workload">
        <TabsList>
          <TabsTrigger value="workload">Obremenitev zaposlenih</TabsTrigger>
          <TabsTrigger value="status">Po statusu</TabsTrigger>
          <TabsTrigger value="overdue">Zamude {overdue && overdue.length > 0 && `(${overdue.length})`}</TabsTrigger>
          <TabsTrigger value="employee">Po zaposlenih</TabsTrigger>
        </TabsList>

        {/* Workload */}
        <TabsContent value="workload" className="mt-4 space-y-6">
          {loadingWorkload && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {(workload ?? []).map(group => (
            <div key={group.employeeId ?? 'unassigned'} className="space-y-2">
              <h3 className="font-semibold text-sm">{group.employeeName ?? 'Nedodeljeno'} <span className="text-muted-foreground font-normal">({group.projects.length})</span></h3>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">DN / Ime</th>
                      <th className="text-left px-3 py-2 font-medium">Naročnik</th>
                      <th className="text-left px-3 py-2 font-medium">Prioriteta</th>
                      <th className="text-left px-3 py-2 font-medium">Rok</th>
                      <th className="text-right px-3 py-2 font-medium">Vrednost</th>
                      <th className="text-right px-3 py-2 font-medium">Ostalo</th>
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
                            <Badge variant={PRIORITY_COLORS[p.priority] as any} className="text-xs">{PRIORITY_LABELS[p.priority]}</Badge>
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
            </div>
          ))}
        </TabsContent>

        {/* By status */}
        <TabsContent value="status" className="mt-4">
          {loadingSummary && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {summary && (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Število projektov</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.statusCounts.map(s => (
                    <tr key={s.status} className="border-b last:border-0">
                      <td className="px-4 py-3">{STATUS_LABELS[s.status] ?? s.status}</td>
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
            <p className="text-sm text-muted-foreground">Ni projektov z zamudo.</p>
          )}
          {(overdue ?? []).length > 0 && (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">DN / Ime</th>
                    <th className="text-left px-4 py-3 font-medium">Zaposleni</th>
                    <th className="text-left px-4 py-3 font-medium">Naročnik</th>
                    <th className="text-left px-4 py-3 font-medium">Rok</th>
                    <th className="text-right px-4 py-3 font-medium">Ostalo</th>
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

        {/* By employee */}
        <TabsContent value="employee" className="mt-4">
          {loadingSummary && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {summary && (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">Zaposleni</th>
                    <th className="text-right px-4 py-3 font-medium">Projekti</th>
                    <th className="text-right px-4 py-3 font-medium">Skupna vrednost</th>
                    <th className="text-right px-4 py-3 font-medium">Fakturirano</th>
                    <th className="text-right px-4 py-3 font-medium">Ostalo</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.employeeStats.map(e => {
                    const remaining = parseFloat(e.totalValue ?? '0') - parseFloat(e.totalInvoiced ?? '0');
                    return (
                      <tr key={e.employeeId ?? 'unassigned'} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{e.employeeName ?? 'Nedodeljeno'}</td>
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
