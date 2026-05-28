import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, ArrowLeft, CheckCircle, XCircle, FilePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface Review {
  id: string;
  scheduledMonth: string;
  status: string;
  pdfFilename: string | null;
  completedAt: string | null;
  emailSent: boolean;
  smbSaved: boolean;
  completedBy: { name: string } | null;
}

interface Invoice {
  id: string;
  status: string;
  invoiceNumber: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface FacilityDetail {
  id: string;
  name: string;
  address: string | null;
  customer: { id: string; name: string };
  contracts: Array<{
    id: string;
    contractNumber: string;
    reviewFrequency: string;
    isActive: boolean;
  }>;
}

function currentMonthIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatScheduledMonth(s: string, lang: string) {
  const d = new Date(s + 'T00:00:00');
  return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(d);
}

function ReviewUpload({ reviewId, onSuccess }: { reviewId: string; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const result = await fetch(`/api/reviews/${reviewId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('servio-auth') ? JSON.parse(localStorage.getItem('servio-auth')!).state.token : ''}` },
        body: formData,
      });
      const data = await result.json();

      if (!result.ok) {
        throw new Error(data.error ?? 'Upload failed');
      }

      toast.success(t('reviews.completed'));
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [reviewId, onSuccess, t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'} ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          {uploading ? t('common.loading') : isDragActive ? 'Drop PDF here' : t('reviews.uploadPdf')}
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{t(`errors.${error.replace('errors.', '')}` as any, error)}</p>}
    </div>
  );
}

export default function FacilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: facility, isLoading: facilityLoading } = useQuery({
    queryKey: ['facility', id],
    queryFn: () => api.get<FacilityDetail>(`/facilities/${id}`),
    enabled: !!id,
  });

  const { data: reviewsData, isLoading: reviewsLoading, refetch: refetchReviews } = useQuery({
    queryKey: ['reviews', id],
    queryFn: () => api.get<{ data: Review[] }>(`/reviews?facilityId=${id}&limit=50`),
    enabled: !!id,
  });

  const activeContract = facility?.contracts.find((c) => c.isActive);

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-facility', activeContract?.id],
    queryFn: () => api.get<{ data: Invoice[] }>(`/invoices?contractId=${activeContract!.id}&limit=50`),
    enabled: !!activeContract?.id,
  });

  const createReviewMutation = useMutation({
    mutationFn: () =>
      api.post<Review>('/reviews', {
        contractId: activeContract!.id,
        scheduledMonth: currentMonthIso(),
      }),
    onSuccess: () => {
      refetchReviews();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(t('reviews.createReview'));
    },
    onError: () => {
      toast.error(t('errors.internal'));
    },
  });

  const canUpload = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technician';

  if (facilityLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!facility) return <div className="text-center py-20 text-muted-foreground">{t('common.noData')}</div>;

  const reviews = reviewsData?.data ?? [];
  const invoices = invoicesData?.data ?? [];
  const pendingReview = reviews.find((r) => r.status === 'pending');
  const hasCurrentMonthReview = reviews.some((r) => r.scheduledMonth === currentMonthIso());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{facility.name}</h1>
          <p className="text-sm text-muted-foreground">{facility.customer.name}</p>
        </div>
        {(user?.role === 'admin' || user?.role === 'manager') && (
          <Button className="ml-auto" onClick={() => navigate(`/facilities/${id}/edit`)}>
            {t('common.edit')}
          </Button>
        )}
      </div>

      <Tabs defaultValue="reviews">
        <TabsList>
          <TabsTrigger value="reviews">{t('reviews.title')}</TabsTrigger>
          <TabsTrigger value="invoices">{t('invoices.title')}</TabsTrigger>
          <TabsTrigger value="contract">{t('nav.contracts')}</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="space-y-4">
          {canUpload && activeContract && !hasCurrentMonthReview && (
            <Card>
              <CardContent className="pt-6 flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">{t('reviews.noReviewThisMonth')}</p>
                <Button
                  onClick={() => createReviewMutation.mutate()}
                  disabled={createReviewMutation.isPending}
                >
                  <FilePlus className="h-4 w-4 mr-2" />
                  {t('reviews.createReview')} — {formatScheduledMonth(currentMonthIso(), i18n.language)}
                </Button>
              </CardContent>
            </Card>
          )}

          {canUpload && pendingReview && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t('reviews.uploadPdf')}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="warning">{formatScheduledMonth(pendingReview.scheduledMonth, i18n.language)}</Badge>
                  <span className="text-sm text-muted-foreground">{t('reviews.pending')}</span>
                </div>
                <ReviewUpload
                  reviewId={pendingReview.id}
                  onSuccess={() => {
                    refetchReviews();
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                    queryClient.invalidateQueries({ queryKey: ['invoices-facility', activeContract?.id] });
                  }}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              {reviewsLoading ? <Skeleton className="h-48 w-full" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reviews.scheduledMonth')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead>{t('reviews.emailSent')}</TableHead>
                      <TableHead>{t('reviews.smbSaved')}</TableHead>
                      <TableHead>{t('reviews.completedAt')}</TableHead>
                      <TableHead>{t('reviews.completedBy')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviews.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{t('common.noData')}</TableCell></TableRow>
                    ) : reviews.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{formatScheduledMonth(r.scheduledMonth, i18n.language)}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'completed' ? 'success' : r.status === 'pending' ? 'warning' : 'destructive'}>
                            {t(`reviews.${r.status}` as any)}
                          </Badge>
                        </TableCell>
                        <TableCell>{r.emailSent ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                        <TableCell>{r.smbSaved ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}</TableCell>
                        <TableCell>{r.completedAt ? formatDateTime(r.completedAt) : '-'}</TableCell>
                        <TableCell>{r.completedBy?.name ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardContent className="pt-6">
              {invoicesLoading ? <Skeleton className="h-48 w-full" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead>{t('invoices.invoiceNumber')}</TableHead>
                      <TableHead>{t('invoices.createdAt')}</TableHead>
                      <TableHead>{t('invoices.completedAt')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t('common.noData')}</TableCell></TableRow>
                    ) : invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Badge variant={inv.status === 'completed' ? 'success' : 'warning'}>
                            {t(`invoices.${inv.status}` as any)}
                          </Badge>
                        </TableCell>
                        <TableCell>{inv.invoiceNumber ?? '-'}</TableCell>
                        <TableCell>{formatDateTime(inv.createdAt)}</TableCell>
                        <TableCell>{inv.completedAt ? formatDateTime(inv.completedAt) : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contract">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {facility.contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">#{c.contractNumber}</div>
                    <div className="text-sm text-muted-foreground">{t(`frequency.${c.reviewFrequency}` as any)}</div>
                  </div>
                  <Badge variant={c.isActive ? 'success' : 'secondary'}>{c.isActive ? t('common.active') : t('common.inactive')}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
