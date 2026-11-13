import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Puzzle, FolderKanban, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useSettingsStore } from '@/stores/settingsStore';
import { KimaiSettingsPanel } from '@/extensions/projects/KimaiSettingsPanel';

interface ExtensionCardConfig {
  key: 'projects' | 'changelog';
  icon: React.ComponentType<{ className?: string }>;
  configEndpoint: string;
  removeEndpoint: string;
}

const EXTENSION_CARDS: ExtensionCardConfig[] = [
  { key: 'projects', icon: FolderKanban, configEndpoint: '/pm/config', removeEndpoint: '/pm/extension-data' },
  { key: 'changelog', icon: History, configEndpoint: '/changelog/config', removeEndpoint: '/changelog/extension-data' },
];

function ExtensionRow({ config }: { config: ExtensionCardConfig }) {
  const { t } = useTranslation();
  const ext = useSettingsStore(s => s.settings.extensions[config.key]);
  const Icon = config.icon;

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch(config.configEndpoint, { extension: config.key, enabled }),
    onSuccess: async () => {
      const pub = await api.get<any>('/settings/public');
      useSettingsStore.getState().setSettings(pub);
      toast.success(t('extensions.saved'));
    },
    onError: () => toast.error(t('extensions.saveFailed')),
  });

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">{t(`extensions.${config.key}.name`)}</p>
              {ext.licensed
                ? <Badge variant="default" className="text-xs">{t('extensions.licensed')}</Badge>
                : <Badge variant="outline" className="text-xs text-muted-foreground">{t('extensions.notLicensed')}</Badge>
              }
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{t(`extensions.${config.key}.desc`)}</p>
          </div>
        </div>
        <Switch
          checked={ext.enabled}
          disabled={!ext.licensed || toggle.isPending}
          onCheckedChange={v => toggle.mutate(v)}
        />
      </div>
      {!ext.licensed && (
        <p className="text-xs text-muted-foreground border-t pt-3">{t('extensions.requiresLicense')}</p>
      )}
      {config.key === 'projects' && ext.enabled && <KimaiSettingsPanel />}
    </div>
  );
}

export function ExtensionsTab() {
  const { t } = useTranslation();
  const extensions = useSettingsStore(s => s.settings.extensions);
  const [removeTarget, setRemoveTarget] = useState<ExtensionCardConfig | null>(null);
  const [removeInput, setRemoveInput] = useState('');

  const licensedCards = EXTENSION_CARDS.filter(c => extensions[c.key].licensed);

  const removeData = useMutation({
    mutationFn: (config: ExtensionCardConfig) => api.delete(config.removeEndpoint),
    onSuccess: async () => {
      const pub = await api.get<any>('/settings/public');
      useSettingsStore.getState().setSettings(pub);
      toast.success(t('extensions.removeSuccess'));
      setRemoveTarget(null);
      setRemoveInput('');
    },
    onError: () => toast.error(t('extensions.removeFailed')),
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-4 w-4" />
            {t('extensions.title')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t('extensions.desc')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {EXTENSION_CARDS.map(config => (
            <ExtensionRow key={config.key} config={config} />
          ))}
        </CardContent>
      </Card>

      {/* Danger zone — one row per extension that has been set up */}
      {licensedCards.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-4">
            <CardTitle className="text-destructive text-base">{t('extensions.dangerZone')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {licensedCards.map(config => (
              <div key={config.key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{t('extensions.removeData')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t(`extensions.${config.key}.removeDataDesc`)}</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => { setRemoveInput(''); setRemoveTarget(config); }}>
                  {t('extensions.removeBtn')}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Confirm remove dialog */}
      <Dialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('extensions.removeConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>{removeTarget && t(`extensions.${removeTarget.key}.removeConfirmDesc`)}</p>
            <p className="text-muted-foreground">{t('extensions.removeConfirmType')} <strong>{t('extensions.removeConfirmWord')}</strong></p>
            <Input
              value={removeInput}
              onChange={e => setRemoveInput(e.target.value)}
              placeholder={t('extensions.removeConfirmWord')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={removeInput !== t('extensions.removeConfirmWord') || removeData.isPending}
              onClick={() => removeTarget && removeData.mutate(removeTarget)}
            >
              {removeData.isPending ? t('common.loading') : t('extensions.removeBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
