import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
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
import { Search, SlidersHorizontal, ShieldCheck, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

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

const ACTION_COLOR: Record<string, string> = {
  create: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
  delete: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400',
  login: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400',
};

function actionColor(action: string): string {
  const key = Object.keys(ACTION_COLOR).find((k) => action.toLowerCase().includes(k));
  return key ? ACTION_COLOR[key] : 'bg-muted text-muted-foreground';
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['audit-logs'],
    queryFn: ({ pageParam = 1 }) =>
      api.get<{ data: AuditLogEntry[]; total: number; totalPages: number }>(
        `/audit-logs?page=${pageParam}&limit=50`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      (lastPageParam as number) < lastPage.totalPages ? (lastPageParam as number) + 1 : undefined,
  });

  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!node) return;
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    });
    observerRef.current.observe(node);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const entries = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const columnHelper = createColumnHelper<AuditLogEntry>();

  const columns = [
    columnHelper.accessor('createdAt', {
      id: 'timestamp',
      header: t('auditLog.timestamp'),
      cell: (info) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(info.getValue())}</span>,
    }),
    columnHelper.accessor('userEmail', {
      id: 'user',
      header: t('auditLog.user'),
      cell: (info) => <span className="text-sm">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor('action', {
      id: 'action',
      header: t('auditLog.action'),
      cell: (info) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionColor(info.getValue())}`}>
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('entityType', {
      id: 'entity',
      header: t('auditLog.entity'),
      cell: (info) => {
        const row = info.row.original;
        if (!info.getValue()) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="text-xs text-muted-foreground">
            {info.getValue()}
            {row.entityId && <span className="ml-1 font-mono opacity-60">#{row.entityId.slice(0, 8)}</span>}
          </span>
        );
      },
    }),
    columnHelper.accessor('ipAddress', {
      id: 'ip',
      header: t('auditLog.ipAddress'),
      cell: (info) => <span className="text-xs font-mono text-muted-foreground">{info.getValue() ?? '—'}</span>,
    }),
  ];

  const table = useReactTable({
    data: entries,
    columns,
    state: { sorting, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('auditLog.title')}</h1>
          {!isLoading && total > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">{total} {t('common.total').toLowerCase()}</p>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            className="pl-9"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
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
              [...Array(10)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-16 text-muted-foreground">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {t('common.noData')}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/20">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {isFetchingNextPage && (
          <div className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
        )}
        <div ref={loadMoreRef} className="h-4" />
      </div>
    </div>
  );
}
