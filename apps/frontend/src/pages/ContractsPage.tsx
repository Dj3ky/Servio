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
  type VisibilityState,
} from '@tanstack/react-table';
import { Plus, Search, ChevronUp, ChevronDown, ChevronsUpDown, Upload, FileUp, FileDown, SlidersHorizontal, CircleDot, Trash2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useDebounce } from '@/hooks/useDebounce';
import { FacilityFormDialog } from '@/components/FacilityFormDialog';
import { ReviewUploadDialog } from '@/components/ReviewUploadDialog';

interface ImportResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

function getToken() {
  try { return JSON.parse(localStorage.getItem('servio-auth') ?? '{}').state?.token ?? ''; } catch { return ''; }
}

const BIANNUAL_MONTHS = [1, 7];
const QUADANNUAL_MONTHS = [1, 4, 7, 10];

function reviewMonths(frequency: string, customMonths: number[] | null | undefined): number[] | null {
  if (frequency === 'biannual') return BIANNUAL_MONTHS;
  if (frequency === 'quadannual') return QUADANNUAL_MONTHS;
  if (frequency === 'custom') return customMonths ?? [];
  return null;
}

function monthsLabel(months: number[], lang: string) {
  return months.map((m) => new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2024, m - 1, 1))).join(', ');
}

interface ContractRow {
  id: string;
  contractNumber: string;
  workOrderNumber?: string | null;
  reviewFrequency: string;
  customMonths?: number[] | null;
  startDate?: string;
  isActive: boolean;
  valueWithoutVat: string | null;
  valueWithoutVatPerYear: string | null;
  smbPath?: string | null;
  notes?: string | null;
  customer: { name: string; email?: string | null; contactName?: string | null; phone?: string | null };
  facility: { name: string; id: string; address?: string | null; notes?: string | null };
  currentReview?: { id: string; status: string } | null;
  customerEmail?: string | null;
  invoiceEmail?: string | null;
  invoiceDelivery?: string;
  emailTemplateId?: string | null;
  currentInvoice?: { id: string; status: string; invoiceNumber: string | null } | null;
  reviewNeededThisMonth?: boolean;
}

function fmtValue(v: string | null | undefined) {
  if (!v) return null;
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  e_invoice_created: 'info',
};

type StatusFilter = 'all' | 'active' | 'inactive';

