import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, ChevronRight, History, Search, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CategoryManagerDialog } from '../CategoryManagerDialog';
import { ContactsEditor, cleanContacts, type ClContact } from '../ContactsEditor';
import { ChangelogTabs } from '../ChangelogTabs';
import { formatRelative } from '../constants';

interface ClProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  nasPath: string | null;
  entryCount: number;
  lastActivityAt: string | null;
  updatedByName: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = { active: 'default', completed: 'secondary', archived: 'outline' };
const STATUS_FILTERS = ['active', 'completed', 'archived', 'all'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const emptyForm = { name: '', description: '', nasPath: '', contacts: [] as ClContact[] };

export default function ChangelogProjectsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const perms = usePermissionsStore(s => s.perms);
  const canManageChangelog = user ? (perms.changelog?.manage ?? []).includes(user.role) : false;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const debouncedSearch = useDebounce(search, 300);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set('search', debouncedSearch);

  const { data, isLoading } = useQuery<ClProject[]>({
    queryKey: ['changelog-projects', debouncedSearch],
    queryFn: () => api.get(`/changelog/projects?${params}`),
  });

  const mutation = useMutation({
    mutationFn: (body: typeof form) => api.post('/changelog/projects', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changelog-projects'] });
      toast.success(t('changelog.projects.createdOk'));
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: () => toast.error(t('changelog.projects.saveError')),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({ ...form, contacts: cleanContacts(form.contacts) });
  }

  const allProjects = data ?? [];
  const counts: Record<StatusFilter, number> = {
    active: allProjects.filter(p => p.status === 'active').length,
    completed: allProjects.filter(p => p.status === 'completed').length,
    archived: allProjects.filter(p => p.status === 'archived').length,
    all: allProjects.length,
  };
  // Most recently touched projects first
  const projects = allProjects
    .filter(p => statusFilter === 'all' || p.status === statusFilter)
    .sort((a, b) => new Date(b.lastActivityAt ?? b.createdAt).getTime() - new Date(a.lastActivityAt ?? a.createdAt).getTime());

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t('changelog.projects.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('changelog.projects.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageChangelog && (
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />{t('changelog.categories.manage')}
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('changelog.projects.new')}</Button>
        </div>
      </div>

      <ChangelogTabs value="projects" />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="inline-flex items-center rounded-lg border p-0.5 bg-muted/40">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all' ? t('common.all') : t(`changelog.status.${s}`)}
              {!isLoading && <span className="text-[10px] text-muted-foreground tabular-nums">{counts[s]}</span>}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="rounded-lg border divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-20 hidden sm:block" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <div className="rounded-lg border border-dashed py-14 text-center text-muted-foreground">
          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('common.noData')}</p>
        </div>
      )}

      {!isLoading && projects.length > 0 && (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">{t('changelog.fields.name')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('changelog.fields.entryCount')}</th>
                <th className="text-left px-4 py-3 font-medium">{t('changelog.fields.lastActivity')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} className="group border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/changelog/projects/${p.id}`)}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_COLORS[p.status] as any}>{t(`changelog.status.${p.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{p.entryCount}</td>
                  <td className="px-4 py-3 text-muted-foreground text-sm whitespace-nowrap">
                    {p.lastActivityAt
                      ? <span title={formatDateTime(p.lastActivityAt)}>{formatRelative(p.lastActivityAt, i18n.language)}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground inline transition-transform group-hover:translate-x-0.5" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('changelog.projects.new')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.name')} *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.description')}</label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('changelog.fields.nasPath')}</label>
              <Input
                value={form.nasPath}
                onChange={e => setForm(f => ({ ...f, nasPath: e.target.value }))}
                placeholder={t('changelog.fields.nasPathPlaceholder')}
              />
            </div>
            <ContactsEditor value={form.contacts} onChange={contacts => setForm(f => ({ ...f, contacts }))} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? t('common.loading') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CategoryManagerDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </div>
  );
}
