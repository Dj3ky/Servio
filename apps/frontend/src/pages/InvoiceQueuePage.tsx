import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
  type ColumnVisibilityState,
} from '@tanstack/react-table';
import { SlidersHorizontal, Receipt, ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDateTime } from '@/lib/utils';

interface InvoiceQueueItem {
  id: string;
  status: string;
  invoiceNumber: string | null;
  createdAt: string;
  review: {
    scheduledMonth: string;
    contract: {
      contractNumber: string;
      valueWithoutVat: string | null;
      facility: { name: string };
      customer: { name: string };
    };
  };
}

const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'secondary'> = {
  pending: 'warning',
  sent_email: 'info',
  sent_post: 'info',
  completed: 'success',
};

type StatusFilter = 'all' | 'pending' | 'sent_email' | 'sent_post';

export default function InvoiceQueuePage() {
  const { t } = useTranslation();
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceQueueItem | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', 'pending'],
    queryFn: () => api.get<{ data: InvoiceQueueItem[] }>('/invoices/pending'),
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, invoiceNumber }: { id: string; status: string; invoiceNumber?: string }) =>
      api.patch(`/invoices/${id}`, { status, invoiceNumber }),
    onMutate: async ({ id, status, invoiceNumber }) => {
      await queryClient.cancelQueries({ queryKey: ['invoices', 'pending'] });
      const previous = queryClient.getQueryData<{ data: InvoiceQueueItem[] }>(['invoices', 'pending']);
      queryClient.setQueryData<{ data: InvoiceQueueItem[] }>(['invoices', 'pending'], (old) => {
        if (!old) return old;
        if (status === 'completed') {
          return { ...old, data: old.data.filter((inv) => inv.id !== id) };
        }
        return {
          ...old,
          data: old.data.map((inv) =>
            inv.id === id ? { ...inv, status, invoiceNumber: invoiceNumber ?? inv.invoiceNumber } : inv,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['invoices', 'pending'], context.previous);
      toast.error(t('errors.internal'));
    },
    onSuccess: () => {
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedInvoice(null);
      setInvoiceNumber('');
    },
  });

  const sendAccountingMutation = useMutation({
    mutationFn: (id: string) => api.post(`/invoices/${id}/send-accounting`, {}),
    onSuccess: () => toast.success(t('invoices.sentToAccounting')),
    onError: () => toast.error(t('errors.internal')),
  });

  const handleAction = (invoice: InvoiceQueueItem, status: string) => {
    setSelectedInvoice(invoice);
    setTargetStatus(status);
    setInvoiceNumber(invoice.invoiceNumber ?? '');
  };

  const allInvoices = data?.data ?? [];
  const filteredByStatus = allInvoices.filter((inv) => statusFilter === 'all' || inv.status === statusFilter);

  const columnHelper = createColumnHelper<InvoiceQueueItem>();

  const columns = [
    columnHelper.accessor((row) => row.review.contract.customer.name, {
      id: 'customer',
      header: t('contracts.customer'),
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor((row) => row.review.contract.facility.name, {
      id: 'facility',
      header: t('contracts.facility'),
    }),
    columnHelper.accessor((row) => row.review.contract.contractNumber, {
      id: 'contractNumber',
      header: t('contracts.contractNumber'),
      cell: (info) => <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">#{info.getValue()}</span>,
    }),
    columnHelper.accessor((row) => row.review.scheduledMonth, {
      id: 'scheduledMonth',
      header: t('reviews.scheduledMonth'),
    }),
    columnHelper.accessor('createdAt', {
      id: 'createdAt',
      header: t('invoices.createdAt'),
      cell: (info) => <span className="text-sm text-muted-foreground">{formatDateTime(info.getValue())}</span>,
    }),
    columnHelper.accessor('status', {
      id: 'status',
      header: t('common.status'),
      cell: (info) => (
        <Badge variant={STATUS_VARIANT[info.getValue()] ?? 'secondary'}>
          {t(`invoices.${info.getValue()}` as any)}
        </Badge>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      enableHiding: false,
      cell: ({ row }) => {
        const inv = row.original;
        return (
          <div className="flex gap-1 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
            {inv.status === 'pending' && (
              <>
                <Button size="sm" variant="outline" onClick={() => handleAction(inv, 'sent_email')}>
                  {t('invoices.markSentEmail')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleAction(inv, 'sent_post')}>
                  {t('invoices.markSentPost')}
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => handleAction(inv, 'completed')}>
              {t('invoices.markCompleted')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={sendAccountingMutation.isPending}
              onClick={() => sendAccountingMutation.mutate(inv.id)}
            >
              {t('invoices.sendToAccounting')}
            </Button>
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: filteredByStatus,
    columns,
    state: { sorting, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('common.all') },
    { value: 'pending', label: t('invoices.pending') },
    { value: 'sent_email', label: t('invoices.sentEmail') },
    { value: 'sent_post', label: t('invoices.sentPost') },
  ];

  const pendingCount = allInvoices.filter((i) => i.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('invoices.queue')}</h1>
          {!isLoading && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {allInvoices.length} {t('common.total').toLowerCase()}
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 dark:bg-yellow-950/50 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  {pendingCount} {t('invoices.pending').toLowerCase()}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            className="pl-9"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
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
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/30 hover:bg-muted/30">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className={h.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getCanSort() && (
                        h.column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" /> :
                        h.column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" /> :
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
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => <TableCell key={j}><Skeleton className="h-12 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-16 text-muted-foreground">
                  <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {t('common.noData')}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Confirm dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {targetStatus === 'completed' ? t('invoices.markCompleted') :
               targetStatus === 'sent_email' ? t('invoices.markSentEmail') :
               t('invoices.markSentPost')}
            </DialogTitle>
            {selectedInvoice && (
              <p className="text-sm text-muted-foreground">
                {selectedInvoice.review.contract.customer.name} · #{selectedInvoice.review.contract.contractNumber}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('invoices.invoiceNumber')}</label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-2025-001"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInvoice(null)}>{t('common.cancel')}</Button>
            <Button
              disabled={updateMutation.isPending}
              onClick={() => selectedInvoice && updateMutation.mutate({
                id: selectedInvoice.id,
                status: targetStatus,
                invoiceNumber: invoiceNumber || undefined,
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
