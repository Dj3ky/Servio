import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  projectId: string;
  notes: string | null;
  canManage: boolean;
}

// The project's standing "Opombe" (set on creation; also shown in the list hint, print and CSV).
// Separate from the Zapiski tab, which is a dated log. Managers edit it in place.
export function ProjectNotesBox({ projectId, notes, canManage }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const text = notes?.trim() ?? '';

  // Offer "show more" only when the clamped text is actually cut off
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded, editing]);

  const save = useMutation({
    mutationFn: (value: string) => api.patch(`/pm/projects/${projectId}`, { notes: value.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pm-project', projectId] });
      qc.invalidateQueries({ queryKey: ['pm-projects'] });
      setEditing(false);
      toast.success(t('pm.projects.savedOk'));
    },
    onError: () => toast.error(t('pm.projects.saveError')),
  });

  function startEdit() {
    setDraft(notes ?? '');
    setEditing(true);
  }

  if (editing) {
    return (
      <div className="rounded-lg border p-4 space-y-3">
        <div className="text-sm font-medium">{t('pm.fields.notes')}</div>
        <Textarea
          autoFocus
          rows={4}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save.mutate(draft); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
          placeholder={t('pm.fields.notes') + '...'}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={save.isPending}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending}>
            {save.isPending ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </div>
    );
  }

  if (!text) {
    if (!canManage) return null;
    return (
      <button
        onClick={startEdit}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />{t('pm.projects.addNotes')}
      </button>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{t('pm.fields.notes')}</div>
        {canManage && (
          <Button variant="ghost" size="icon" className="h-7 w-7 -my-1" onClick={startEdit} title={t('common.edit')} aria-label={t('common.edit')}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <p ref={textRef} className={`text-sm text-muted-foreground whitespace-pre-line break-words ${expanded ? '' : 'line-clamp-3'}`}>
        {text}
      </p>
      {(overflowing || expanded) && (
        <button onClick={() => setExpanded(v => !v)} className="text-xs font-medium text-primary hover:underline">
          {expanded ? t('pm.projects.showLess') : t('pm.projects.showMore')}
        </button>
      )}
    </div>
  );
}
