import { useState } from 'react';
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
} from '@tanstack/react-table';
import { Plus, Search, ChevronUp, ChevronDown, ChevronsUpDown, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useDebounce } from '@/hooks/useDebounce';

interface ContractRow {
  id: string;
  contractNumber: string;
  reviewFrequency: string;
  isActive: boolean;
  customer: { name: string };
  facility: { name: string; id: string };
  assignedTechnician: { name: string } | null;
  currentReview?: { status: string } | null;
  currentInvoice?: { status: string } | null;
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
          <Button onClick={() => navigate('/facilities/new')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('contracts.addContract')}
          </Button>
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
    </div>
  );
}
