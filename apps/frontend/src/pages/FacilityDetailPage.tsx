import { useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { Upload, ArrowLeft, CheckCircle, XCircle, FilePlus, FileText, Trash2, FileDown, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDate, formatDateTime } from '@/lib/utils';
import { SendAccountingDialog } from '@/components/SendAccountingDialog';
import { FacilityFormDialog } from '@/components/FacilityFormDialog';
import { ReviewUploadDialog } from '@/components/ReviewUploadDialog';
import { InvoiceEmailDialog } from '@/components/InvoiceEmailDialog';
import { useAuthStore } from '@/stores/authStore';

interface Review {
  id: string;
  scheduledMonth: string;
  status: string;
  pdfFilename: string | null;
  createdAt: string;
  completedAt: string | null;
  emailSent: boolean;
  smbSaved: boolean;
  completedBy: { name: string } | null;
}

interface Invoice {
  id: string;
  reviewId: string;
  status: string;
  invoiceNumber: string | null;
  createdAt: string;
  completedAt: string | null;
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
    invoiceEmail: string | null;
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

function getToken() {
  try {
    return JSON.parse(localStorage.getItem('servio-auth') ?? '{}').state?.token ?? '';
  } catch {
    return '';
  }
}

export default function FacilityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [invoiceDialog, setInvoiceDialog] = useState<Invoice | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [accountingInvoice, setAccountingInvoice] = useState<Invoice | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [emailInvoiceTarget, setEmailInvoiceTarget] = useState<Invoice | null>(null);

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

  const resetReviewMutation = useMutation({
    mutationFn: (reviewId: string) => api.post(`/reviews/${reviewId}/reset`, {}),
    onSuccess: () => {
      refetchReviews();
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['invoices-facility', activeContract?.id] });
      refetchInvoices();
      toast.success(t('reviews.resetSuccess'));
      setResetTarget(null);
    },
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

  function openInvoiceDialog(invoice: Invoice) {
    setInvoiceDialog(invoice);
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
  const invoiceByReviewId = Object.fromEntries(invoices.map((inv) => [inv.reviewId, inv]));
  const hasCurrentMonthReview = reviews.some((r) => r.scheduledMonth === currentMonthIso());
  const hasEmail = !!(activeContract?.customerEmail || facility.customer.email);
  const hasInvoiceEmail = !!activeContract?.invoiceEmail;

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
      e_invoice_created: t('invoices.eInvoiceCreated'),
      completed: t('invoices.completed'),
    };
    return labels[status] ?? status;
  }

  function invoiceBadgeVariant(status: string): 'warning' | 'info' | 'success' | 'secondary' {
    if (status === 'completed') return 'success';
    if (status === 'pending') return 'warning';
    return 'info';
  }


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
          <Button className="ml-auto" onClick={() => setEditDialogOpen(true)}>
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
              <CardContent className="pt-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="warning">{formatScheduledMonth(pendingReview.scheduledMonth, i18n.language)}</Badge>
                  <span>{t('reviews.pending')}</span>
                </div>
                <Button onClick={() => setUploadDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('reviews.uploadPdf')}
                </Button>
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
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => openInvoiceDialog(inv)}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={invoiceBadgeVariant(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
                      <span className="text-sm text-muted-foreground">{formatDate(inv.createdAt)}</span>
                      {inv.invoiceNumber && <span className="text-sm font-medium">{inv.invoiceNumber}</span>}
                    </div>
                    {activeContract?.invoiceDelivery === 'e_invoice' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => { e.stopPropagation(); setAccountingInvoice(inv); }}
                      >
                        {t('invoices.sendToAccounting')}
                      </Button>
                    )}
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
                      <TableHead>{t('reviews.createdAt')}</TableHead>
                      <TableHead>{t('reviews.completedAt')}</TableHead>
                      <TableHead>{t('reviews.completedBy')}</TableHead>
                      <TableHead>{t('reviews.invoiceNo')}</TableHead>
                      <TableHead>{t('reviews.invoiceCreated')}</TableHead>
                      <TableHead>{t('reviews.invoiceSent')}</TableHead>
                      {user?.role === 'admin' && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviews.length === 0 ? (
                      <TableRow><TableCell colSpan={user?.role === 'admin' ? 11 : 10} className="text-center text-muted-foreground">{t('common.noData')}</TableCell></TableRow>
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
                        <TableCell className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                        <TableCell>{r.completedAt ? formatDateTime(r.completedAt) : '-'}</TableCell>
                        <TableCell>{r.completedBy?.name ?? '-'}</TableCell>
                        <TableCell className="text-sm">
                          {invoiceByReviewId[r.id]?.invoiceNumber
                            ? <button className="hover:underline font-mono text-xs" onClick={() => openInvoiceDialog(invoiceByReviewId[r.id])}>{invoiceByReviewId[r.id].invoiceNumber}</button>
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {invoiceByReviewId[r.id]
                            ? <button className="hover:underline" onClick={() => openInvoiceDialog(invoiceByReviewId[r.id])}>{formatDate(invoiceByReviewId[r.id].createdAt)}</button>
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {invoiceByReviewId[r.id]?.completedAt ? formatDate(invoiceByReviewId[r.id].completedAt!) : '-'}
                        </TableCell>
                        {user?.role === 'admin' && (
                          <TableCell className="text-right">
                            {r.status === 'completed' && r.scheduledMonth === currentMonthIso() && (
                              <Button size="sm" variant="outline" onClick={() => setResetTarget(r.id)}>
                                <RotateCcw className="h-3 w-3 mr-1" />
                                {t('reviews.resetReview')}
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
                      <TableRow
                        key={inv.id}
                        className={canManageInvoices ? 'cursor-pointer transition-colors' : ''}
                        onClick={() => canManageInvoices && openInvoiceDialog(inv)}
                      >
                        <TableCell>
                          <Badge variant={invoiceBadgeVariant(inv.status)}>
                            {invoiceStatusLabel(inv.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{inv.invoiceNumber ?? '-'}</TableCell>
                        <TableCell>{formatDate(inv.createdAt)}</TableCell>
                        <TableCell>{inv.completedAt ? formatDateTime(inv.completedAt) : '-'}</TableCell>
                        {canManageInvoices && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {activeContract?.invoiceDelivery === 'e_invoice' && (
                              <Button size="sm" variant="secondary" onClick={() => setAccountingInvoice(inv)}>
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
                    <div className="font-medium">{c.contractNumber}</div>
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

      {/* Invoice action dialog */}
      <Dialog open={!!invoiceDialog} onOpenChange={() => { setInvoiceDialog(null); setInvoiceNumber(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoices.title')}</DialogTitle>
            {invoiceDialog && (
              <p className="text-sm text-muted-foreground">
                {t('invoices.createdAt')}: {formatDateTime(invoiceDialog.createdAt)}
                {invoiceDialog.invoiceNumber && ` · ${invoiceDialog.invoiceNumber}`}
              </p>
            )}
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
          <DialogFooter className="flex-wrap gap-2 sm:justify-start">
            <Button variant="outline" onClick={() => { setInvoiceDialog(null); setInvoiceNumber(''); }}>
              {t('common.cancel')}
            </Button>
            {invoiceDialog?.status === 'pending' && activeContract?.invoiceDelivery === 'email' && (
              <Button variant="outline" onClick={() => { setEmailInvoiceTarget(invoiceDialog); setInvoiceDialog(null); }}>
                {t('invoices.sendByEmail')}
              </Button>
            )}
            {invoiceDialog?.status === 'pending' && activeContract?.invoiceDelivery === 'post' && (
              <Button variant="outline" disabled={updateInvoiceMutation.isPending} onClick={() => invoiceDialog && updateInvoiceMutation.mutate({ invoiceId: invoiceDialog.id, status: 'sent_post', num: invoiceNumber })}>
                {t('invoices.markSentPost')}
              </Button>
            )}
            {invoiceDialog?.status === 'pending' && activeContract?.invoiceDelivery === 'e_invoice' && (
              <Button variant="outline" disabled={updateInvoiceMutation.isPending} onClick={() => invoiceDialog && updateInvoiceMutation.mutate({ invoiceId: invoiceDialog.id, status: 'e_invoice_created', num: invoiceNumber })}>
                {t('invoices.markEInvoiceCreated')}
              </Button>
            )}
            {invoiceDialog?.status !== 'completed' && (
              <Button disabled={updateInvoiceMutation.isPending} onClick={() => invoiceDialog && updateInvoiceMutation.mutate({ invoiceId: invoiceDialog.id, status: 'completed', num: invoiceNumber })}>
                {updateInvoiceMutation.isPending ? t('common.loading') : t('invoices.markCompleted')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reviews.resetReview')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('reviews.resetConfirm')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={resetReviewMutation.isPending}
              onClick={() => resetTarget && resetReviewMutation.mutate(resetTarget)}
            >
              {resetReviewMutation.isPending ? t('common.loading') : t('reviews.resetReview')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendAccountingDialog
        invoice={accountingInvoice && facility && activeContract ? {
          id: accountingInvoice.id,
          customerName: facility.customer.name,
          facilityName: facility.name,
          contractNumber: activeContract.contractNumber,
          scheduledMonth: accountingInvoice.createdAt.slice(0, 7),
          invoiceNumber: accountingInvoice.invoiceNumber,
        } : null}
        onClose={() => setAccountingInvoice(null)}
        invalidateKeys={activeContract ? [['invoices-facility', activeContract.id]] : []}
      />

      <FacilityFormDialog
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); refetchFacility(); }}
        facilityId={id}
      />

      {pendingReview && (
        <ReviewUploadDialog
          open={uploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          reviewId={pendingReview.id}
          hasEmail={hasEmail}
          invoiceDelivery={activeContract?.invoiceDelivery ?? 'email'}
          contractEmailTemplateId={activeContract?.emailTemplateId}
          scheduledMonth={pendingReview.scheduledMonth}
          onSuccess={handleUploadSuccess}
        />
      )}

      {emailInvoiceTarget && (
        <InvoiceEmailDialog
          open={!!emailInvoiceTarget}
          onClose={() => setEmailInvoiceTarget(null)}
          invoiceId={emailInvoiceTarget.id}
          invoiceNumber={emailInvoiceTarget.invoiceNumber}
          hasEmail={hasInvoiceEmail}
          onSuccess={() => {
            setEmailInvoiceTarget(null);
            refetchInvoices();
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </div>
  );
}
