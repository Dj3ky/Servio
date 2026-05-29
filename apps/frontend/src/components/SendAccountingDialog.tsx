import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  language: string;
  isDefault: boolean;
  templateType: string;
}

interface InvoiceInfo {
  id: string;
  customerName: string;
  facilityName: string;
  contractNumber: string;
  scheduledMonth: string;
  invoiceNumber?: string | null;
}

interface Props {
  invoice: InvoiceInfo | null;
  onClose: () => void;
  /** extra query keys to invalidate on success */
  invalidateKeys?: string[][];
}

export function SendAccountingDialog({ invoice, onClose, invalidateKeys = [] }: Props) {
  const { t } = useTranslation();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: allTemplates = [] } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/settings/templates'),
  });

  const templates = allTemplates.filter((t) => t.templateType === 'accounting');

  // Pre-fill defaults when the dialog opens
  useEffect(() => {
    if (!invoice) return;
    setInvoiceNumber(invoice.invoiceNumber ?? '');
    const def = templates.find((t) => t.isDefault) ?? templates[0];
    if (def) {
      setSelectedTemplateId(def.id);
      setSubject(def.subject);
      setBody(def.body);
    } else {
      setSelectedTemplateId('');
      setSubject(`Invoice – ${invoice.facilityName} – ${invoice.scheduledMonth}`);
      setBody(
        `Invoice for <strong>${invoice.customerName}</strong>, ${invoice.facilityName}, ${invoice.scheduledMonth}.<br>Contract: ${invoice.contractNumber}`,
      );
    }
  }, [invoice, templates]);

  function handleTemplateChange(id: string) {
    setSelectedTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  }

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post(`/invoices/${invoice!.id}/send-accounting`, {
        invoiceNumber: invoiceNumber.trim(),
        emailSubject: subject,
        emailBody: body,
      }),
    onSuccess: () => {
      toast.success(t('invoices.sentToAccounting'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? t('errors.internal')),
  });

  return (
    <Dialog open={!!invoice} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('invoices.sendToAccounting')}</DialogTitle>
          {invoice && (
            <p className="text-sm text-muted-foreground">
              {invoice.customerName} · {invoice.facilityName} · {invoice.contractNumber}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>
              {t('invoices.invoiceNumber')}
              <span className="text-destructive ml-0.5">*</span>
            </Label>
            <Input
              placeholder="INV-2025-001"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>

          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('reviews.emailTemplate')}</Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('reviews.noTemplate')} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                      {tpl.isDefault && <span className="ml-2 text-xs text-muted-foreground">(default)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('reviews.emailSubject')}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('reviews.emailBody')}</Label>
            <Textarea
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono text-sm resize-y"
            />
            <p className="text-xs text-muted-foreground">
              {'{{customer_name}}, {{facility_name}}, {{month}}, {{year}}, {{contract_number}}, {{invoice_number}}, {{app_name}}'}
            </p>
          </div>
        </div>

        <Separator />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={sendMutation.isPending || !invoiceNumber.trim()} onClick={() => sendMutation.mutate()}>
            {sendMutation.isPending ? t('common.loading') : t('invoices.sendToAccounting')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
