import { useTranslation } from 'react-i18next';
import { Paperclip, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAvatarColor, getContrastColor, getInitials, type ClCategory } from './constants';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];

function isImageFile(name: string) {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const color = getAvatarColor(name);
  const dim = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-medium shrink-0 ${dim}`}
      style={{ backgroundColor: color, color: getContrastColor(color) }}
      title={name}
    >
      {getInitials(name)}
    </span>
  );
}

export function CategoryPill({ category, label }: { category: Pick<ClCategory, 'color'>; label: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: category.color, color: getContrastColor(category.color) }}
    >
      {label}
    </span>
  );
}

export function formatFileSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface EntryAttachment {
  id: string;
  originalName: string;
  filePath: string;
  fileSize: number | null;
}

export function AttachmentGrid({ attachments, canModify, onDelete }: {
  attachments: EntryAttachment[];
  canModify: boolean;
  onDelete?: (attachment: EntryAttachment) => void;
}) {
  const { t } = useTranslation();
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {attachments.map(a => {
        if (isImageFile(a.originalName)) {
          return (
            <div key={a.id} className="relative group">
              <a href={a.filePath} target="_blank" rel="noopener noreferrer">
                <img
                  src={a.filePath}
                  alt={a.originalName}
                  className="h-20 w-20 object-cover rounded-md border"
                />
              </a>
              {canModify && onDelete && (
                <button
                  type="button"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onDelete(a)}
                  title={t('common.delete')}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        }
        return (
          <div key={a.id} className="flex items-center gap-1.5 rounded-md border bg-muted/30 pl-2 pr-1 py-1 text-xs">
            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
            <a href={a.filePath} download={a.originalName} className="hover:underline max-w-[160px] truncate">{a.originalName}</a>
            <span className="text-muted-foreground">{formatFileSize(a.fileSize)}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" asChild>
              <a href={a.filePath} download={a.originalName}><Download className="h-3 w-3" /></a>
            </Button>
            {canModify && onDelete && (
              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-destructive" onClick={() => onDelete(a)}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
