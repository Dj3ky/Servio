import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { SlidersHorizontal, Receipt, ChevronUp, ChevronDown, ChevronsUpDown, Search, MoreHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDate, formatScheduledMonth } from '@/lib/utils';
import { SendAccountingDialog } from '@/components/SendAccountingDialog';
import { InvoiceEmailDialog } from '@/components/InvoiceEmailDialog';
import { useFilterStore } from '@/stores/filterStore';

interface InvoiceQueueItem {
  id: string;
  status: string;
  invoiceNumber: string | null;
  createdAt: string;
  completedAt: string | null;
  review: {
    scheduledMonth: string;
    contract: {
      contractNumber: string;
      valueWithoutVat: string | null;
      invoiceDelivery: string;
      facility: { name: string };
      customer: { name: string };
    };
  };
}

const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'secondary'> = {
  pending: 'warning',
  sent_email: 'info',
  sent_post: 'info',
  e_invoice_created: 'info',
  completed: 'success',
};

const DELIVERY_LABEL: Record<string, string> = {
  email: 'Email',
  post: 'Post',
  e_invoice: 'E-Invoice',
};

type StatusFilter = 'in_progress' | 'pending' | 'sent_email' | 'sent_post' | 'e_invoice_created' | 'completed';

const columnHelper = createColumnHelper<InvoiceQueueItem>();

