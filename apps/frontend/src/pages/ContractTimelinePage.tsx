import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CheckCircle, AlertCircle, Clock, Mail, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatScheduledMonth, formatDate } from '@/lib/utils';

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
  invoice: {
    id: string;
    invoiceNumber: string | null;
    completedAt: string | null;
    status: string;
  } | null;
}

interface MonthGroup {
  month: string;
  reviews: ReviewItem[];
}

function invoiceBadgeVariant(status: string): 'warning' | 'info' | 'success' | 'secondary' {
  if (status === 'completed') return 'success';
  if (status === 'pending') return 'warning';
  return 'info';
}

function reviewSortKey(r: ReviewItem): number {
  if (r.status === 'pending') return 0;
  if (r.status === 'in_progress') return 1;
  if (r.status === 'failed') return 2;
  if (r.invoice && r.invoice.status !== 'completed') return 3; // review done, invoice not done
  return 4; // fully done
}

function sortReviews(reviews: ReviewItem[]): ReviewItem[] {
  return [...reviews].sort((a, b) => reviewSortKey(a) - reviewSortKey(b));
}

function currentMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ContractTimelinePage() {
  const { t, i18n } = useTranslation();
  const [months, setMonths] = useState(6);
  const [data, setData] = useState<MonthGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set([currentMonthIso()]));

  const currentMonth = currentMonthIso();

  function toggleMonth(month: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      next.has(month) ? next.delete(month) : next.add(month);
      return next;
    });
  }

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
            const sorted = sortReviews(reviews);
            const completed = reviews.filter((r) => r.status === 'completed').length;
            const notDone = reviews.filter((r) => r.status !== 'completed').length;

            return (
              <Card key={month} className={isCurrentMonth ? 'border-primary' : ''}>
                <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => toggleMonth(month)}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {openMonths.has(month)
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
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

                {openMonths.has(month) && sorted.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="relative pl-6">
                      <div className="absolute left-2.5 top-0 bottom-0 w-px bg-border" />
                      {sorted.map((r, idx) => {
                        const isNotDone = r.status !== 'completed';
                        const invoiceNeedsAction = !!r.invoice && r.invoice.status !== 'completed';
                        const dotColor =
                          r.status === 'completed'
                            ? invoiceNeedsAction ? 'bg-amber-500' : 'bg-green-500'
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
                          <div key={r.id} className={`relative ${idx !== sorted.length - 1 ? 'pb-4' : ''}`}>
                            <div className={`absolute -left-[14px] top-1.5 h-3 w-3 rounded-full border-2 border-background ${dotColor}`} />
                            <div className="min-w-0">
                              {/* Main row: contract, customer/facility, status */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  to={`/facilities/${r.contract.facility.id}`}
                                  className={`text-sm font-medium hover:underline ${isNotDone && isCurrentMonth ? 'text-rose-600 dark:text-rose-400' : ''}`}
                                >
                                  {r.contract.facility.name}
                                </Link>
                                <span className="text-xs text-muted-foreground">
                                  {r.contract.customer.name} · {r.contract.contractNumber}
                                </span>
                                <span className="flex items-center gap-1 shrink-0">
                                  <span className="text-xs text-muted-foreground">{t('contractTimeline.review')}:</span>
                                  <Badge variant={badgeVariant} className="text-xs">
                                    {t(`reviews.${r.status}` as any)}
                                  </Badge>
                                </span>
                                {r.invoice && (
                                  <span className="flex items-center gap-1 shrink-0">
                                    <span className="text-xs text-muted-foreground">{t('contractTimeline.invoice')}:</span>
                                    <Badge variant={invoiceBadgeVariant(r.invoice.status)} className="text-xs">
                                      {t(`invoices.${r.invoice.status}` as any)}
                                    </Badge>
                                  </span>
                                )}
                                {((isNotDone && isCurrentMonth) || (!isNotDone && invoiceNeedsAction)) && (
                                  <span className={`flex items-center gap-0.5 text-xs ${!isNotDone && invoiceNeedsAction ? 'text-amber-500' : 'text-rose-500'}`}>
                                    <Clock className="h-3 w-3" />
                                    {t('contractTimeline.pendingAction')}
                                  </span>
                                )}
                              </div>

                              {/* Detail row: dates, checkmarks, invoice */}
                              {(r.completedAt || r.emailSent || r.smbSaved || r.invoice?.invoiceNumber) && (
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                  {r.completedAt && (
                                    <span>{t('reviews.reviewDone')}: {formatDate(r.completedAt, i18n.language === 'sl' ? 'sl-SI' : 'en-US')}</span>
                                  )}
                                  {r.completedBy && (
                                    <span>{t('reviews.completedBy')}: {r.completedBy.name}</span>
                                  )}
                                  {r.emailSent && (
                                    <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                                      <Mail className="h-3 w-3" />
                                      {t('reviews.emailSent')}
                                    </span>
                                  )}
                                  {r.smbSaved && (
                                    <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                                      <FolderOpen className="h-3 w-3" />
                                      {t('reviews.smbSaved')}
                                    </span>
                                  )}
                                  {(r.invoice?.invoiceNumber || r.invoice?.completedAt) && (r.completedAt || r.emailSent || r.smbSaved) && (
                                    <span className="border-l border-muted-foreground/40 h-3 self-center" />
                                  )}
                                  {r.invoice?.invoiceNumber && (
                                    <span>{t('reviews.invoiceNo')}: {r.invoice.invoiceNumber}</span>
                                  )}
                                  {r.invoice?.completedAt && (
                                    <span>{t('reviews.invoiceSent')}: {formatDate(r.invoice.completedAt, i18n.language === 'sl' ? 'sl-SI' : 'en-US')}</span>
                                  )}
                                </div>
                              )}
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
