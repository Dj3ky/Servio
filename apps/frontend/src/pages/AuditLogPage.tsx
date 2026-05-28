import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

export default function AuditLogPage() {
  const { t } = useTranslation();
  const observerRef = useRef<IntersectionObserver | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['audit-logs'],
    queryFn: ({ pageParam = 1 }) => api.get<{ data: AuditLogEntry[]; total: number; totalPages: number }>(`/audit-logs?page=${pageParam}&limit=50`),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      return lastPageParam < lastPage.totalPages ? (lastPageParam as number) + 1 : undefined;
    },
  });

  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!node) return;
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    observerRef.current.observe(node);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const entries = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('auditLog.title')}</h1>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('auditLog.timestamp')}</TableHead>
                <TableHead>{t('auditLog.user')}</TableHead>
                <TableHead>{t('auditLog.action')}</TableHead>
                <TableHead>{t('auditLog.entity')}</TableHead>
                <TableHead>{t('auditLog.ipAddress')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? [...Array(10)].map((_, i) => (
                <TableRow key={i}>{[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              )) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">{t('common.noData')}</TableCell></TableRow>
              ) : entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs">{formatDateTime(entry.createdAt)}</TableCell>
                  <TableCell className="text-sm">{entry.userEmail ?? '-'}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{entry.action}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.entityType ? `${entry.entityType}${entry.entityId ? ` #${entry.entityId.slice(0, 8)}` : ''}` : '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.ipAddress ?? '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {isFetchingNextPage && (
            <div className="py-4 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
          )}
          <div ref={loadMoreRef} className="h-4" />
        </CardContent>
      </Card>
    </div>
  );
}