export default function InvoiceQueuePage() {
  const { t, i18n } = useTranslation();
  const { getFilter, setFilter } = useFilterStore();
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceQueueItem | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [search, setSearch] = useState(() => getFilter('invoices', 'search') ?? '');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => (getFilter('invoices', 'status') as StatusFilter) ?? 'in_progress',
  );
  const [accountingInvoice, setAccountingInvoice] = useState<InvoiceQueueItem | null>(null);
  const [emailInvoiceTarget, setEmailInvoiceTarget] = useState<InvoiceQueueItem | null>(null);

  // Always fetch pending so we have counts for all non-completed statuses
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['invoices', 'pending'],
    queryFn: () => api.get<{ data: InvoiceQueueItem[] }>('/invoices/pending'),
    refetchInterval: 30000,
  });

  // Only fetch completed when that filter is active
  const { data: completedData, isLoading: completedLoading } = useQuery({
    queryKey: ['invoices', 'completed'],
    queryFn: () => api.get<{ data: InvoiceQueueItem[] }>('/invoices?status=completed&limit=200'),
    enabled: statusFilter === 'completed',
    refetchInterval: 30000,
  });

  const isLoading = statusFilter === 'completed' ? completedLoading : pendingLoading;
  const activeData = statusFilter === 'completed' ? completedData : pendingData;

  const statusCounts = useMemo(() => {
    const rows = pendingData?.data ?? [];
    return {
      in_progress: rows.length,
      pending: rows.filter((i) => i.status === 'pending').length,
      sent_email: rows.filter((i) => i.status === 'sent_email').length,
      sent_post: rows.filter((i) => i.status === 'sent_post').length,
      e_invoice_created: rows.filter((i) => i.status === 'e_invoice_created').length,
      completed: completedData?.data?.length ?? null,
    };
  }, [pendingData, completedData]);

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

  const handleAction = (invoice: InvoiceQueueItem, status: string) => {
    setSelectedInvoice(invoice);
    setTargetStatus(status);
    setInvoiceNumber(invoice.invoiceNumber ?? '');
  };

  const filteredData = useMemo(() => {
    let rows = activeData?.data ?? [];
    if (statusFilter !== 'in_progress' && statusFilter !== 'completed') {
      rows = rows.filter((inv) => inv.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((inv) =>
        inv.review.contract.customer.name.toLowerCase().includes(q) ||
        inv.review.contract.facility.name.toLowerCase().includes(q) ||
        inv.review.contract.contractNumber.toLowerCase().includes(q) ||
        inv.review.scheduledMonth.includes(q) ||
        (inv.invoiceNumber ?? '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [activeData, statusFilter, search]);

  const columns = useMemo(() => [
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
      cell: (info) => <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{info.getValue()}</span>,
    }),
    columnHelper.accessor('invoiceNumber', {
      id: 'invoiceNumber',
      header: t('invoices.invoiceNumber'),
      cell: (info) => info.getValue()
        ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{info.getValue()}</span>
        : <span className="text-muted-foreground text-xs">—</span>,
    }),
    columnHelper.accessor((row) => row.review.contract.invoiceDelivery, {
      id: 'delivery',
      header: t('contracts.invoiceDelivery'),
      cell: (info) => (
        <span className="text-sm text-muted-foreground">
          {DELIVERY_LABEL[info.getValue()] ?? info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor((row) => row.review.scheduledMonth, {
      id: 'scheduledMonth',
      header: t('reviews.scheduledMonth'),
      cell: (info) => formatScheduledMonth(info.getValue(), i18n.language),
    }),
    columnHelper.accessor('createdAt', {
      id: 'createdAt',
      header: t('reviews.reviewDone'),
      cell: (info) => <span className="text-sm text-muted-foreground">{formatDate(info.getValue())}</span>,
    }),
    columnHelper.accessor('completedAt', {
      id: 'completedAt',
      header: t('reviews.invoiceSent'),
      cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ? formatDate(info.getValue()!) : '-'}</span>,
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
        const hasPrimaryAction =
          (inv.status === 'pending' && inv.review.contract.invoiceDelivery === 'email') ||
          (inv.status === 'pending' && inv.review.contract.invoiceDelivery === 'post') ||
          (inv.status === 'pending' && inv.review.contract.invoiceDelivery === 'e_invoice');
        const canComplete = inv.status !== 'completed';
        const canSendAccounting = inv.review.contract.invoiceDelivery === 'e_invoice';

        if (!hasPrimaryAction && !canComplete && !canSendAccounting) return null;

        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {inv.status === 'pending' && inv.review.contract.invoiceDelivery === 'email' && (
                  <DropdownMenuItem onClick={() => setEmailInvoiceTarget(inv)}>
                    {t('invoices.sendByEmail')}
                  </DropdownMenuItem>
                )}
                {inv.status === 'pending' && inv.review.contract.invoiceDelivery === 'post' && (
                  <DropdownMenuItem onClick={() => handleAction(inv, 'sent_post')}>
                    {t('invoices.markSentPost')}
                  </DropdownMenuItem>
                )}
                {inv.status === 'pending' && inv.review.contract.invoiceDelivery === 'e_invoice' && (
                  <DropdownMenuItem onClick={() => handleAction(inv, 'e_invoice_created')}>
                    {t('invoices.markEInvoiceCreated')}
                  </DropdownMenuItem>
                )}
                {canSendAccounting && (
                  <DropdownMenuItem onClick={() => setAccountingInvoice(inv)}>
                    {t('invoices.sendToAccounting')}
                  </DropdownMenuItem>
                )}
                {(hasPrimaryAction || canSendAccounting) && canComplete && (
                  <DropdownMenuSeparator />
                )}
                {canComplete && (
                  <DropdownMenuItem onClick={() => handleAction(inv, 'completed')}>
                    {t('invoices.markCompleted')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const pendingCount = pendingData?.data?.filter((i) => i.status === 'pending').length ?? 0;

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'in_progress', label: t('invoices.inProgress') },
    { value: 'pending', label: t('invoices.pending') },
    { value: 'sent_email', label: t('invoices.sentEmail') },
    { value: 'sent_post', label: t('invoices.sentPost') },
    { value: 'e_invoice_created', label: t('invoices.eInvoiceCreated') },
    { value: 'completed', label: t('invoices.completed') },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('invoices.queue')}</h1>
          {!isLoading && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {(activeData?.data ?? []).length} {t('common.total').toLowerCase()}
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
            value={search}
            onChange={(e) => { setSearch(e.target.value); setFilter('invoices', 'search', e.target.value); }}
          />
        </div>

        <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val as StatusFilter); setFilter('invoices', 'status', val); }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusFilters.map((f) => {
              const count = statusCounts[f.value];
              return (
                <SelectItem key={f.value} value={f.value}>
                  <span className="flex items-center justify-between gap-6 w-full">
                    <span>{f.label}</span>
                    {count !== null && count !== undefined && (
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

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
               targetStatus === 'e_invoice_created' ? t('invoices.markEInvoiceCreated') :
               t('invoices.markSentPost')}
            </DialogTitle>
            {selectedInvoice && (
              <p className="text-sm text-muted-foreground">
                {selectedInvoice.review.contract.customer.name} · {selectedInvoice.review.contract.contractNumber}
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

      <SendAccountingDialog
        invoice={accountingInvoice ? {
          id: accountingInvoice.id,
          customerName: accountingInvoice.review.contract.customer.name,
          facilityName: accountingInvoice.review.contract.facility.name,
          contractNumber: accountingInvoice.review.contract.contractNumber,
          scheduledMonth: accountingInvoice.review.scheduledMonth,
          invoiceNumber: accountingInvoice.invoiceNumber,
        } : null}
        onClose={() => setAccountingInvoice(null)}
      />

      {emailInvoiceTarget && (
        <InvoiceEmailDialog
          open={!!emailInvoiceTarget}
          onClose={() => setEmailInvoiceTarget(null)}
          invoiceId={emailInvoiceTarget.id}
          invoiceNumber={emailInvoiceTarget.invoiceNumber}
          hasEmail={true}
          onSuccess={() => {
            setEmailInvoiceTarget(null);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </div>
  );
}
