import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  type SortingState,
  type ColumnVisibilityState,
} from '@tanstack/react-table';
import { Plus, Search, ChevronUp, ChevronDown, ChevronsUpDown, Upload, FileUp, SlidersHorizontal, CircleDot } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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

type StatusFilter = 'all' | 'active' | 'inactive';

export default function ContractsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

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
    columnHelper.accessor('reviewFrequency', {
      id: 'frequency',
      header: t('contracts.frequency'),
      cell: (info) => t(`frequency.${info.getValue()}` as any),
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
    columnHelper.accessor('assignedTechnician', {
      id: 'technician',
      header: t('contracts.technician'),
      cell: (info) => info.getValue()?.name ?? <span className="text-muted-foreground">—</span>,
    }),
    columnHelper.accessor('currentReview', {
      id: 'reviewStatus',
      header: t('contracts.reviewStatus'),
      cell: (info) => {
        const status = info.getValue()?.status;
        if (!status) return <Badge variant="secondary">—</Badge>;
        return <Badge variant={REVIEW_STATUS_VARIANT[status] ?? 'secondary'}>{t(`reviews.${status}` as any)}</Badge>;
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
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {(user?.role === 'admin' || user?.role === 'manager' || user?.role === 'technician') && row.original.currentReview?.status === 'pending' && (
            <Button size="sm" variant="outline" onClick={() => navigate(`/facilities/${row.original.facility.id}`)}>
              <Upload className="h-3 w-3 mr-1" />
              {t('reviews.uploadPdf')}
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
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Toggle columns</DropdownMenuLabel>
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