export default function ContractsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    valueWithoutVat: false,
    valueWithoutVatPerYear: false,
    workOrderNumber: false,
    startDate: false,
    customerEmail: false,
    invoiceEmail: false,
    invoiceDelivery: false,
    contactName: false,
    phone: false,
    facilityAddress: false,
    facilityNotes: false,
    smbPath: false,
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [exporting, setExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; contractNumber: string } | null>(null);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<ContractRow | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contracts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast.success(t('common.delete') + ' OK');
      setDeleteTarget(null);
    },
    onError: () => toast.error(t('errors.internal')),
  });

  async function handleExportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`/api/contracts/export?search=${encodeURIComponent(debouncedSearch)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) { toast.error(t('errors.internal')); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contracts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setExporting(false);
    }
  }

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

  const filteredData = (data?.data ?? []).filter((row) => {
    if (statusFilter === 'active') return row.isActive;
    if (statusFilter === 'inactive') return !row.isActive;
    return true;
  });

  const columnHelper = createColumnHelper<ContractRow>();

  const columns = [
    columnHelper.accessor('customer.name', {
      id: 'customer',
      header: t('contracts.customer'),
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor('facility.name', {
      id: 'facility',
      header: t('contracts.facility'),
    }),
    columnHelper.accessor('contractNumber', {
      id: 'contractNumber',
      header: t('contracts.contractNumber'),
      cell: (info) => <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{info.getValue()}</span>,
    }),
    columnHelper.accessor('valueWithoutVat', {
      id: 'valueWithoutVat',
      header: t('contracts.valueExclVat'),
      cell: (info) => {
        const v = fmtValue(info.getValue());
        return v ? <span className="font-mono text-xs">€ {v}</span> : <span className="text-muted-foreground">—</span>;
      },
    }),
    columnHelper.accessor('valueWithoutVatPerYear', {
      id: 'valueWithoutVatPerYear',
      header: t('contracts.valueExclVatYear'),
      cell: (info) => {
        const v = fmtValue(info.getValue());
        return v ? <span className="font-mono text-xs">€ {v}</span> : <span className="text-muted-foreground">—</span>;
      },
    }),
    columnHelper.accessor('workOrderNumber', {
      id: 'workOrderNumber',
      header: t('contracts.workOrderNumber'),
      cell: (info) => info.getValue()
        ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{info.getValue()}</span>
        : <span className="text-muted-foreground">—</span>,
    }),
    columnHelper.accessor('startDate', {
      id: 'startDate',
      header: t('contracts.startDate'),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor('customerEmail', {
      id: 'customerEmail',
      header: t('facility.reviewEmail'),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor('invoiceEmail', {
      id: 'invoiceEmail',
      header: t('facility.invoiceEmail'),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor('invoiceDelivery', {
      id: 'invoiceDelivery',
      header: t('contracts.invoiceDelivery'),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ? t(`invoiceDelivery.${info.getValue()}` as any) : '—'}</span>,
    }),
    columnHelper.accessor((row) => row.customer.contactName ?? null, {
      id: 'contactName',
      header: t('contracts.contactName'),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor((row) => row.customer.phone ?? null, {
      id: 'phone',
      header: t('common.phone'),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor((row) => row.facility.address ?? null, {
      id: 'facilityAddress',
      header: t('contracts.facilityAddress'),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor((row) => row.facility.notes ?? null, {
      id: 'facilityNotes',
      header: t('common.notes'),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor('smbPath', {
      id: 'smbPath',
      header: t('facility.smbPath'),
      cell: (info) => <span className="text-sm text-muted-foreground font-mono">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.display({
      id: 'frequency',
      header: t('contracts.frequency'),
      cell: ({ row }) => {
        const freq = row.original.reviewFrequency;
        const months = reviewMonths(freq, row.original.customMonths);
        return (
          <div>
            <span>{t(`frequency.${freq}` as any)}</span>
            {months && months.length > 0 && (
              <div className="text-xs text-muted-foreground mt-0.5">{monthsLabel(months, i18n.language)}</div>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('isActive', {
      id: 'status',
      header: t('common.status'),
      cell: (info) => (
        <Badge variant={info.getValue() ? 'success' : 'secondary'}>
          {info.getValue() ? t('common.active') : t('common.inactive')}
        </Badge>
      ),
    }),
    columnHelper.display({
      id: 'reviewStatus',
      header: t('contracts.reviewStatus'),
      cell: ({ row }) => {
        const status = row.original.currentReview?.status;
        if (status) return <Badge variant={REVIEW_STATUS_VARIANT[status] ?? 'secondary'}>{t(`reviews.${status}` as any)}</Badge>;
        if (!row.original.reviewNeededThisMonth) return <Badge variant="outline">{t('reviews.notNeeded')}</Badge>;
        return <Badge variant="secondary">—</Badge>;
      },
    }),
    columnHelper.accessor('currentInvoice', {
      id: 'invoiceStatus',
      header: t('contracts.invoiceStatus'),
      cell: (info) => {
        const status = info.getValue()?.status;
        if (!status) return <Badge variant="secondary">—</Badge>;
        return <Badge variant={INVOICE_STATUS_VARIANT[status] ?? 'secondary'}>{t(`invoices.${status}` as any)}</Badge>;
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1 items-center" onClick={(e) => e.stopPropagation()}>
          {row.original.notes && (
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs whitespace-pre-wrap">
                  {row.original.notes}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {(user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technician') && row.original.currentReview?.status === 'pending' && (
            <Button size="sm" variant="outline" onClick={() => setUploadTarget(row.original)}>
              <Upload className="h-3 w-3 mr-1" />
              {t('reviews.uploadPdf')}
            </Button>
          )}
          {user?.role === 'admin' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteTarget({ id: row.original.id, contractNumber: row.original.contractNumber })}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ),
    }),
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: data?.totalPages ?? 0,
  });

  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('common.all') },
    { value: 'active', label: t('common.active') },
    { value: 'inactive', label: t('common.inactive') },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('contracts.title')}</h1>
          {data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {data.total} {t('common.total').toLowerCase()}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvImport(f); e.target.value = ''; }}
            />
            <Button variant="outline" disabled={exporting} onClick={handleExportCsv}>
              <FileDown className="mr-2 h-4 w-4" />
              {exporting ? t('common.loading') : t('contracts.exportCsv')}
            </Button>
            <Button variant="outline" disabled={importing} onClick={() => csvInputRef.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" />
              {importing ? t('common.loading') : t('contracts.importCsv')}
            </Button>
            <Button onClick={() => setFormDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('contracts.addContract')}
            </Button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Column visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              {t('common.columns')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t('common.toggleColumns')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table.getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onCheckedChange={(val) => col.toggleVisibility(!!val)}
                  className="capitalize"
                >
                  {col.columnDef.header as string}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/30 hover:bg-muted/30">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                    onClick={header.column.getToggleSortingHandler()}
                  >
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
                <TableCell colSpan={columns.length} className="text-center py-16 text-muted-foreground">
                  <CircleDot className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {t('common.noData')}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer transition-colors"
                  onClick={() => navigate(`/facilities/${row.original.facility.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('common.total')}: {data.total}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t('common.previous')}
            </Button>
            <span className="px-1">{t('common.page')} {page} {t('common.of')} {data.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}

      <FacilityFormDialog open={formDialogOpen} onClose={() => setFormDialogOpen(false)} />

      {uploadTarget?.currentReview && (
        <ReviewUploadDialog
          open={!!uploadTarget}
          onClose={() => setUploadTarget(null)}
          reviewId={uploadTarget.currentReview.id}
          hasEmail={!!uploadTarget.customerEmail}
          invoiceDelivery={(uploadTarget.invoiceDelivery as 'email' | 'post' | 'e_invoice') ?? 'email'}
          contractEmailTemplateId={uploadTarget.emailTemplateId}
          onSuccess={() => { setUploadTarget(null); queryClient.invalidateQueries({ queryKey: ['contracts'] }); }}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.delete')} {deleteTarget?.contractNumber}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('contracts.deleteConfirm')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV import result dialog */}
      <Dialog open={!!importResult} onOpenChange={(open) => { if (!open) setImportResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('contracts.importResult')}</DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-3 text-center">
                  <div className="text-xl font-bold text-green-700 dark:text-green-400">{importResult.created.length}</div>
                  <div className="text-xs text-green-600 dark:text-green-500">{t('contracts.importCreated')}</div>
                </div>
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-900 p-3 text-center">
                  <div className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{importResult.skipped.length}</div>
                  <div className="text-xs text-yellow-600 dark:text-yellow-500">{t('contracts.importSkipped')}</div>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-center">
                  <div className="text-xl font-bold text-red-700 dark:text-red-400">{importResult.errors.length}</div>
                  <div className="text-xs text-red-600 dark:text-red-500">{t('contracts.importErrors')}</div>
                </div>
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
