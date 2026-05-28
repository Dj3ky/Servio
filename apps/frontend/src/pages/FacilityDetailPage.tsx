import { useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, ArrowLeft, CheckCircle, XCircle, FilePlus, FileText, X, Trash2, FileDown } from 'lucide-react';
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

interface ContractDocument {
  filename: string;
  url: string;
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
    invoiceDelivery: 'email' | 'post' | 'e_invoice';
    contractDocuments: ContractDocument[] | null;
    startDate: string;
    endDate: string | null;
    valueWithoutVat: string | null;
    valueWithoutVatPerYear: string | null;
  }>;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
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
  invoiceDelivery,
  contractEmailTemplateId,
  onSuccess,
}: {
  reviewId: string;
  hasEmail: boolean;
  invoiceDelivery: 'email' | 'post' | 'e_invoice';
  contractEmailTemplateId?: string | null;
  onSuccess: () => void;
}) {
  const sendEmail = invoiceDelivery === 'email';
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
      const text = await result.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
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

      {!sendEmail && (
        <p className="text-sm text-muted-foreground">{t(`invoiceDelivery.saveOnly.${invoiceDelivery}`)}</p>
      )}

      {sendEmail && hasEmail && (
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

  const docInputRef = useRef<HTMLInputElement>(null);
  const [docUploading, setDocUploading] = useState(false);

  const { data: facility, isLoading: facilityLoading, refetch: refetchFacility } = useQuery({
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

  // Audit log for this facility (filtered by entityId)
  const auditObserverRef = useRef<IntersectionObserver | null>(null);
  const { data: auditData, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading: auditLoading } = useInfiniteQuery({
    queryKey: ['audit-logs-facility', id],
    queryFn: ({ pageParam = 1 }) =>
      api.get<{ data: AuditLogEntry[]; total: number; totalPages: number }>(
        `/audit-logs?entityId=${id}&page=${pageParam}&limit=30`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      (lastPageParam as number) < lastPage.totalPages ? (lastPageParam as number) + 1 : undefined,
    enabled: !!id,
  });

  const auditLoadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (auditObserverRef.current) auditObserverRef.current.disconnect();
    if (!node) return;
    auditObserverRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    });
    auditObserverRef.current.observe(node);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const auditEntries = auditData?.pages.flatMap((p) => p.data) ?? [];

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

  const sendAccountingMutation = useMutation({
    mutationFn: (invoiceId: string) => api.post(`/invoices/${invoiceId}/send-accounting`, {}),
    onSuccess: () => toast.success(t('invoices.sentToAccounting')),
    onError: (err: any) => toast.error(err?.message ?? t('errors.internal')),
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ invoiceId, status, num }: { invoiceId: string; status: string; num?: string }) =>
      api.patch(`/invoices/${invoiceId}`, { status, invoiceNumber: num || undefined }),
    onMutate: async ({ invoiceId, status, num }) => {
      await queryClient.cancelQueries({ queryKey: ['invoices-facility', activeContract?.id] });
      const previous = queryClient.getQueryData<{ data: Invoice[] }>(['invoices-facility', activeContract?.id]);
      queryClient.setQueryData<{ data: Invoice[] }>(['invoices-facility', activeContract?.id], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((inv) =>
            inv.id === invoiceId ? { ...inv, status, invoiceNumber: num || inv.invoiceNumber } : inv,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['invoices-facility', activeContract?.id], context.previous);
      toast.error(t('errors.internal'));
    },
    onSuccess: () => {
      toast.success(t('common.save'));
      refetchInvoices();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setInvoiceDialog(null);
      setInvoiceNumber('');
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: ({ contractId, filename }: { contractId: string; filename: string }) =>
      api.delete(`/contracts/${contractId}/documents/${encodeURIComponent(filename)}`),
    onSuccess: () => { toast.success(t('common.delete')); refetchFacility(); },
    onError: () => toast.error(t('errors.internal')),
  });

  async function handleDocUpload(file: File) {
    if (!activeContract) return;
    setDocUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/contracts/${activeContract.id}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      if (!res.ok) throw new Error();
      toast.success(t('common.save'));
      refetchFacility();
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setDocUploading(false);
    }
  }

  function openInvoiceDialog(invoice: Invoice, targetStatus: string) {
    setInvoiceDialog({ invoice, targetStatus });
    setInvoiceNumber(invoice.invoiceNumber ?? '');
  }

  const canUpload = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technician';
  const canManageInvoices = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'accountant';
  const canManageContracts = user?.role === 'admin' || user?.role === 'manager';

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
  const pendingInvoices = invoices.filter((inv) => inv.status !== 'completed');
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

  const contractDocs = activeContract?.contractDocuments ?? [];

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
        {canManageContracts && (
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
          <TabsTrigger value="auditlog">{t('nav.auditLog')}</TabsTrigger>
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
                  invoiceDelivery={activeContract?.invoiceDelivery ?? 'email'}
                  contractEmailTemplateId={activeContract?.emailTemplateId}
                  onSuccess={handleUploadSuccess}
                />
              </CardContent>
            </Card>
          )}

          {canManageInvoices && pendingInvoices.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {t('invoices.pendingTitle')}
                  <Badge variant="warning">{pendingInvoices.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Badge variant={invoiceBadgeVariant(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
                      <span className="text-sm text-muted-foreground">{formatDateTime(inv.createdAt)}</span>
                      {inv.invoiceNumber && <span className="text-sm font-medium">{inv.invoiceNumber}</span>}
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
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
                      {activeContract?.invoiceDelivery !== 'email' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={sendAccountingMutation.isPending}
                          onClick={() => sendAccountingMutation.mutate(inv.id)}
                        >
                          {t('invoices.sendToAccounting')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
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
                            {inv.status !== 'completed' ? (
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
                            ) : null}
                            {activeContract?.invoiceDelivery !== 'email' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="mt-1"
                                disabled={sendAccountingMutation.isPending}
                                onClick={() => sendAccountingMutation.mutate(inv.id)}
                              >
                                {t('invoices.sendToAccounting')}
                              </Button>
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
        <TabsContent value="contract" className="space-y-4">
          {facility.contracts.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">#{c.contractNumber}</div>
                    <div className="text-sm text-muted-foreground">{t(`frequency.${c.reviewFrequency}` as any)}</div>
                  </div>
                  <Badge variant={c.isActive ? 'success' : 'secondary'}>
                    {c.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </div>
                {(c.startDate || c.endDate) && (
                  <div className="text-sm text-muted-foreground">
                    {c.startDate} {c.endDate ? `→ ${c.endDate}` : ''}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Contract documents */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('facility.contractDocuments')}</CardTitle>
              {canManageContracts && activeContract && (
                <>
                  <input
                    ref={docInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocUpload(f); e.target.value = ''; }}
                  />
                  <Button size="sm" variant="outline" disabled={docUploading} onClick={() => docInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />
                    {docUploading ? t('common.loading') : t('common.upload')}
                  </Button>
                </>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {contractDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t('common.noData')}</p>
              ) : contractDocs.map((doc) => (
                <div key={doc.url} className="flex items-center gap-3 rounded border px-3 py-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm truncate">{doc.filename}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                      <a href={doc.url} download={doc.filename} target="_blank" rel="noreferrer">
                        <FileDown className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    {canManageContracts && activeContract && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteDocMutation.mutate({ contractId: activeContract.id, filename: doc.filename })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AUDIT LOG TAB ── */}
        <TabsContent value="auditlog">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('auditLog.timestamp')}</TableHead>
                    <TableHead>{t('auditLog.user')}</TableHead>
                    <TableHead>{t('auditLog.action')}</TableHead>
                    <TableHead>{t('auditLog.entity')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLoading ? [...Array(5)].map((_, i) => (
                    <TableRow key={i}>{[...Array(4)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : auditEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-10">{t('common.noData')}</TableCell></TableRow>
                  ) : auditEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs">{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell className="text-sm">{entry.userEmail ?? '-'}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{entry.action}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.entityType ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isFetchingNextPage && (
                <div className="py-3 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
              )}
              <div ref={auditLoadMoreRef} className="h-4" />
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
