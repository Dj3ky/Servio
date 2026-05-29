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
import { formatDate } from '@/lib/utils';
import { SendAccountingDialog } from '@/components/SendAccountingDialog';
import { InvoiceEmailDialog } from '@/components/InvoiceEmailDialog';

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

type StatusFilter = 'all' | 'pending' | 'sent_email' | 'sent_post' | 'e_invoice_created' | 'completed';

const columnHelper = createColumnHelper<InvoiceQueueItem>();

export default function InvoiceQueuePage() {
  const { t } = useTranslation();
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceQueueItem | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [accountingInvoice, setAccountingInvoice] = useState<InvoiceQueueItem | null>(null);
  const [emailInvoiceTarget, setEmailInvoiceTarget] = useState<InvoiceQueueItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', statusFilter === 'completed' ? 'completed' : 'pending'],
    queryFn: () => statusFilter === 'completed'
      ? api.get<{ data: InvoiceQueueItem[] }>('/invoices?status=completed&limit=200')
      : api.get<{ data: InvoiceQueueItem[] }>('/invoices/pending'),
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

  const handleAction = (invoice: InvoiceQueueItem, status: string) => {
    setSelectedInvoice(invoice);
    setTargetStatus(status);
    setInvoiceNumber(invoice.invoiceNumber ?? '');
  };

  // Manual filtering — avoids TanStack globalFilter re-render loop
  const filteredData = useMemo(() => {
    let rows = data?.data ?? [];
    if (statusFilter !== 'all') {
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
  }, [data, statusFilter, search]);

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
    columnHelper.accessor((row) => row.review.scheduledMonth, {
      id: 'scheduledMonth',
      header: t('reviews.scheduledMonth'),
    }),
    columnHelper.accessor('createdAt', {
      id: 'createdAt',
      header: t('invoices.createdAt'),
      cell: (info) => <span className="text-sm text-muted-foreground">{formatDate(info.getValue())}</span>,
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
            {inv.status === 'pending' && inv.review.contract.invoiceDelivery === 'email' && (
              <Button size="sm" variant="outline" onClick={() => setEmailInvoiceTarget(inv)}>
                {t('invoices.sendByEmail')}
              </Button>
            )}
            {inv.status === 'pending' && inv.review.contract.invoiceDelivery === 'post' && (
              <Button size="sm" variant="outline" onClick={() => handleAction(inv, 'sent_post')}>
                {t('invoices.markSentPost')}
              </Button>
            )}
            {inv.status === 'pending' && inv.review.contract.invoiceDelivery === 'e_invoice' && (
              <Button size="sm" variant="outline" onClick={() => handleAction(inv, 'e_invoice_created')}>
                {t('invoices.markEInvoiceCreated')}
              </Button>
            )}
            {inv.status !== 'completed' && (
              <Button size="sm" onClick={() => handleAction(inv, 'completed')}>
                {t('invoices.markCompleted')}
              </Button>
            )}
            {inv.review.contract.invoiceDelivery === 'e_invoice' && (
              <Button size="sm" variant="secondary" onClick={() => setAccountingInvoice(inv)}>
                {t('invoices.sendToAccounting')}
              </Button>
            )}
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

  const allInvoices = data?.data ?? [];
  const pendingCount = allInvoices.filter((i) => i.status === 'pending').length;

  const statusFilters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('common.all') },
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

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
