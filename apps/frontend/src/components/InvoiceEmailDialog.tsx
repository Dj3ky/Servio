import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
  templateType: string;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getToken() {
  try { return JSON.parse(localStorage.getItem('servio-auth') ?? '{}').state?.token ?? ''; } catch { return ''; }
}

interface InvoiceEmailDialogProps {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber?: string | null;
  hasEmail: boolean;
  onSuccess: () => void;
}

export function InvoiceEmailDialog({
  open,
  onClose,
  invoiceId,
  invoiceNumber: initialInvoiceNumber,
  hasEmail,
  onSuccess,
}: InvoiceEmailDialogProps) {
  const { t } = useTranslation();

  const [file, setFile] = useState<File | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber ?? '');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: allTemplates = [] } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/settings/templates'),
    enabled: open,
  });

  const templates = allTemplates.filter((tpl) => tpl.templateType === 'invoice');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;
    setFile(f);
    setError(null);
    const preferred = templates.find((tpl) => tpl.isDefault) ?? templates[0];
    if (preferred && !selectedTemplateId) {
      setSelectedTemplateId(preferred.id);
      setEmailSubject(preferred.subject);
      setEmailBody(preferred.body);
    }
  }, [templates, selectedTemplateId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: uploading || !!file,
  });

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) { setEmailSubject(tpl.subject); setEmailBody(tpl.body); }
  }

  function handleClose() {
    if (uploading) return;
    setFile(null);
    setError(null);
    setInvoiceNumber(initialInvoiceNumber ?? '');
    setSelectedTemplateId('');
    setEmailSubject('');
    setEmailBody('');
    onClose();
  }

  async function handleSend() {
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    if (invoiceNumber.trim()) formData.append('invoiceNumber', invoiceNumber.trim());
    if (emailSubject) formData.append('emailSubject', emailSubject);
    if (emailBody) formData.append('emailBody', emailBody);
    if (selectedTemplateId) formData.append('emailTemplateId', selectedTemplateId);
    try {
      const result = await fetch(`/api/invoices/${invoiceId}/send-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const text = await result.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!result.ok) throw new Error(data.error ?? 'Send failed');
      toast.success(t('invoices.sentByEmail'));
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>{t('invoices.sendByEmail')}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-4">
          {!file ? (
            <div>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{t('reviews.dropOrClick')}</p>
              </div>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setFile(null); setError(null); }} disabled={uploading}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label>{t('invoices.invoiceNumber')}</Label>
                <Input
                  placeholder="INV-2025-001"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>

              {!hasEmail && (
                <p className="text-sm text-destructive">{t('invoices.noInvoiceEmail')}</p>
              )}

              {hasEmail && (
                <>
                  <Separator />
                  {templates.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>{t('reviews.emailTemplate')}</Label>
                      <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                        <SelectTrigger><SelectValue placeholder={t('reviews.noTemplate')} /></SelectTrigger>
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
                    <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder={t('reviews.emailSubject')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('reviews.emailBody')}</Label>
                    <Textarea rows={6} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className="font-mono text-sm resize-y" />
                    <p className="text-xs text-muted-foreground">{'{{customer_name}}, {{facility_name}}, {{month}}, {{year}}, {{contract_number}}, {{invoice_number}}, {{app_name}}'}</p>
                  </div>
                  <Separator />
                </>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose} disabled={uploading}>{t('common.cancel')}</Button>
                <Button onClick={handleSend} disabled={uploading || !hasEmail}>
                  {uploading ? t('common.loading') : t('invoices.sendByEmail')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
