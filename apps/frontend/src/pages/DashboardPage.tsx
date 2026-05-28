import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, ClipboardCheck, Receipt, Activity, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface DashboardData {
  activeContracts: number;
  pendingReviews: number;
  completedThisMonth: number;
  pendingInvoices: number;
  monthlyTrend: Array<{ month: string; completed: number }>;
  pendingReviewsList: Array<{
    id: string;
    scheduledMonth: string;
    contract: { contractNumber: string; facility: { name: string; id?: string }; customer: { name: string } };
  }>;
  pendingInvoicesList: Array<{
    id: string;
    createdAt: string;
    review: { scheduledMonth: string; contract: { contractNumber: string; facility: { name: string }; customer: { name: string } } };
  }>;
}

const STAT_COLORS = {
  blue:  { bar: 'bg-blue-500',  iconBg: 'bg-blue-100 dark:bg-blue-950/50',  iconText: 'text-blue-600' },
  amber: { bar: 'bg-amber-500', iconBg: 'bg-amber-100 dark:bg-amber-950/50', iconText: 'text-amber-600' },
  green: { bar: 'bg-green-500', iconBg: 'bg-green-100 dark:bg-green-950/50', iconText: 'text-green-600' },
  rose:  { bar: 'bg-rose-500',  iconBg: 'bg-rose-100 dark:bg-rose-950/50',   iconText: 'text-rose-600' },
} as const;

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  color: keyof typeof STAT_COLORS;
}

function StatCard({ title, value, icon: Icon, loading, color }: StatCardProps) {
  const c = STAT_COLORS[color];
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-y-0 left-0 w-1 ${c.bar}`} />
      <CardHeader className="flex flex-row items-center justify-between pb-2 pl-5">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={`rounded-lg p-2 ${c.iconBg}`}>
          <Icon className={`h-5 w-5 ${c.iconText}`} />
        </div>
      </CardHeader>
      <CardContent className="pl-5">
        {loading
          ? <Skeleton className="h-9 w-16" />
          : <div className="text-3xl font-bold tracking-tight">{value}</div>
        }
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
    refetchInterval: 60000,
  });

  const statCards: StatCardProps[] = [
    { title: t('dashboard.activeContracts'), value: data?.activeContracts ?? 0, icon: FileText, loading: isLoading, color: 'blue' },
    { title: t('dashboard.pendingReviews'), value: data?.pendingReviews ?? 0, icon: ClipboardCheck, loading: isLoading, color: 'amber' },
    { title: t('dashboard.completedThisMonth'), value: data?.completedThisMonth ?? 0, icon: Activity, loading: isLoading, color: 'green' },
    { title: t('dashboard.pendingInvoices'), value: data?.pendingInvoices ?? 0, icon: Receipt, loading: isLoading, color: 'rose' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('dashboard.subtitle')}</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t('dashboard.monthlyTrend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.monthlyTrend ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 600 }}
                  itemStyle={{ color: 'hsl(var(--primary))' }}
                />
                <Bar dataKey="completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending reviews */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">{t('dashboard.recentReviews')}</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => navigate('/contracts')}>
              {t('common.all')} <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-0">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (data?.pendingReviewsList.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('common.noData')}</p>
            ) : (
              data?.pendingReviewsList.slice(0, 8).map((r, idx) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between py-2.5 text-sm ${r.contract.facility.id ? 'cursor-pointer hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors' : ''} ${idx !== 0 ? 'border-t' : ''}`}
                  onClick={() => r.contract.facility.id && navigate(`/facilities/${r.contract.facility.id}`)}
                >
                  <div>
                    <div className="font-medium leading-none">{r.contract.facility.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{r.contract.customer.name} · #{r.contract.contractNumber}</div>
                  </div>
                  <Badge variant="warning" className="shrink-0">{r.scheduledMonth.slice(0, 7)}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Pending invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">{t('dashboard.recentInvoices')}</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => navigate('/invoices')}>
              {t('common.all')} <ArrowRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-0">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (data?.pendingInvoicesList.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t('common.noData')}</p>
            ) : (
              data?.pendingInvoicesList.slice(0, 8).map((inv, idx) => (
                <div
                  key={inv.id}
                  className={`flex items-center justify-between py-2.5 text-sm ${idx !== 0 ? 'border-t' : ''}`}
                >
                  <div>
                    <div className="font-medium leading-none">{inv.review.contract.facility.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">{inv.review.contract.customer.name} · #{inv.review.contract.contractNumber}</div>
                  </div>
                  <Badge variant="info" className="shrink-0">{formatDate(inv.createdAt)}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
