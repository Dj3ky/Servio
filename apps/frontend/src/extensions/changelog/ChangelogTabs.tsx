import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, History } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { underlineTabsList, underlineTabsTrigger } from '@/components/ui/tab-styles';

// Projects / Recent activity switch shown at the top of both changelog list pages
export function ChangelogTabs({ value }: { value: 'projects' | 'activity' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const iconClass = 'h-4 w-4 group-data-[state=active]:text-primary';

  return (
    <Tabs value={value} onValueChange={v => navigate(v === 'activity' ? '/changelog/activity' : '/changelog/projects')}>
      <TabsList className={underlineTabsList}>
        <TabsTrigger value="projects" className={underlineTabsTrigger}>
          <FolderKanban className={iconClass} />{t('changelog.tabs.projects')}
        </TabsTrigger>
        <TabsTrigger value="activity" className={underlineTabsTrigger}>
          <History className={iconClass} />{t('changelog.activity.title')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
