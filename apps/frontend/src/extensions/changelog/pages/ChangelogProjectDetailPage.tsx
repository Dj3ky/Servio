import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { ArrowLeft, Plus, Pencil, Trash2, Search, Upload, Paperclip, X, Copy, FolderOpen, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getCategoryLabel, groupByDay, type ClCategory } from '../constants';
import { Avatar, CategoryPill, AttachmentGrid, formatFileSize, type EntryAttachment } from '../EntryComponents';

interface ClProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  nasPath: string | null;
  createdById: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

interface ClEntry {
  id: string;
  projectId: string;
  categoryId: string | null;
  note: string;
  authorId: string | null;
  authorName: string;
  editedById: string | null;
  editedByName: string | null;
  createdAt: string;
  editedAt: string | null;
  attachments: EntryAttachment[];
}

const emptyEntryForm = { categoryId: '', note: '' };
const emptyProjectForm = { name: '', description: '', status: 'active', nasPath: '' };

export default function ChangelogProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const perms = usePermissionsStore(s => s.perms);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [entryFiles, setEntryFiles] = useState<File[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClEntry | null>(null);
  const [deleteAttachmentTarget, setDeleteAttachmentTarget] = useState<{ entryId: string; attachment: EntryAttachment } | null>(null);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);

  const { data: project } = useQuery<ClProject>({
    queryKey: ['changelog-project', id],
    queryFn: () => api.get(`/changelog/projects/${id}`),
  });

  const { data: categories } = useQuery<ClCategory[]>({
    queryKey: ['changelog-categories'],
    queryFn: () => api.get('/changelog/categories'),
  });

  const entriesParams = new URLSearchParams();
  if (categoryFilter) entriesParams.set('categoryId', categoryFilter);
  if (debouncedSearch) entriesParams.set('search', debouncedSearch);

  const { data: entries, isLoading } = useQuery<ClEntry[]>({
    queryKey: ['changelog-entries', id, categoryFilter, debouncedSearch],
    queryFn: () => api.get(`/changelog/projects/${id}/entries?${entriesParams}`),
  });

  function categoryFor(categoryId: string | null) {
    return (categories ?? []).find(c => c.id === categoryId) ?? null;
  }

  const canManageChangelog = user ? (perms.changelog?.manage ?? []).includes(user.role) : false;

  function canModify(entry: ClEntry) {
    return canManageChangelog || entry.authorId === user?.id;
  }

  function buildEntryFormData() {
    const fd = new FormData();
    if (entryForm.categoryId) fd.append('categoryId', entryForm.categoryId);
    fd.append('note', entryForm.note);
    entryFiles.forEach(f => fd.append('files', f));
    return fd;
  }

  const saveEntry = useMutation({
    mutationFn: () =>
      editingEntryId
        ? api.patch(`/changelog/projects/${id}/entries/${editingEntryId}`, buildEntryFormData())
        : api.post(`/changelog/projects/${id}/entries`, buildEntryFormData()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelog-entries', id] });
      qc.invalidateQueries({ queryKey: ['changelog-projects'] });
      toast.success(t('changelog.entries.savedOk'));
      setEntryDialogOpen(false);
    },
    onError: () => toast.error(t('changelog.entries.saveError')),
  });

  const restoreEntry = useMutation({
    mutationFn: (entryId: string) => api.post(`/changelog/projects/${id}/entries/${entryId}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelog-entries', id] });
      qc.invalidateQueries({ queryKey: ['changelog-projects'] });
    },
    onError: () => toast.error(t('changelog.entries.restoreError')),
  });

  const deleteEntry = useMutation({
    mutationFn: (entryId: string) => api.delete(`/changelog/projects/${id}/entries/${entryId}`),
    onSuccess: (_data, entryId) => {
      qc.invalidateQueries({ queryKey: ['changelog-entries', id] });
      qc.invalidateQueries({ queryKey: ['changelog-projects'] });
      setDeleteTarget(null);
      toast((tItem) => (
        <div className="flex items-center gap-3">
          <span className="text-sm">{t('changelog.entries.deletedOk')}</span>
          <button
            className="text-sm font-medium underline shrink-0"
            onClick={() => { restoreEntry.mutate(entryId); toast.dismiss(tItem.id); }}
          >
            {t('common.undo')}
          </button>
        </div>
      ), { duration: 6000 });
    },
    onError: () => toast.error(t('changelog.entries.deleteError')),
  });

  const deleteAttachment = useMutation({
    mutationFn: ({ entryId, attachmentId }: { entryId: string; attachmentId: string }) =>
      api.delete(`/changelog/projects/${id}/entries/${entryId}/attachments/${attachmentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelog-entries', id] });
      setDeleteAttachmentTarget(null);
    },
    onError: () => toast.error(t('changelog.entries.deleteError')),
  });

  const saveProject = useMutation({
    mutationFn: () => api.patch(`/changelog/projects/${id}`, projectForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelog-project', id] });
      qc.invalidateQueries({ queryKey: ['changelog-projects'] });
      toast.success(t('changelog.projects.savedOk'));
      setProjectDialogOpen(false);
    },
    onError: () => toast.error(t('changelog.projects.saveError')),
  });

  const deleteProject = useMutation({
    mutationFn: () => api.delete(`/changelog/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelog-projects'] });
      toast.success(t('changelog.projects.deletedOk'));
      navigate('/changelog/projects');
    },
    onError: () => toast.error(t('changelog.projects.deleteError')),
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setEntryFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...acceptedFiles.filter(f => !existing.has(f.name))];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: true });

  function openCreateEntry() {
    setEntryForm({ categoryId: categories?.[0]?.id ?? '', note: '' });
    setEntryFiles([]);
    setEditingEntryId(null);
    setEntryDialogOpen(true);
  }

  function openEditEntry(entry: ClEntry) {
    setEntryForm({ categoryId: entry.categoryId ?? '', note: entry.note });
    setEntryFiles([]);
    setEditingEntryId(entry.id);
    setEntryDialogOpen(true);
  }

  function openEditProject() {
    if (!project) return;
    setProjectForm({
      name: project.name,
      description: project.description ?? '',
      status: project.status,
      nasPath: project.nasPath ?? '',
    });
    setProjectDialogOpen(true);
  }

  function handleEntrySubmit(e: React.FormEvent) {
    e.preventDefault();
    saveEntry.mutate();
  }

  function handleProjectSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveProject.mutate();
  }

  async function copyNasPath() {
    if (!project?.nasPath) return;
    try {
      await navigator.clipboard.writeText(project.nasPath);
      toast.success(t('changelog.projects.pathCopied'));
    } catch {
      toast.error(t('changelog.projects.pathCopyFailed'));
    }
  }

  function printChangelog() {
    if (!project || !entries) return;
    const date = new Date().toLocaleDateString(i18n.language);

    const rows = entries.map(e => {
      const cat = categoryFor(e.categoryId);
      return `<div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #e2e8f0">
        <div style="font-size:11px;color:#555;margin-bottom:3px">
          ${cat ? `<strong>${getCategoryLabel(cat, t)}</strong> · ` : ''}${e.authorName} · ${new Date(e.createdAt).toLocaleString(i18n.language)}
        </div>
        <div style="font-size:12px;white-space:pre-wrap">${e.note.replace(/</g, '&lt;')}</div>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>${project.name}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; color: #111; }
        h1 { font-size: 18px; margin: 0 0 2px 0; }
        .meta { font-size: 10px; color: #666; margin-bottom: 16px; }
        @media print { button { display: none; } }
      </style>
    </head><body>
      <h1>${project.name}</h1>
      <div class="meta">${date} · ${entries.length} ${t('changelog.fields.entryCount').toLowerCase()}</div>
      ${rows}
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  const dayGroups = groupByDay(entries ?? [], t, i18n.language);

  return (
    <div className="p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/changelog/projects')} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-2" />{t('common.back')}
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{project?.name}</h1>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openEditProject}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
          {project?.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
          {project?.nasPath && (
            <div className="flex items-center gap-2 mt-1">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <code className="text-xs text-muted-foreground">{project.nasPath}</code>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyNasPath}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
          {project?.updatedByName && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('changelog.projects.lastUpdatedBy', { name: project.updatedByName, date: new Date(project.updatedAt).toLocaleString() })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={printChangelog} title={t('common.print')}>
            <Printer className="h-4 w-4" />
          </Button>
          <Button onClick={openCreateEntry}><Plus className="h-4 w-4 mr-2" />{t('changelog.entries.new')}</Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={categoryFilter || 'all'} onValueChange={v => setCategoryFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder={t('changelog.entries.allCategories')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('changelog.entries.allCategories')}</SelectItem>
            {(categories ?? []).map(c => (
              <SelectItem key={c.id} value={c.id}>
                <CategoryPill category={c} label={getCategoryLabel(c, t)} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</p>}

      {!isLoading && (entries ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">{t('common.noData')}</p>
      )}

      <div className="space-y-6">
        {dayGroups.map(group => (
          <div key={group.label} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
            {group.items.map(entry => {
              const cat = categoryFor(entry.categoryId);
              return (
                <div key={entry.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {cat && <CategoryPill category={cat} label={getCategoryLabel(cat, t)} />}
                      <Avatar name={entry.authorName} />
                      <span className="text-sm font-medium">{entry.authorName}</span>
                      <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</span>
                      {entry.editedAt && (
                        <span className="text-xs text-muted-foreground">
                          · {t('changelog.entries.editedBy', { name: entry.editedByName ?? entry.authorName, date: new Date(entry.editedAt).toLocaleString() })}
                        </span>
                      )}
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
                  <AttachmentGrid
                    attachments={entry.attachments}
                    canModify={canModify(entry)}
                    onDelete={(a) => setDeleteAttachmentTarget({ entryId: entry.id, attachment: a })}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Add/Edit entry dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEntryId ? t('changelog.entries.edit') : t('changelog.entries.new')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEntrySubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.category')}</label>
              <Select value={entryForm.categoryId} onValueChange={v => setEntryForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <CategoryPill category={c} label={getCategoryLabel(c, t)} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.note')} *</label>
              <Textarea
                value={entryForm.note}
                onChange={e => setEntryForm(f => ({ ...f, note: e.target.value }))}
                rows={8}
                required
                placeholder={t('changelog.entries.notePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('changelog.entries.attachments')}</label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">{t('changelog.entries.dropFiles')}</p>
              </div>
              {entryFiles.length > 0 && (
                <div className="space-y-1">
                  {entryFiles.map(f => (
                    <div key={f.name} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs">
                      <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-muted-foreground">{formatFileSize(f.size)}</span>
                      <button type="button" onClick={() => setEntryFiles(prev => prev.filter(p => p.name !== f.name))}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEntryDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={saveEntry.isPending}>{saveEntry.isPending ? t('common.loading') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit project dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('changelog.projects.edit')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProjectSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.name')} *</label>
              <Input value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.description')}</label>
              <Textarea value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('common.status')}</label>
              <Select value={projectForm.status} onValueChange={v => setProjectForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('changelog.status.active')}</SelectItem>
                  <SelectItem value="completed">{t('changelog.status.completed')}</SelectItem>
                  <SelectItem value="archived">{t('changelog.status.archived')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.nasPath')}</label>
              <Input
                value={projectForm.nasPath}
                onChange={e => setProjectForm(f => ({ ...f, nasPath: e.target.value }))}
                placeholder={t('changelog.fields.nasPathPlaceholder')}
              />
            </div>
            <DialogFooter className="sm:justify-between">
              {(canManageChangelog || project?.createdById === user?.id) ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => { setProjectDialogOpen(false); setDeleteProjectOpen(true); }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />{t('changelog.projects.delete')}
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setProjectDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={saveProject.isPending}>{saveProject.isPending ? t('common.loading') : t('common.save')}</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete project confirm dialog */}
      <Dialog open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('changelog.projects.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('changelog.projects.deleteConfirmDesc')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProjectOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" disabled={deleteProject.isPending} onClick={() => deleteProject.mutate()}>
              {deleteProject.isPending ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete entry confirm dialog */}
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

      {/* Delete attachment confirm dialog */}
      <Dialog open={deleteAttachmentTarget !== null} onOpenChange={(open) => { if (!open) setDeleteAttachmentTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('changelog.entries.deleteAttachmentConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteAttachmentTarget && t('changelog.entries.deleteAttachmentConfirmDesc', { name: deleteAttachmentTarget.attachment.originalName })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAttachmentTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={deleteAttachment.isPending}
              onClick={() => deleteAttachmentTarget && deleteAttachment.mutate({ entryId: deleteAttachmentTarget.entryId, attachmentId: deleteAttachmentTarget.attachment.id })}
            >
              {deleteAttachment.isPending ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
