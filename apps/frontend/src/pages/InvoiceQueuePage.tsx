import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

export default function InvoiceQueuePage() {
  const { t } = useTranslation();
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceQueueItem | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [targetStatus, setTargetStatus] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', 'pending'],
    queryFn: () => api.get<{ data: InvoiceQueueItem[] }>('/invoices/pending'),
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, invoiceNumber }: { id: string; status: string; invoiceNumber?: string }) =>
      api.patch(`/invoices/${id}`, { status, invoiceNumber }),
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

  const invoices = data?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('invoices.queue')}</h1>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">{t('common.noData')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('contracts.customer')}</TableHead>
                  <TableHead>{t('contracts.facility')}</TableHead>
                  <TableHead>{t('contracts.contractNumber')}</TableHead>
                  <TableHead>{t('reviews.scheduledMonth')}</TableHead>
                  <TableHead>{t('invoices.createdAt')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.review.contract.customer.name}</TableCell>
                    <TableCell>{inv.review.contract.facility.name}</TableCell>
                    <TableCell>#{inv.review.contract.contractNumber}</TableCell>
                    <TableCell>{inv.review.scheduledMonth}</TableCell>
                    <TableCell>{formatDateTime(inv.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === 'pending' ? 'warning' : 'info'}>
                        {t(`invoices.${inv.status}` as any)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleAction(inv, 'sent_email')}>
                          {t('invoices.markSentEmail')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleAction(inv, 'sent_post')}>
                          {t('invoices.markSentPost')}
                        </Button>
                        <Button size="sm" onClick={() => handleAction(inv, 'completed')}>
                          {t('invoices.markCompleted')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoices.markCompleted')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">{t('invoices.invoiceNumber')}</label>
              <Input className="mt-1" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2024-001" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInvoice(null)}>{t('common.cancel')}</Button>
            <Button
              disabled={updateMutation.isPending}
              onClick={() => selectedInvoice && updateMutation.mutate({ id: selectedInvoice.id, status: targetStatus, invoiceNumber: invoiceNumber || undefined })}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
