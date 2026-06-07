import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, FolderOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ProjectDocumentUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => void;
  uploading: boolean;
}

export function ProjectDocumentUploadDialog({ open, onClose, onUpload, uploading }: ProjectDocumentUploadDialogProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!open) setFiles([]);
  }, [open]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...acceptedFiles.filter(f => !existing.has(f.name))];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
    onDrop,
    multiple: true,
    disabled: uploading,
  });

  function handleClose() {
    if (uploading) return;
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>{t('pm.documents.upload')}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-4">
          <div>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t('reviews.dropOrClick')}</p>
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
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.name} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(f.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setFiles(prev => prev.filter(p => p.name !== f.name))}
                    disabled={uploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={uploading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => onUpload(files)} disabled={uploading || files.length === 0}>
              {uploading ? t('common.loading') : t('pm.documents.upload')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
