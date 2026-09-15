import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, History } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCategoryLabel, groupByDay, type ClCategory } from '../constants';
import { Avatar, CategoryPill, AttachmentGrid, type EntryAttachment } from '../EntryComponents';

interface ActivityEntry {
  id: string;
  projectId: string;
  projectName: string;
  categoryId: string | null;
  note: string;
  authorName: string;
  editedByName: string | null;
  createdAt: string;
  editedAt: string | null;
  attachments: EntryAttachment[];
}

export default function ChangelogActivityPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: categories } = useQuery<ClCategory[]>({
    queryKey: ['changelog-categories'],
    queryFn: () => api.get('/changelog/categories'),
  });

  const params = new URLSearchParams();
  if (categoryFilter) params.set('categoryId', categoryFilter);
  if (debouncedSearch) params.set('search', debouncedSearch);

  const { data: entries, isLoading } = useQuery<ActivityEntry[]>({
    queryKey: ['changelog-activity', categoryFilter, debouncedSearch],
    queryFn: () => api.get(`/changelog/activity?${params}`),
  });

  function categoryFor(categoryId: string | null) {
    return (categories ?? []).find(c => c.id === categoryId) ?? null;
  }

  const dayGroups = groupByDay(entries ?? [], t, i18n.language);

  return (
    <div className="p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/changelog/projects')} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-2" />{t('common.back')}
      </Button>

      <div>
        <h1 className="text-2xl font-bold">{t('changelog.activity.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('changelog.activity.subtitle')}</p>
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
        <div className="rounded-md border py-12 text-center text-muted-foreground">
          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('common.noData')}</p>
        </div>
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
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {entry.editedAt && (
                        <span className="text-xs text-muted-foreground">
                          · {t('changelog.entries.editedBy', { name: entry.editedByName ?? entry.authorName, date: new Date(entry.editedAt).toLocaleString() })}
                        </span>
                      )}
                    </div>
                    <button
                      className="text-xs font-medium text-primary hover:underline shrink-0"
                      onClick={() => navigate(`/changelog/projects/${entry.projectId}`)}
                    >
                      {entry.projectName}
                    </button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{entry.note}</p>
                  <AttachmentGrid attachments={entry.attachments} canModify={false} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
