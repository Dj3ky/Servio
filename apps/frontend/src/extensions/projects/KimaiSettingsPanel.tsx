import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { kimaiErrorMessage } from './kimai';

interface KimaiSettings { url: string; tokenSet: boolean; }
interface KimaiTestResult { version: string; projectCount: number; customerCount: number; timesheetUsers: number; }

export function KimaiSettingsPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: saved } = useQuery<KimaiSettings>({
    queryKey: ['pm-kimai-settings'],
    queryFn: () => api.get('/pm/kimai/settings'),
  });
  const [editedUrl, setEditedUrl] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const url = editedUrl ?? saved?.url ?? '';
  const body = { url, ...(token ? { token } : {}) };

  const test = useMutation({
    mutationFn: () => api.post<KimaiTestResult>('/pm/kimai/test', body),
  });

  const save = useMutation({
    mutationFn: () => api.put('/pm/kimai/settings', body),
    onSuccess: () => {
      setToken('');
      setEditedUrl(null);
      qc.invalidateQueries({ queryKey: ['pm-kimai-settings'] });
      qc.invalidateQueries({ queryKey: ['pm-kimai-status'] });
      qc.invalidateQueries({ queryKey: ['pm-kimai-projects'] });
      qc.invalidateQueries({ queryKey: ['pm-kimai-customers'] });
      toast.success(t('extensions.saved'));
    },
    onError: (err) => toast.error(kimaiErrorMessage(err, t)),
  });

  return (
    <div className="border-t pt-3 space-y-3">
      <div>
        <p className="font-medium text-sm">{t('pm.kimai.settingsTitle')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t('pm.kimai.settingsDesc')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('pm.kimai.url')}</label>
          <Input
            type="url"
            placeholder="https://kimai.example.com"
            autoComplete="off"
            value={url}
            onChange={e => { setEditedUrl(e.target.value); test.reset(); }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('pm.kimai.token')}</label>
          <Input
            type="password"
            autoComplete="new-password"
            placeholder={saved?.tokenSet ? t('pm.kimai.tokenKeep') : ''}
            value={token}
            onChange={e => { setToken(e.target.value); test.reset(); }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!url || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? t('common.loading') : t('pm.kimai.test')}
        </Button>
        <Button type="button" size="sm" disabled={!url || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('common.loading') : t('common.save')}
        </Button>
      </div>
      {test.data && (
        <p className="text-xs text-green-600 dark:text-green-400">
          {t('pm.kimai.testOk', { version: test.data.version, projects: test.data.projectCount, customers: test.data.customerCount })}
        </p>
      )}
      {test.data?.timesheetUsers === 1 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{t('pm.kimai.testOnePerson')}</p>
      )}
      {test.error && <p className="text-xs text-destructive">{kimaiErrorMessage(test.error, t)}</p>}
    </div>
  );
}
