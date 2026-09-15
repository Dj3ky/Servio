import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, ChevronRight, History } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface ClProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  entryCount: number;
  lastActivityAt: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = { active: 'default', completed: 'secondary', archived: 'outline' };

const emptyForm = { name: '', description: '' };

export default function ChangelogProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery<ClProject[]>({
    queryKey: ['changelog-projects'],
    queryFn: () => api.get('/changelog/projects'),
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
    mutation.mutate(form);
  }

  const projects = data ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('changelog.projects.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('changelog.projects.subtitle')}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('changelog.projects.new')}</Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</p>}

      {!isLoading && projects.length === 0 && (
        <div className="rounded-md border py-12 text-center text-muted-foreground">
          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('common.noData')}</p>
        </div>
      )}

      {!isLoading && projects.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
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
                <tr key={p.id} className="border-b hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => navigate(`/changelog/projects/${p.id}`)}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_COLORS[p.status] as any}>{t(`changelog.status.${p.status}`)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.entryCount}</td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">
                    {p.lastActivityAt ? new Date(p.lastActivityAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? t('common.loading') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
