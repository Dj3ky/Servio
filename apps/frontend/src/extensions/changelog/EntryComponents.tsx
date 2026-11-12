import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/utils';
import { getAvatarColor, getCategoryLabel, getContrastColor, getInitials, formatRelative, type ClCategory } from './constants';

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
              <a href={a.filePath} download={a.originalName} title={t('common.download')}><Download className="h-3 w-3" /></a>
            </Button>
            {canModify && onDelete && (
              <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 text-destructive" onClick={() => onDelete(a)} title={t('common.delete')}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

export interface TimelineEntryData {
  id: string;
  note: string;
  authorName: string;
  editedByName: string | null;
  createdAt: string;
  editedAt: string | null;
  attachments: EntryAttachment[];
}

// Day heading that stays pinned at the top while scrolling through that day's entries
export function TimelineDayHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
    </div>
  );
}

// One entry on the vertical timeline: a dot in the category colour, then author, time and the note.
export function TimelineEntry({ entry, category, aside, actions, canModify = false, onDeleteAttachment }: {
  entry: TimelineEntryData;
  category: ClCategory | null;
  aside?: ReactNode;
  actions?: ReactNode;
  canModify?: boolean;
  onDeleteAttachment?: (attachment: EntryAttachment) => void;
}) {
  const { t, i18n } = useTranslation();
  const dotColor = category?.color ?? 'hsl(var(--muted-foreground))';

  return (
    <li className="group relative pl-7 pb-5 last:pb-1">
      {/* line + dot */}
      <span className="absolute left-[5px] top-3 bottom-0 w-px bg-border group-last:hidden" aria-hidden />
      <span
        className="absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-4 ring-background"
        style={{ backgroundColor: dotColor }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Avatar name={entry.authorName} size="sm" />
          <span className="text-sm font-medium">{entry.authorName}</span>
          <span className="text-xs text-muted-foreground" title={formatDateTime(entry.createdAt)}>
            {formatRelative(entry.createdAt, i18n.language)}
          </span>
          {category && <CategoryPill category={category} label={getCategoryLabel(category, t)} />}
          {entry.editedAt && (
            <span className="text-xs text-muted-foreground italic" title={formatDateTime(entry.editedAt)}>
              · {t('changelog.entries.editedBy', { name: entry.editedByName ?? entry.authorName, date: formatRelative(entry.editedAt, i18n.language) })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {aside}
          {actions && (
            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
              {actions}
            </div>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-sm whitespace-pre-wrap break-words leading-relaxed">{entry.note}</p>
      <AttachmentGrid attachments={entry.attachments} canModify={canModify} onDelete={onDeleteAttachment} />
    </li>
  );
}

export function TimelineSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-24" />
      <ul className="space-y-6">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="relative pl-7">
            <Skeleton className="absolute left-0 top-1 h-[11px] w-[11px] rounded-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="mt-2 h-3 w-full max-w-lg" />
            <Skeleton className="mt-1.5 h-3 w-2/3 max-w-sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Category filter chips ───────────────────────────────────────────────────

export function CategoryChips({ categories, value, onChange }: {
  categories: ClCategory[];
  value: string;
  onChange: (categoryId: string) => void;
}) {
  const { t } = useTranslation();
  const base = 'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange('')}
        className={`${base} ${value === '' ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:border-foreground/40'}`}
      >
        {t('changelog.entries.allCategories')}
      </button>
      {categories.map(c => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(active ? '' : c.id)}
            className={`${base} ${active ? 'border-transparent' : 'text-muted-foreground hover:text-foreground hover:border-foreground/40'}`}
            style={active ? { backgroundColor: c.color, color: getContrastColor(c.color) } : undefined}
          >
            {!active && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />}
            {getCategoryLabel(c, t)}
          </button>
        );
      })}
    </div>
  );
}
