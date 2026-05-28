import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, ArrowLeft, CheckCircle, XCircle, FilePlus, FileText, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  language: string;
  isDefault: boolean;
}

interface FacilityDetail {
  id: string;
  name: string;
  address: string | null;
  customer: { id: string; name: string; email: string | null };
  contracts: Array<{
    id: string;
    contractNumber: string;
    reviewFrequency: string;
    isActive: boolean;
    customerEmail: string | null;
    emailTemplateId: string | null;
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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getToken() {
  try {
    return JSON.parse(localStorage.getItem('servio-auth') ?? '{}').state?.token ?? '';
  } catch {
    return '';
  }
}

function ReviewUpload({
  reviewId,
  hasEmail,
  contractEmailTemplateId,
  onSuccess,
}: {
  reviewId: string;
  hasEmail: boolean;
  contractEmailTemplateId?: string | null;
  onSuccess: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/settings/templates'),
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;
    setFile(f);
    setError(null);

    const preferred = templates.find((tpl) => tpl.id === contractEmailTemplateId)
      ?? templates.find((tpl) => tpl.isDefault)
      ?? templates[0];

    if (preferred) {
      setSelectedTemplateId(preferred.id);
      setEmailSubject(preferred.subject);
      setEmailBody(preferred.body);
    }
  }, [templates, contractEmailTemplateId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: uploading || !!file,
  });

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setEmailSubject(tpl.subject);
      setEmailBody(tpl.body);
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (emailSubject) formData.append('emailSubject', emailSubject);
    if (emailBody) formData.append('emailBody', emailBody);
    if (selectedTemplateId) formData.append('emailTemplateId', selectedTemplateId);

    try {
      const result = await fetch(`/api/reviews/${reviewId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? 'Upload failed');
      toast.success(t('reviews.uploadSuccess'));
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (!file) {
    return (
      <div>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">{t('reviews.dropOrClick')}</p>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
        </div>
        <Button
          variant="ghost" size="icon" className="h-7 w-7 shrink-0"
          onClick={() => { setFile(null); setError(null); }}
          disabled={uploading}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {!hasEmail && (
        <p className="text-sm text-muted-foreground">{t('reviews.noEmailConfigured')}</p>
      )}

      {hasEmail && (
        <>
          <Separator />
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('reviews.emailTemplate')}</Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                <SelectTrigger><SelectValue placeholder={t('reviews.noTemplate')} /></SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                      {tpl.isDefault && <span className="ml-2 text-xs text-muted-foreground">(default)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('reviews.emailSubject')}</Label>
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder={t('reviews.emailSubject')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('reviews.emailBody')}</Label>
            <Textarea rows={7} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder={t('reviews.emailBody')} className="font-mono text-sm resize-y" />
            <p className="text-xs text-muted-foreground">{'{{customer_name}}, {{facility_name}}, {{month}}, {{year}}, {{contract_number}}'}</p>
          </div>
          <Separator />
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={handleConfirm} disabled={uploading} size="lg">
          {uploading ? t('common.loading') : t('common.execute')}
        </Button>
      </div>
    </div>
  );
}

export default function FacilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [invoiceDialog, setInvoiceDialog] = useState<{ invoice: Invoice; targetStatus: string } | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');

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

  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery({
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
    onError: () => toast.error(t('errors.internal')),
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ invoiceId, status, num }: { invoiceId: string; status: string; num?: string }) =>
      api.patch(`/invoices/${invoiceId}`, { status, invoiceNumber: num || undefined }),
    onSuccess: () => {
      toast.success(t('common.save'));
      refetchInvoices();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setInvoiceDialog(null);
      setInvoiceNumber('');
    },
    onError: () => toast.error(t('errors.internal')),
  });

  function openInvoiceDialog(invoice: Invoice, targetStatus: string) {
    setInvoiceDialog({ invoice, targetStatus });
    setInvoiceNumber(invoice.invoiceNumber ?? '');
  }

  const canUpload = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technician';
  const canManageInvoices = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'accountant';

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
  const hasEmail = !!(activeContract?.customerEmail || facility.customer.email);

  function handleUploadSuccess() {
    refetchReviews();
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['invoices-facility', activeContract?.id] });
    refetchInvoices();
  }

  function invoiceStatusLabel(status: string) {
    const labels: Record<string, string> = {
      pending: t('invoices.pending'),
      sent_email: t('invoices.sentEmail'),
      sent_post: t('invoices.sentPost'),
      completed: t('invoices.completed'),
    };
    return labels[status] ?? status;
  }

  function invoiceBadgeVariant(status: string): 'warning' | 'info' | 'success' | 'secondary' {
    if (status === 'completed') return 'success';
    if (status === 'pending') return 'warning';
    return 'info';
  }

  const dialogTitle = invoiceDialog
    ? invoiceDialog.targetStatus === 'completed'
      ? t('invoices.markCompleted')
      : invoiceDialog.targetStatus === 'sent_email'
        ? t('invoices.markSentEmail')
        : t('invoices.markSentPost')
    : '';

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

        {/* ── REVIEWS TAB ── */}
        <TabsContent value="reviews" className="space-y-4">
          {canUpload && activeContract && !hasCurrentMonthReview && (
            <Card>
              <CardContent className="pt-6 flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">{t('reviews.noReviewThisMonth')}</p>
                <Button onClick={() => createReviewMutation.mutate()} disabled={createReviewMutation.isPending}>
                  <FilePlus className="h-4 w-4 mr-2" />
                  {t('reviews.createReview')} — {formatScheduledMonth(currentMonthIso(), i18n.language)}
                </Button>
              </CardContent>
            </Card>
          )}

          {canUpload && pendingReview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {t('reviews.uploadPdf')}
                  <Badge variant="warning">{formatScheduledMonth(pendingReview.scheduledMonth, i18n.language)}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ReviewUpload
                  reviewId={pendingReview.id}
                  hasEmail={hasEmail}
                  contractEmailTemplateId={activeContract?.emailTemplateId}
                  onSuccess={handleUploadSuccess}
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

        {/* ── INVOICES TAB ── */}
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
                      {canManageInvoices && <TableHead>{t('common.actions')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canManageInvoices ? 5 : 4} className="text-center text-muted-foreground">
                          {t('common.noData')}
                        </TableCell>
                      </TableRow>
                    ) : invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Badge variant={invoiceBadgeVariant(inv.status)}>
                            {invoiceStatusLabel(inv.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{inv.invoiceNumber ?? '-'}</TableCell>
                        <TableCell>{formatDateTime(inv.createdAt)}</TableCell>
                        <TableCell>{inv.completedAt ? formatDateTime(inv.completedAt) : '-'}</TableCell>
                        {canManageInvoices && (
                          <TableCell>
                            {inv.status !== 'completed' && (
                              <div className="flex gap-1 flex-wrap">
                                {inv.status === 'pending' && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => openInvoiceDialog(inv, 'sent_email')}>
                                      {t('invoices.markSentEmail')}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => openInvoiceDialog(inv, 'sent_post')}>
                                      {t('invoices.markSentPost')}
                                    </Button>
                                  </>
                                )}
                                <Button size="sm" onClick={() => openInvoiceDialog(inv, 'completed')}>
                                  {t('invoices.markCompleted')}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CONTRACT TAB ── */}
        <TabsContent value="contract">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {facility.contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">#{c.contractNumber}</div>
                    <div className="text-sm text-muted-foreground">{t(`frequency.${c.reviewFrequency}` as any)}</div>
                  </div>
                  <Badge variant={c.isActive ? 'success' : 'secondary'}>
                    {c.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice confirm dialog */}
      <Dialog open={!!invoiceDialog} onOpenChange={() => { setInvoiceDialog(null); setInvoiceNumber(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-num">{t('invoices.invoiceNumber')}</Label>
              <Input
                id="inv-num"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-2025-001"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInvoiceDialog(null); setInvoiceNumber(''); }}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={updateInvoiceMutation.isPending}
              onClick={() => invoiceDialog && updateInvoiceMutation.mutate({
                invoiceId: invoiceDialog.invoice.id,
                status: invoiceDialog.targetStatus,
                num: invoiceNumber,
              })}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
