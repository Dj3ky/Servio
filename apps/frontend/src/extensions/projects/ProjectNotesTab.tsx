import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useCan } from '@/stores/permissionsStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface PmNote {
  id: string; projectId: string; authorId: string | null; authorName: string | null;
  body: string; createdAt: string; updatedAt: string;
}

// Text box for a new note or an edit; Ctrl+Enter saves
function NoteForm({ initial = '', busy, autoFocus, onSave, onCancel }: {
  initial?: string; busy: boolean; autoFocus?: boolean;
  onSave: (body: string) => void; onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState(initial);
  const canSave = !!body.trim() && body.trim() !== initial.trim() && !busy;

  function save() {
    if (canSave) onSave(body.trim());
  }

  return (
    <div className="space-y-2">
      <Textarea
        autoFocus={autoFocus}
        rows={3}
        value={body}
        placeholder={t('pm.notes.placeholder')}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }}
      />
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button size="sm" disabled={!canSave} onClick={save}>{onCancel ? t('common.save') : t('pm.notes.add')}</Button>
      </div>
    </div>
  );
}

export function ProjectNotesTab({ projectId, notes, assigneeId }: {
  projectId: string; notes: PmNote[]; assigneeId: string | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  // Remounts the new-note form after a save so it starts empty
  const [formKey, setFormKey] = useState(0);
  const userId = useAuthStore(s => s.user?.id);
  const canManage = useCan()('projects', 'manage');
  const canWrite = canManage || (!!userId && userId === assigneeId);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['pm-project-notes', projectId] });
    qc.invalidateQueries({ queryKey: ['pm-projects'] });
  }

  const addNote = useMutation({
    mutationFn: (body: string) => api.post(`/pm/projects/${projectId}/notes`, { body }),
    onSuccess: () => { invalidate(); setFormKey(k => k + 1); toast.success(t('pm.notes.addedOk')); },
    onError: () => toast.error(t('pm.notes.error')),
  });

  const updateNote = useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) => api.patch(`/pm/projects/${projectId}/notes/${noteId}`, { body }),
    onSuccess: () => { invalidate(); setEditingId(null); toast.success(t('pm.notes.updatedOk')); },
    onError: () => toast.error(t('pm.notes.error')),
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: string) => api.delete(`/pm/projects/${projectId}/notes/${noteId}`),
    onSuccess: () => { invalidate(); toast.success(t('pm.notes.deletedOk')); },
    onError: () => toast.error(t('pm.notes.error')),
  });

  return (
    <div className="space-y-4 mt-4">
      {canWrite && (
        <Card>
          <CardContent className="p-4">
            <NoteForm key={formKey} busy={addNote.isPending} onSave={body => addNote.mutate(body)} />
          </CardContent>
        </Card>
      )}

      {notes.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}

      <div className="space-y-2">
        {notes.map(note => {
          const isAuthor = !!userId && note.authorId === userId;
          const edited = new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000;
          return (
            <div key={note.id} className="p-3 rounded-md border bg-card text-sm space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{note.authorName ?? t('pm.notes.unknownAuthor')}</span>
                <span>{formatDateTime(note.createdAt)}</span>
                {edited && <span title={formatDateTime(note.updatedAt)}>· {t('pm.notes.edited')}</span>}
                <span className="flex-1" />
                {isAuthor && editingId !== note.id && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingId(note.id)} title={t('common.edit')}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
                {(isAuthor || canManage) && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" title={t('common.delete')}
                    onClick={() => { if (confirm(t('pm.notes.deleteConfirm'))) deleteNote.mutate(note.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {editingId === note.id ? (
                <NoteForm
                  autoFocus
                  initial={note.body}
                  busy={updateNote.isPending}
                  onSave={body => updateNote.mutate({ noteId: note.id, body })}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <p className="whitespace-pre-wrap break-words">{note.body}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Note count next to the project name in the list; hover shows the newest note
export function ProjectNoteCount({ count, latest }: { count: number; latest: string | null }) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-0.5 text-xs text-muted-foreground cursor-help shrink-0" onClick={e => e.stopPropagation()}>
            <MessageSquare className="h-3.5 w-3.5" />{count}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-sm whitespace-pre-wrap text-xs">
          <p className="font-medium mb-1">{t('pm.notes.latest')}</p>
          {latest}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
