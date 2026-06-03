import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatScheduledMonth } from '@/lib/utils';

interface ReviewItem {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  scheduledMonth: string;
  completedAt: string | null;
  emailSent: boolean;
  smbSaved: boolean;
  completedBy: { id: string; name: string } | null;
  contract: {
    id: string;
    contractNumber: string;
    customer: { id: string; name: string };
    facility: { id: string; name: string };
  };
}

interface MonthGroup {
  month: string;
  reviews: ReviewItem[];
}

function currentMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ContractTimelinePage() {
  const { t, i18n } = useTranslation();
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<MonthGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const currentMonth = currentMonthIso();

  useEffect(() => {
    const token = JSON.parse(localStorage.getItem('servio-auth') ?? '{}')?.state?.token;
    setLoading(true);
    fetch(`/api/reviews/monthly-overview?months=${months}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [months]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('contractTimeline.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('contractTimeline.subtitle')}</p>
        </div>
        <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">{t('contractTimeline.last6Months')}</SelectItem>
            <SelectItem value="12">{t('contractTimeline.last12Months')}</SelectItem>
            <SelectItem value="24">{t('contractTimeline.last24Months')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {data.map(({ month, reviews }) => {
            const isCurrentMonth = month === currentMonth;
            const completed = reviews.filter((r) => r.status === 'completed').length;
            const notDone = reviews.filter((r) => r.status !== 'completed').length;

            return (
              <Card key={month} className={isCurrentMonth ? 'border-primary' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                      <CardTitle className="text-base">
                        {formatScheduledMonth(month, i18n.language)}
                      </CardTitle>
                      {isCurrentMonth && (
                        <Badge variant="outline" className="text-xs border-primary text-primary">
                          {t('contractTimeline.currentMonth')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {completed > 0 && (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-3.5 w-3.5" />
                          {completed} {t('reviews.completed').toLowerCase()}
                        </span>
                      )}
                      {notDone > 0 && (
                        <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {notDone} {t('contractTimeline.notDone')}
                        </span>
                      )}
                      {reviews.length === 0 && (
                        <span className="text-muted-foreground">{t('contractTimeline.noReviews')}</span>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {reviews.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="relative pl-6">
                      <div className="absolute left-2.5 top-0 bottom-0 w-px bg-border" />
                      {reviews.map((r, idx) => {
                        const isNotDone = r.status !== 'completed';
                        const dotColor =
                          r.status === 'completed'
                            ? 'bg-green-500'
                            : r.status === 'in_progress'
                              ? 'bg-blue-500'
                              : r.status === 'failed'
                                ? 'bg-rose-500'
                                : isCurrentMonth
                                  ? 'bg-rose-500'
                                  : 'bg-amber-500';

                        const badgeVariant =
                          r.status === 'completed'
                            ? 'success'
                            : r.status === 'failed' || isCurrentMonth
                              ? 'destructive'
                              : 'warning';

                        return (
                          <div key={r.id} className={`relative ${idx !== reviews.length - 1 ? 'pb-4' : ''}`}>
                            <div className={`absolute -left-[14px] top-1.5 h-3 w-3 rounded-full border-2 border-background ${dotColor}`} />
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Link
                                    to={`/facilities/${r.contract.facility.id}`}
                                    className={`text-sm font-medium hover:underline ${isNotDone && isCurrentMonth ? 'text-rose-600 dark:text-rose-400' : ''}`}
                                  >
                                    {r.contract.contractNumber}
                                  </Link>
                                  <span className="text-xs text-muted-foreground truncate">
                                    {r.contract.customer.name} · {r.contract.facility.name}
                                  </span>
                                  <Badge variant={badgeVariant} className="text-xs shrink-0">
                                    {t(`reviews.${r.status}` as any)}
                                  </Badge>
                                  {isNotDone && isCurrentMonth && (
                                    <span className="flex items-center gap-0.5 text-xs text-rose-500">
                                      <Clock className="h-3 w-3" />
                                      {t('contractTimeline.pendingAction')}
                                    </span>
                                  )}
                                </div>
                                {r.completedAt && r.completedBy && (
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    {t('reviews.completedBy')}: {r.completedBy.name}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
