import { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { PowerOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

// The open tab tells SettingsPage whether it has unsaved changes, so leaving it can be confirmed.
// Only one tab is mounted at a time, so a single flag is enough.
export const UnsavedChangesContext = createContext<(dirty: boolean) => void>(() => {});

export function useReportUnsaved(dirty: boolean) {
  const report = useContext(UnsavedChangesContext);
  useEffect(() => { report(dirty); }, [dirty, report]);
  useEffect(() => () => report(false), [report]);
}

// "Turn off" card for a connection (SMTP, SMB): clears its server and credentials after a confirmation
export function DisconnectCard({ endpoint, title, description, confirm }: {
  endpoint: string;
  title: string;
  description: string;
  confirm: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const disconnect = useMutation({
    mutationFn: () => api.delete(endpoint),
    onSuccess: () => {
      setOpen(false);
      toast.success(t('settings.disconnected'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return (
    <>
      <Card className="border-destructive/40">
        <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-6">
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          <Button variant="outline" className="shrink-0 text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
            <PowerOff className="h-4 w-4 mr-2" />
            {t('settings.disconnect')}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{confirm}</p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              {disconnect.isPending ? t('common.loading') : t('settings.disconnect')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface FullSettings {
  appName: string;
  logoUrl: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
  imapPort: number | null;
  smtpPassSet: boolean;
  smbHost: string | null;
  smbShare: string | null;
  smbUsername: string | null;
  smbBasePath: string | null;
  smbPathTemplate: string | null;
  smbPassSet: boolean;
  defaultLanguage: 'sl' | 'en';
  backupEnabled: boolean;
  backupSchedule: string | null;
  backupPath: string | null;
  backupToNas: boolean;
  backupNasPath: string | null;
  backupKeepRecent: number;
  backupKeepMonthly: number;
  auditLogRetentionMonths: number;
  accountingEmail: string | null;
  digestEnabled: boolean;
  digestFrequency: 'daily' | 'weekly';
  digestEmail: string | null;
  escalationEnabled: boolean;
  escalationDays: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  language: 'sl' | 'en';
  isDefault: boolean;
  templateType: 'review' | 'accounting' | 'invoice';
  createdAt: string;
  updatedAt: string;
}

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getToken() {
  try { return JSON.parse(localStorage.getItem('servio-auth') ?? '{}').state?.token ?? ''; } catch { return ''; }
}

export function SectionHeader({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <CardHeader className="pb-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">{title}</CardTitle>
      </div>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}

// Full settings row; every tab reads it from the same cached query
export function useFullSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get<FullSettings>('/settings') }).data;
}
