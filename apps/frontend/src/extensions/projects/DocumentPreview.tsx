import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileText, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export interface PreviewableDocument { originalName: string; filePath: string; fileSize: number | null }

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];

// Only PDFs (iframe, browser's own viewer) and images (<img>, so even SVG can't run scripts) are previewed.
// Anything else, e.g. an uploaded .html, is downloaded and never rendered inside the app.
export function previewKind(doc: Pick<PreviewableDocument, 'originalName' | 'filePath'>): 'pdf' | 'image' | null {
  const ext = (doc.originalName.split('.').pop() || doc.filePath.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return null;
}

// Phones / tablets without a built-in PDF viewer (e.g. Chrome on Android) would show an empty frame
const canShowPdf = typeof navigator === 'undefined' || (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;

// Large in-app preview, so documents open the same way in the browser and the installed app (no new windows)
export function DocumentPreviewDialog({ doc, onClose }: { doc: PreviewableDocument | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => setZoomed(false), [doc]);
  const kind = doc ? previewKind(doc) : null;

  return (
    <Dialog open={!!doc} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 w-[96vw] max-w-[1400px] h-[94vh] p-0 overflow-hidden">
        {doc && (
          <>
            <div className="flex items-center gap-3 border-b px-4 py-3 pr-14">
              {kind === 'image' ? <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <DialogTitle className="text-sm font-semibold truncate flex-1 min-w-0">{doc.originalName}</DialogTitle>
              {doc.fileSize ? <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">{(doc.fileSize / 1024).toFixed(0)} KB</span> : null}
              <Button variant="outline" size="sm" asChild>
                <a href={doc.filePath} download={doc.originalName}><Download className="h-3.5 w-3.5 mr-1.5" />{t('common.download')}</a>
              </Button>
            </div>

            {kind === 'pdf' && canShowPdf && (
              <iframe src={doc.filePath} title={doc.originalName} className="flex-1 w-full border-0 bg-muted" />
            )}

            {kind === 'image' && (
              <div className={cn('flex-1 overflow-auto bg-muted/40', !zoomed && 'flex items-center justify-center p-4')}>
                <img
                  src={doc.filePath}
                  alt={doc.originalName}
                  title={t('pm.documents.zoomHint')}
                  onClick={() => setZoomed(z => !z)}
                  className={cn(zoomed ? 'max-w-none cursor-zoom-out' : 'max-w-full max-h-full object-contain cursor-zoom-in rounded shadow-sm')}
                />
              </div>
            )}

            {(kind === null || (kind === 'pdf' && !canShowPdf)) && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{t('pm.documents.noPreview')}</p>
                <Button asChild>
                  <a href={doc.filePath} download={doc.originalName}><Download className="h-4 w-4 mr-2" />{t('common.download')}</a>
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
