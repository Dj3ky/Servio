import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  type SortingState,
} from '@tanstack/react-table';
import { Plus, Search, ChevronUp, ChevronDown, ChevronsUpDown, Upload, FileUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useDebounce } from '@/hooks/useDebounce';

interface ImportResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

function getToken() {
  try { return JSON.parse(localStorage.getItem('servio-auth') ?? '{}').state?.token ?? ''; } catch { return ''; }
}

interface ContractRow {
  id: string;
  contractNumber: string;
  reviewFrequency: string;
  isActive: boolean;
  customer: { name: string };
  facility: { name: string; id: string };
  assignedTechnician: { name: string } | null;
  currentReview?: { status: string } | null;
  currentInvoice?: { id: string; status: string; invoiceNumber: string | null } | null;
}

const REVIEW_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  completed: 'success',
  pending: 'warning',
  in_progress: 'info' as any,
  failed: 'destructive',
};

const INVOICE_STATUS_VARIANT: Record<string, 'success' | 'info' | 'secondary' | 'warning'> = {
  completed: 'success',
  pending: 'warning',
  sent_email: 'info',
  sent_post: 'info',
};

export default function ContractsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const [invoiceDialog, setInvoiceDialog] = useState<{ invoiceId: string; targetStatus: string; currentNumber: string | null } | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ id, status, num }: { id: string; status: string; num?: string }) =>
      api.patch(`/invoices/${id}`, { status, invoiceNumber: num || undefined }),
    onSuccess: () => {
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setInvoiceDialog(null);
      setInvoiceNumber('');
    },
    onError: () => toast.error(t('errors.internal')),
  });

  function openInvoiceDialog(invoiceId: string, targetStatus: string, currentNumber: string | null) {
    setInvoiceDialog({ invoiceId, targetStatus, currentNumber });
    setInvoiceNumber(currentNumber ?? '');
  }

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function handleCsvImport(file: File) {
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/contracts/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const data: ImportResult = await res.json();
      if (!res.ok) { toast.error(t('errors.internal')); return; }
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setImporting(false);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', debouncedSearch, page, sorting],
    queryFn: () => api.get<{ data: ContractRow[]; total: number; totalPages: number }>(
      `/contracts?search=${encodeURIComponent(debouncedSearch)}&page=${page}&limit=50`,
    ),
  });

  const columnHelper = createColumnHelper<ContractRow>();

  const columns = [
    columnHelper.accessor('customer.name', { header: t('contracts.customer'), cell: (info) => <span className="font-medium">{info.getValue()}</span> }),
    columnHelper.accessor('facility.name', { header: t('contracts.facility') }),
    columnHelper.accessor('contractNumber', { header: t('contracts.contractNumber') }),
    columnHelper.accessor('reviewFrequency', {
      header: t('contracts.frequency'),
      cell: (info) => t(`frequency.${info.getValue()}` as any),
    }),
    columnHelper.accessor('assignedTechnician', {
      header: t('contracts.technician'),
      cell: (info) => info.getValue()?.name ?? '-',
    }),
    columnHelper.accessor('currentReview', {
      header: t('contracts.reviewStatus'),
      cell: (info) => {
        const status = info.getValue()?.status;
        if (!status) return <Badge variant="secondary">-</Badge>;
        return <Badge variant={REVIEW_STATUS_VARIANT[status] ?? 'secondary'}>{t(`reviews.${status}` as any)}</Badge>;
      },
    }),
    columnHelper.accessor('currentInvoice', {
      header: t('contracts.invoiceStatus'),
      cell: (info) => {
        const status = info.getValue()?.status;
        if (!status) return <Badge variant="secondary">-</Badge>;
        return <Badge variant={INVOICE_STATUS_VARIANT[status] ?? 'secondary'}>{t(`invoices.${status}` as any)}</Badge>;
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const inv = row.original.currentInvoice;
        const canManageInvoices = user?.role === 'admin' || user?.role === 'accountant';
        const showInvoiceActions = canManageInvoices && inv && inv.status !== 'completed';
        return (
          <div className="flex justify-end gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {(user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technician') && row.original.currentReview?.status === 'pending' && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/facilities/${row.original.facility.id}`)}>
                <Upload className="h-3 w-3 mr-1" />
                {t('reviews.uploadPdf')}
              </Button>
            )}
            {showInvoiceActions && (
              <>
                {inv.status === 'pending' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openInvoiceDialog(inv.id, 'sent_email', inv.invoiceNumber)}>
                      {t('invoices.markSentEmail')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openInvoiceDialog(inv.id, 'sent_post', inv.invoiceNumber)}>
                      {t('invoices.markSentPost')}
                    </Button>
                  </>
                )}
                <Button size="sm" onClick={() => openInvoiceDialog(inv.id, 'completed', inv.invoiceNumber)}>
                  {t('invoices.markCompleted')}
                </Button>
              </>
            )}
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: data?.totalPages ?? 0,
  });

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('contracts.title')}</h1>
        {canManage && (
          <div className="flex gap-2">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvImport(f); e.target.value = ''; }}
            />
            <Button variant="outline" disabled={importing} onClick={() => csvInputRef.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" />
              {importing ? t('common.loading') : t('contracts.importCsv')}
            </Button>
            <Button onClick={() => navigate('/facilities/new')}>
              <Plus className="mr-2 h-4 w-4" />
              {t('contracts.addContract')}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t('common.search')} className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''} onClick={header.column.getToggleSortingHandler()}>
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        header.column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" /> :
                        header.column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" /> :
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-10 text-muted-foreground">{t('common.noData')}</TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/facilities/${row.original.facility.id}`)}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('common.total')}: {data.total}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('common.previous')}</Button>
            <span>{t('common.page')} {page} {t('common.of')} {data.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>{t('common.next')}</Button>
          </div>
        </div>
      )}

      <Dialog open={!!invoiceDialog} onOpenChange={(open) => { if (!open) { setInvoiceDialog(null); setInvoiceNumber(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {invoiceDialog?.targetStatus === 'completed' ? t('invoices.markCompleted') :
               invoiceDialog?.targetStatus === 'sent_email' ? t('invoices.markSentEmail') :
               t('invoices.markSentPost')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-num-contracts">{t('invoices.invoiceNumber')}</Label>
              <Input
                id="inv-num-contracts"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-2025-001"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInvoiceDialog(null); setInvoiceNumber(''); }}>{t('common.cancel')}</Button>
            <Button
              disabled={updateInvoiceMutation.isPending}
              onClick={() => invoiceDialog && updateInvoiceMutation.mutate({ id: invoiceDialog.invoiceId, status: invoiceDialog.targetStatus, num: invoiceNumber })}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!importResult} onOpenChange={(open) => { if (!open) setImportResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('contracts.importResult')}</DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-4">
                <span className="text-green-600 font-medium">{t('contracts.importCreated')}: {importResult.created.length}</span>
                <span className="text-yellow-600 font-medium">{t('contracts.importSkipped')}: {importResult.skipped.length}</span>
                <span className="text-destructive font-medium">{t('contracts.importErrors')}: {importResult.errors.length}</span>
              </div>
              {importResult.errors.length > 0 && (
                <div className="rounded border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-48 overflow-y-auto">
                  {importResult.errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('contracts.importCsvHint')}</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
