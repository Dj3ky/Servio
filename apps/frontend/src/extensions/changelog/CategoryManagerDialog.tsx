import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CATEGORY_COLOR_PRESETS, getCategoryLabel, getContrastColor, type ClCategory } from './constants';

interface CategoryManagerDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CategoryManagerDialog({ open, onClose }: CategoryManagerDialogProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CATEGORY_COLOR_PRESETS[0]);

  const { data: categories } = useQuery<ClCategory[]>({
    queryKey: ['changelog-categories'],
    queryFn: () => api.get('/changelog/categories'),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['changelog-categories'] });
  };

  const create = useMutation({
    mutationFn: () => api.post('/changelog/categories', { name: newName, color: newColor }),
    onSuccess: () => {
      invalidate();
      setNewName('');
      toast.success(t('changelog.categories.savedOk'));
    },
    onError: () => toast.error(t('changelog.categories.saveError')),
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/changelog/categories/${id}`, { name }),
    onSuccess: invalidate,
    onError: () => toast.error(t('changelog.categories.saveError')),
  });

  const recolor = useMutation({
    mutationFn: ({ id, color }: { id: string; color: string }) => api.patch(`/changelog/categories/${id}`, { color }),
    onSuccess: invalidate,
    onError: () => toast.error(t('changelog.categories.saveError')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/changelog/categories/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success(t('changelog.categories.deletedOk'));
    },
    onError: () => toast.error(t('changelog.categories.deleteError')),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('changelog.categories.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(categories ?? []).map(c => {
              const label = getCategoryLabel(c, t);
              return (
              <div key={c.id} className="flex items-center gap-2 rounded-md border p-2">
                <div className="flex gap-1 shrink-0">
                  {CATEGORY_COLOR_PRESETS.map(color => (
                    <button
                      key={color}
                      type="button"
                      className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: color }}
                      onClick={() => recolor.mutate({ id: c.id, color })}
                      title={color}
                    >
                      {c.color === color && <Check className="h-3 w-3" style={{ color: getContrastColor(color) }} />}
                    </button>
                  ))}
                </div>
                <Input
                  key={`${c.id}-${i18n.language}`}
                  defaultValue={label}
                  className="h-8 flex-1"
                  onBlur={(e) => { if (e.target.value && e.target.value !== label) rename.mutate({ id: c.id, name: e.target.value }); }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive shrink-0"
                  onClick={() => { if (confirm(t('changelog.categories.deleteConfirm'))) remove.mutate(c.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              );
            })}
            {(categories ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t('common.noData')}</p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t pt-4">
            <div className="flex gap-1 shrink-0">
              {CATEGORY_COLOR_PRESETS.map(color => (
                <button
                  key={color}
                  type="button"
                  className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: color }}
                  onClick={() => setNewColor(color)}
                  title={color}
                >
                  {newColor === color && <Check className="h-3 w-3" style={{ color: getContrastColor(color) }} />}
                </button>
              ))}
            </div>
            <Input
              placeholder={t('changelog.categories.newPlaceholder')}
              className="h-8 flex-1"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) create.mutate(); }}
            />
            <Button size="sm" onClick={() => create.mutate()} disabled={!newName.trim() || create.isPending}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
