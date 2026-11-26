import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { FileText, Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DocumentPreviewDialog, type PreviewableDocument } from './DocumentPreview';

interface SheetProject { id: string; projectNumber: string; employeeId: string | null; employeeName: string | null }

const errorText = (err: unknown, t: (key: string) => string) =>
  err instanceof ApiError ? t(err.code) : t('errors.unknown');

// "New project" sheet for the project manager: preview the PDF in-app, or email it to the assigned employee
export function ProjectSheetActions({ project, canSend }: { project: SheetProject; canSend: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'sl';
  const [preview, setPreview] = useState<PreviewableDocument | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [message, setMessage] = useState('');

  // The PDF lives in a blob URL while the preview is open
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.filePath); }, [preview]);

  const generate = useMutation({
    mutationFn: () => api.getBlob(`/pm/projects/${project.id}/sheet?lang=${lang}`),
    onSuccess: (blob) => setPreview({
      originalName: `projekt-${project.projectNumber.replace(/[^a-zA-Z0-9._-]+/g, '_')}.pdf`,
      filePath: URL.createObjectURL(blob),
      fileSize: blob.size,
    }),
    onError: (err) => toast.error(errorText(err, t)),
  });

  const send = useMutation({
    mutationFn: () => api.post<{ to: string }>(`/pm/projects/${project.id}/sheet/send`, { message, lang }),
    onSuccess: (data) => {
      toast.success(t('pm.sheet.sentOk', { to: data.to }));
      setSendOpen(false);
    },
    onError: (err) => toast.error(errorText(err, t)),
  });

  function openSend() {
    setMessage(t('pm.sheet.defaultMessage', { number: project.projectNumber }));
    setSendOpen(true);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
        <FileText className="h-3.5 w-3.5 mr-1.5" />{generate.isPending ? t('common.loading') : t('pm.sheet.pdf')}
      </Button>
      {canSend && (
        <Button
          variant="outline"
          size="sm"
          onClick={openSend}
          disabled={!project.employeeId}
          title={project.employeeId ? undefined : t('errors.pm_no_manager')}
        >
          <Mail className="h-3.5 w-3.5 mr-1.5" />{t('pm.sheet.send')}
        </Button>
      )}

      <Dialog open={sendOpen} onOpenChange={o => { if (!send.isPending) setSendOpen(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('pm.sheet.sendTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <span className="text-muted-foreground">{t('pm.sheet.recipient')}: </span>
              <span className="font-medium">{project.employeeName}</span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('pm.sheet.message')}</label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} />
            </div>
            <p className="text-xs text-muted-foreground">{t('pm.sheet.attachmentHint')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)} disabled={send.isPending}>{t('common.cancel')}</Button>
            <Button onClick={() => send.mutate()} disabled={send.isPending}>
              <Mail className="h-4 w-4 mr-2" />{send.isPending ? t('pm.sheet.sending') : t('pm.sheet.sendButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentPreviewDialog doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}
