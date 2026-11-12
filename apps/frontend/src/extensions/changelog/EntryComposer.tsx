import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { Paperclip, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCategoryLabel, type ClCategory } from './constants';
import { CategoryPill, formatFileSize } from './EntryComponents';

// Inline "add entry" box at the top of a project: type, pick a category, attach, Ctrl+Enter.
export function EntryComposer({ categories, onSubmit, pending }: {
  categories: ClCategory[];
  onSubmit: (data: FormData) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveCategoryId = categoryId || categories[0]?.id || '';
  const expanded = focused || note.length > 0 || files.length > 0;

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...accepted.filter(f => !existing.has(f.name))];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ onDrop, multiple: true, noClick: true, noKeyboard: true });

  async function submit() {
    if (!note.trim() || pending) return;
    const fd = new FormData();
    if (effectiveCategoryId) fd.append('categoryId', effectiveCategoryId);
    fd.append('note', note);
    files.forEach(f => fd.append('files', f));
    try {
      await onSubmit(fd);
      setNote('');
      setFiles([]);
      textareaRef.current?.blur();
    } catch {
      // error toast is shown by the caller; keep the draft
    }
  }

  return (
    <div
      {...getRootProps()}
      className={`rounded-xl border bg-card shadow-sm transition-colors ${isDragActive ? 'border-primary ring-2 ring-primary/20' : 'focus-within:border-primary/50'}`}
    >
      <input {...getInputProps()} />
      <Textarea
        ref={textareaRef}
        value={note}
        onChange={e => setNote(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
        }}
        rows={expanded ? 4 : 1}
        placeholder={isDragActive ? t('changelog.entries.dropFiles') : t('changelog.entries.notePlaceholder')}
        className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-0 px-4 py-3 transition-[height]"
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {files.map(f => (
            <span key={f.name} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 pl-2 pr-1 py-0.5 text-xs">
              <Paperclip className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[160px] truncate">{f.name}</span>
              <span className="text-muted-foreground">{formatFileSize(f.size)}</span>
              <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => setFiles(prev => prev.filter(p => p.name !== f.name))} title={t('common.remove')}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t px-2 py-1.5">
        <Select value={effectiveCategoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-8 w-auto gap-2 border-0 bg-transparent shadow-none px-2 focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>
                <CategoryPill category={c} label={getCategoryLabel(c, t)} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={open} title={t('changelog.entries.attachments')}>
          <Paperclip className="h-4 w-4" />
          <span className="hidden sm:inline ml-1.5">{t('changelog.entries.attach')}</span>
        </Button>
        <span className="flex-1" />
        <span className="hidden md:inline text-[11px] text-muted-foreground">{t('changelog.entries.ctrlEnterHint')}</span>
        <Button type="button" size="sm" className="h-8" disabled={!note.trim() || pending} onClick={submit}>
          <Send className="h-3.5 w-3.5 mr-1.5" />{pending ? t('common.loading') : t('changelog.entries.new')}
        </Button>
      </div>
    </div>
  );
}
