import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, Eye, EyeOff, AlertTriangle, Info, FolderOpen } from 'lucide-react';
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
  contractEmailTemplateId?: string | null;
  scheduledMonth?: string;
  onSuccess: () => void;
}

export function ReviewUploadDialog({
  open,
  onClose,
  reviewId,
  hasEmail,
  contractEmailTemplateId,
  scheduledMonth,
  onSuccess,
}: ReviewUploadDialogProps) {
  const { t, i18n } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

  useEffect(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    if (previewFile) {
      const url = URL.createObjectURL(previewFile);
      setPreviewUrl(url);
      prevUrlRef.current = url;
    } else {
      setPreviewUrl(null);
    }
  }, [previewFile]);

  useEffect(() => {
    if (!open) {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      setPreviewUrl(null);
      setPreviewFile(null);
    }
  }, [open]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const currentNames = new Set(files.map((f) => f.name));
    const newFiles = acceptedFiles.filter((f) => !currentNames.has(f.name));
    if (!newFiles.length) return;
    const isFirstAdd = files.length === 0;
    setFiles((prev) => [...prev, ...newFiles]);
    setError(null);
    if (isFirstAdd) {
      const preferred = templates.find((tpl) => tpl.id === contractEmailTemplateId)
        ?? templates.find((tpl) => tpl.isDefault)
        ?? templates[0];
      if (preferred) {
        setSelectedTemplateId(preferred.id);
        setEmailSubject(preferred.subject);
        setEmailBody(preferred.body);
      }
    }
  }, [files, templates, contractEmailTemplateId]);

  const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
    onDrop,
    multiple: true,
    disabled: uploading,
  });

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) { setEmailSubject(tpl.subject); setEmailBody(tpl.body); }
  }

  function handleClose() {
    if (uploading) return;
    setFiles([]);
    setPreviewFile(null);
    setError(null);
    setSelectedTemplateId('');
    setEmailSubject('');
    setEmailBody('');
    onClose();
  }

  async function handleConfirm() {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
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

      if (data.emailError) {
        setError(`${t('reviews.emailFailed')}: ${data.emailError}`);
        onSuccess();
      } else {
        toast.success(t('reviews.uploadSuccess'));
        handleClose();
        onSuccess();
      }
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
          {/* Dropzone — always visible so files can be added at any time */}
          <div>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                files.length > 0 ? 'p-4' : 'p-8'
              } ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            >
              <input {...getInputProps()} />
              <Upload className={`mx-auto text-muted-foreground ${files.length > 0 ? 'h-5 w-5 mb-1' : 'h-8 w-8 mb-2'}`} />
              <p className="text-sm text-muted-foreground">{t('reviews.dropOrClick')}</p>
              {files.length === 0 && <p className="text-xs text-muted-foreground/60 mt-1">PDF, Word, Excel, JPG, PNG…</p>}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={openFileDialog}
              disabled={uploading}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              {t('reviews.browseFiles')}
            </Button>
            {error && files.length === 0 && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>

          {files.length > 0 && (
            <>
              {isOldReview && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {t('reviews.oldReviewWarning', { months: ageMonths })}
                  </AlertDescription>
                </Alert>
              )}

              {/* Selected file list */}
              <div className="space-y-2">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(f.size)}</p>
                    </div>
                    {f.type === 'application/pdf' && (
                      <Button
                        variant="ghost" size="sm" className="h-7 gap-1.5 shrink-0 text-xs"
                        onClick={() => setPreviewFile((prev) => prev?.name === f.name ? null : f)}
                      >
                        {previewFile?.name === f.name ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {previewFile?.name === f.name ? t('reviews.hidePreview') : t('reviews.showPreview')}
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                      onClick={() => {
                        if (previewFile?.name === f.name) setPreviewFile(null);
                        setFiles((prev) => prev.filter((x) => x.name !== f.name));
                      }}
                      disabled={uploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {previewFile && previewUrl && (
                <div className="rounded-lg border overflow-hidden">
                  <iframe
                    src={previewUrl}
                    className="w-full"
                    style={{ height: '400px' }}
                    title={previewFile.name}
                  />
                </div>
              )}

              {hasEmail && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>{t('reviews.emailWillBeSent')}</AlertDescription>
                </Alert>
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
                    <Textarea rows={6} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder={t('reviews.emailBody')} className="font-mono text-sm resize-y" />
                    <p className="text-xs text-muted-foreground">{'{{customer_name}}, {{facility_name}}, {{month}}, {{year}}, {{contract_number}}'}</p>
                  </div>
                  <Separator />
                </>
              )}

              {!hasEmail && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>{t('reviews.noEmailConfigured')}</AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

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
