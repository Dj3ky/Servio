import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface ClProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

interface ClEntry {
  id: string;
  projectId: string;
  category: string;
  note: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  editedAt: string | null;
}

const CATEGORIES = ['electrical_schema', 'plc_program', 'mechanical', 'general', 'other'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  electrical_schema: 'default',
  plc_program: 'secondary',
  mechanical: 'outline',
  general: 'outline',
  other: 'outline',
};

const emptyEntryForm = { category: 'general' as string, note: '' };

export default function ChangelogProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [categoryFilter, setCategoryFilter] = useState('');
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClEntry | null>(null);

  const { data: project } = useQuery<ClProject>({
    queryKey: ['changelog-project', id],
    queryFn: () => api.get(`/changelog/projects/${id}`),
  });

  const entriesParams = new URLSearchParams();
  if (categoryFilter) entriesParams.set('category', categoryFilter);

  const { data: entries, isLoading } = useQuery<ClEntry[]>({
    queryKey: ['changelog-entries', id, categoryFilter],
    queryFn: () => api.get(`/changelog/projects/${id}/entries?${entriesParams}`),
  });

  const saveEntry = useMutation({
    mutationFn: (body: typeof entryForm) =>
      editingEntryId
        ? api.patch(`/changelog/projects/${id}/entries/${editingEntryId}`, body)
        : api.post(`/changelog/projects/${id}/entries`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelog-entries', id] });
      qc.invalidateQueries({ queryKey: ['changelog-projects'] });
      toast.success(t('changelog.entries.savedOk'));
      setEntryDialogOpen(false);
    },
    onError: () => toast.error(t('changelog.entries.saveError')),
  });

  const deleteEntry = useMutation({
    mutationFn: (entryId: string) => api.delete(`/changelog/projects/${id}/entries/${entryId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelog-entries', id] });
      qc.invalidateQueries({ queryKey: ['changelog-projects'] });
      toast.success(t('changelog.entries.deletedOk'));
      setDeleteTarget(null);
    },
    onError: () => toast.error(t('changelog.entries.deleteError')),
  });

  function openCreateEntry() {
    setEntryForm(emptyEntryForm);
    setEditingEntryId(null);
    setEntryDialogOpen(true);
  }

  function openEditEntry(entry: ClEntry) {
    setEntryForm({ category: entry.category, note: entry.note });
    setEditingEntryId(entry.id);
    setEntryDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveEntry.mutate(entryForm);
  }

  function canModify(entry: ClEntry) {
    return user?.role === 'admin' || entry.authorId === user?.id;
  }

  return (
    <div className="p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/changelog/projects')} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-2" />{t('common.back')}
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project?.name}</h1>
          {project?.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <Button onClick={openCreateEntry}><Plus className="h-4 w-4 mr-2" />{t('changelog.entries.new')}</Button>
      </div>

      <div className="flex items-center gap-3">
        <Select value={categoryFilter || 'all'} onValueChange={v => setCategoryFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder={t('changelog.entries.allCategories')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('changelog.entries.allCategories')}</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{t(`changelog.category.${c}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</p>}

      {!isLoading && (entries ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">{t('common.noData')}</p>
      )}

      <div className="space-y-3">
        {(entries ?? []).map(entry => (
          <div key={entry.id} className="rounded-lg border p-4 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={CATEGORY_COLORS[entry.category] as any}>{t(`changelog.category.${entry.category}`)}</Badge>
                <span className="text-sm font-medium">{entry.authorName}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.editedAt && ` (${t('changelog.entries.edited')})`}
                </span>
              </div>
              {canModify(entry) && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditEntry(entry)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(entry)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap">{entry.note}</p>
          </div>
        ))}
      </div>

      {/* Add/Edit entry dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntryId ? t('changelog.entries.edit') : t('changelog.entries.new')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.category')}</label>
              <Select value={entryForm.category} onValueChange={v => setEntryForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{t(`changelog.category.${c}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.note')} *</label>
              <Textarea
                value={entryForm.note}
                onChange={e => setEntryForm(f => ({ ...f, note: e.target.value }))}
                rows={4}
                required
                placeholder={t('changelog.entries.notePlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEntryDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={saveEntry.isPending}>{saveEntry.isPending ? t('common.loading') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('changelog.entries.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('changelog.entries.deleteConfirmDesc')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={deleteEntry.isPending}
              onClick={() => deleteTarget && deleteEntry.mutate(deleteTarget.id)}
            >
              {deleteEntry.isPending ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
