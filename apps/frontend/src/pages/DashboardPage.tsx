import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, ClipboardCheck, Receipt, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface DashboardData {
  activeContracts: number;
  pendingReviews: number;
  completedThisMonth: number;
  pendingInvoices: number;
  monthlyTrend: Array<{ month: string; completed: number }>;
  pendingReviewsList: Array<{
    id: string;
    scheduledMonth: string;
    contract: { contractNumber: string; facility: { name: string }; customer: { name: string } };
  }>;
  pendingInvoicesList: Array<{
    id: string;
    createdAt: string;
    review: { scheduledMonth: string; contract: { contractNumber: string; facility: { name: string }; customer: { name: string } } };
  }>;
}

function StatCard({ title, value, icon: Icon, loading }: { title: string; value: number; icon: React.ComponentType<{ className?: string }>; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={t('dashboard.activeContracts')} value={data?.activeContracts ?? 0} icon={FileText} loading={isLoading} />
        <StatCard title={t('dashboard.pendingReviews')} value={data?.pendingReviews ?? 0} icon={ClipboardCheck} loading={isLoading} />
        <StatCard title={t('dashboard.completedThisMonth')} value={data?.completedThisMonth ?? 0} icon={Activity} loading={isLoading} />
        <StatCard title={t('dashboard.pendingInvoices')} value={data?.pendingInvoices ?? 0} icon={Receipt} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dashboard.monthlyTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.monthlyTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip />
                <Bar dataKey="completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.recentReviews')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : data?.pendingReviewsList.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <div className="space-y-2">
                {data?.pendingReviewsList.slice(0, 8).map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{r.contract.facility.name}</div>
                      <div className="text-xs text-muted-foreground">{r.contract.customer.name} · #{r.contract.contractNumber}</div>
                    </div>
                    <Badge variant="warning">{r.scheduledMonth}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.recentInvoices')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : data?.pendingInvoicesList.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <div className="space-y-2">
                {data?.pendingInvoicesList.slice(0, 8).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{inv.review.contract.facility.name}</div>
                      <div className="text-xs text-muted-foreground">{inv.review.contract.customer.name} · #{inv.review.contract.contractNumber}</div>
                    </div>
                    <Badge variant="info">{formatDate(inv.createdAt)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
