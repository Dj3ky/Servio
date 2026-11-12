import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, History, FolderOpen } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { groupByDay, type ClCategory } from '../constants';
import { CategoryChips, TimelineDayHeader, TimelineEntry, TimelineSkeleton, type EntryAttachment } from '../EntryComponents';
import { ChangelogTabs } from '../ChangelogTabs';

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

const PAGE_SIZE = 50;

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

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['changelog-activity', categoryFilter, debouncedSearch],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (pageParam) params.set('before', pageParam);
      return api.get<ActivityEntry[]>(`/changelog/activity?${params}`);
    },
    getNextPageParam: (lastPage: ActivityEntry[]) =>
      lastPage.length < PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].createdAt,
  });

  // Pages can overlap by one entry at the cursor boundary, so de-duplicate by id
  const seen = new Set<string>();
  const entries = (data?.pages ?? []).flat().filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)));

  function categoryFor(categoryId: string | null) {
    return (categories ?? []).find(c => c.id === categoryId) ?? null;
  }

  const dayGroups = groupByDay(entries, t, i18n.language);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('changelog.projects.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('changelog.activity.subtitle')}</p>
      </div>

      <ChangelogTabs value="activity" />

      <div className="space-y-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <CategoryChips categories={categories ?? []} value={categoryFilter} onChange={setCategoryFilter} />
      </div>

      {isLoading && <TimelineSkeleton />}

      {!isLoading && entries.length === 0 && (
        <div className="rounded-lg border border-dashed py-14 text-center text-muted-foreground">
          <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('common.noData')}</p>
        </div>
      )}

      <div className="max-w-4xl">
        {dayGroups.map(group => (
          <section key={group.label}>
            <TimelineDayHeader label={group.label} />
            <ol className="pt-2 pb-4">
              {group.items.map(entry => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  category={categoryFor(entry.categoryId)}
                  aside={
                    <button
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors max-w-[220px]"
                      onClick={() => navigate(`/changelog/projects/${entry.projectId}`)}
                    >
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      <span className="truncate">{entry.projectName}</span>
                    </button>
                  }
                />
              ))}
            </ol>
          </section>
        ))}

        {hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? t('common.loading') : t('changelog.activity.loadMore')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
