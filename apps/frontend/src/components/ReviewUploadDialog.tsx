import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from '@/lib/api';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getToken() {
  try { return JSON.parse(localStorage.getItem('servio-auth') ?? '{}').state?.token ?? ''; } catch { return ''; }
}

function monthsAgo(scheduledMonth: string): number {
  const now = new Date();
  const scheduled = new Date(scheduledMonth + 'T00:00:00');
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const schYear = scheduled.getFullYear();
  const schMonth = scheduled.getMonth();
  return (nowYear - schYear) * 12 + (nowMonth - schMonth);
}

interface ReviewUploadDialogProps {
  open: boolean;
  onClose: () => void;
  reviewId: string;
  hasEmail: boolean;
  invoiceDelivery: 'email' | 'post' | 'e_invoice';
  contractEmailTemplateId?: string | null;
  scheduledMonth?: string;
  onSuccess: () => void;
}

export function ReviewUploadDialog({
  open,
  onClose,
  reviewId,
  hasEmail,
  invoiceDelivery,
  contractEmailTemplateId,
  scheduledMonth,
  onSuccess,
}: ReviewUploadDialogProps) {
  const { t, i18n } = useTranslation();
  const sendEmail = invoiceDelivery === 'email';

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevUrlRef = useRef<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/settings/templates'),
    enabled: open,
  });

  // Revoke old object URL when file changes or dialog closes
  useEffect(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      prevUrlRef.current = url;
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  useEffect(() => {
    if (!open) {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      setPreviewUrl(null);
      setShowPreview(false);
    }
  }, [open]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;
    setFile(f);
    setError(null);
    const preferred = templates.find((tpl) => tpl.id === contractEmailTemplateId)
      ?? templates.find((tpl) => tpl.isDefault)
      ?? templates[0];
    if (preferred) {
      setSelectedTemplateId(preferred.id);
      setEmailSubject(preferred.subject);
      setEmailBody(preferred.body);
    }
  }, [templates, contractEmailTemplateId]);

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
    setSelectedTemplateId('');
    setEmailSubject('');
    setEmailBody('');
    setShowPreview(false);
    onClose();
  }

  async function handleConfirm() {
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    if (emailSubject) formData.append('emailSubject', emailSubject);
    if (emailBody) formData.append('emailBody', emailBody);
    if (selectedTemplateId) formData.append('emailTemplateId', selectedTemplateId);
    try {
      const result = await fetch(`/api/reviews/${reviewId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      const text = await result.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!result.ok) throw new Error(data.error ?? 'Upload failed');
      toast.success(t('reviews.uploadSuccess'));
      handleClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const monthLabel = scheduledMonth
    ? new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(new Date(scheduledMonth + 'T00:00:00'))
    : null;

  const ageMonths = scheduledMonth ? monthsAgo(scheduledMonth) : 0;
  const isOldReview = ageMonths >= 2;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {t('reviews.uploadPdf')}
            {monthLabel && <Badge variant="warning">{monthLabel}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-4">
          {!file ? (
            <div>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{t('reviews.dropOrClick')}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">PDF, Word, Excel, JPG, PNG…</p>
              </div>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>
          ) : (
            <>
              {/* Age warning */}
              {isOldReview && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {t('reviews.oldReviewWarning', { months: ageMonths })}
                  </AlertDescription>
                </Alert>
              )}

              {/* File info + preview toggle */}
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                {file?.type === 'application/pdf' && (
                  <Button
                    variant="ghost" size="sm" className="h-7 gap-1.5 shrink-0 text-xs"
                    onClick={() => setShowPreview((v) => !v)}
                  >
                    {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showPreview ? t('reviews.hidePreview') : t('reviews.showPreview')}
                  </Button>
                )}
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                  onClick={() => { setFile(null); setError(null); setShowPreview(false); }}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Inline PDF preview */}
              {showPreview && previewUrl && (
                <div className="rounded-lg border overflow-hidden">
                  <iframe
                    src={previewUrl}
                    className="w-full"
                    style={{ height: '400px' }}
                    title="PDF Preview"
                  />
                </div>
              )}

              {!sendEmail && (
                <p className="text-sm text-muted-foreground">{t(`invoiceDelivery.saveOnly.${invoiceDelivery}`)}</p>
              )}

              {sendEmail && hasEmail && (
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
                    <Textarea rows={6} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder={t('reviews.emailBody')} className="font-mono text-sm resize-y" />
                    <p className="text-xs text-muted-foreground">{'{{customer_name}}, {{facility_name}}, {{month}}, {{year}}, {{contract_number}}'}</p>
                  </div>
                  <Separator />
                </>
              )}

              {sendEmail && !hasEmail && (
                <p className="text-sm text-muted-foreground">{t('reviews.noEmailConfigured')}</p>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose} disabled={uploading}>{t('common.cancel')}</Button>
                <Button onClick={handleConfirm} disabled={uploading}>
                  {uploading ? t('common.loading') : t('common.execute')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
