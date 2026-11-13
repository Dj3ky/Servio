import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, HardDrive, Upload, Archive, FileDown, Download, RotateCcw, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { updateBackupSettingsSchema, type UpdateBackupSettings } from '@servio/shared';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useCan } from '@/stores/permissionsStore';
import { formatDateTime } from '@/lib/utils';
import { formatBytes, getToken, SectionHeader, useFullSettings, useReportUnsaved, type BackupFile } from './shared';

export function BackupTab() {
  const { t } = useTranslation();
  const can = useCan();
  const canManageSettings = can('settings', 'manage');
  const canBackup = can('settings', 'backup');
  const settings = useFullSettings();

  // ── Backup ───────────────────────────────────────────────────────────────────
  const backupForm = useForm<UpdateBackupSettings>({
    resolver: zodResolver(updateBackupSettingsSchema),
    values: {
      backupEnabled: settings?.backupEnabled ?? false,
      backupSchedule: settings?.backupSchedule ?? '0 2 * * *',
      backupPath: settings?.backupPath ?? './backups',
      backupToNas: settings?.backupToNas ?? false,
      backupNasPath: settings?.backupNasPath ?? '',
      backupKeepRecent: settings?.backupKeepRecent ?? 30,
      backupKeepMonthly: settings?.backupKeepMonthly ?? 12,
      auditLogRetentionMonths: settings?.auditLogRetentionMonths ?? 0,
    },
  });

  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);

  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const restartMutation = useMutation({
    mutationFn: () => api.post('/settings/backup/restart', {}),
    onSuccess: () => {
      setRestartConfirmOpen(false);
      toast.success(t('settings.restartSuccess'));
      const poll = setInterval(async () => {
        try { await fetch('/api/health'); clearInterval(poll); window.location.reload(); } catch { /* not back yet */ }
      }, 2000);
    },
    onError: () => toast.error(t('errors.internal')),
  });

  const [deleteBackupTarget, setDeleteBackupTarget] = useState<string | null>(null);
  const deleteBackupMutation = useMutation({
    mutationFn: (filename: string) => api.delete(`/settings/backup/${encodeURIComponent(filename)}`),
    onSuccess: () => { toast.success(t('common.delete')); refetchBackups(); setDeleteBackupTarget(null); },
    onError: () => toast.error(t('errors.internal')),
  });

  // Restore either an uploaded file or a backup already on the server (from the list)
  const [restoreServerFile, setRestoreServerFile] = useState<string | null>(null);
  const restoreName = restoreFile?.name ?? restoreServerFile;

  function closeRestoreDialog() {
    setRestoreConfirmOpen(false);
    setRestoreFile(null);
    setRestoreServerFile(null);
  }

  async function handleRestoreConfirm() {
    if (!restoreFile && !restoreServerFile) return;
    setRestoring(true);
    let body: FormData | undefined;
    if (restoreFile) {
      body = new FormData();
      body.append('backup', restoreFile);
    }
    const url = restoreServerFile
      ? `/api/settings/backup/restore/${encodeURIComponent(restoreServerFile)}`
      : '/api/settings/backup/restore';
    try {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(data.safetyBackup
          ? t('settings.restoreFailedSafety', { file: data.safetyBackup })
          : t(data.error ?? 'errors.internal'), { duration: 15000 });
        refetchBackups();
        return;
      }
      closeRestoreDialog();
      toast.success(t('settings.restoreSuccess', { file: data.safetyBackup }), { duration: 6000 });
      // Everything on screen is from before the restore, so start fresh
      setTimeout(() => window.location.reload(), 2500);
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setRestoring(false);
    }
  }

  function handleRestoreFileChange(file: File) {
    setRestoreServerFile(null);
    setRestoreFile(file);
    setRestoreConfirmOpen(true);
  }

  function handleRestoreServerFile(filename: string) {
    setRestoreFile(null);
    setRestoreServerFile(filename);
    setRestoreConfirmOpen(true);
  }

  useReportUnsaved(backupForm.formState.isDirty);

  const saveBackup = useMutation({
    mutationFn: (d: UpdateBackupSettings) => api.patch('/settings/backup', d),
    onSuccess: (_r, d) => {
      backupForm.reset(d);
      toast.success(t('settings.saved'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const { data: backupFiles = [], refetch: refetchBackups } = useQuery({
    queryKey: ['backup-list'],
    queryFn: () => api.get<BackupFile[]>('/settings/backup/list'),
    enabled: canBackup,
  });

  const createBackupMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean; filePath: string }>('/settings/backup/create', {}),
    onSuccess: () => { toast.success(t('settings.backupCreated')); refetchBackups(); },
    onError: (err: any) => toast.error(err?.message ?? t('errors.internal')),
  });

  const backupEnabled = backupForm.watch('backupEnabled');
  const backupToNas = backupForm.watch('backupToNas');

  return (
    <>
      <Card>
        <SectionHeader
          icon={Archive}
          title={t('settings.backup')}
          description={t('settings.backupDesc')}
        />
        <CardContent>
          <Form {...backupForm}>
            <form onSubmit={backupForm.handleSubmit((d) => saveBackup.mutate(d))} className="space-y-5">
              <fieldset disabled={!canManageSettings} className="space-y-5">
              <FormField control={backupForm.control} name="backupEnabled" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3.5">
                  <div>
                    <FormLabel className="mb-0">{t('settings.backupEnabled')}</FormLabel>
                    <FormDescription className="mt-0.5">{t('settings.backupEnabledHint')}</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />

              <div className={`space-y-5 transition-opacity ${backupEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                <FormField control={backupForm.control} name="backupSchedule" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.backupSchedule')}</FormLabel>
                    <FormControl><Input placeholder="0 2 * * *" {...field} value={field.value ?? ''} className="font-mono" /></FormControl>
                    <FormDescription>{t('settings.backupScheduleHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={backupForm.control} name="backupPath" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.backupPath')}</FormLabel>
                    <FormControl><Input placeholder="./backups" {...field} value={field.value ?? ''} /></FormControl>
                    <FormDescription>{t('settings.backupPathHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={backupForm.control} name="backupToNas" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3.5">
                    <div>
                      <FormLabel className="mb-0">{t('settings.backupToNas')}</FormLabel>
                      <FormDescription className="mt-0.5">{t('settings.backupToNasHint')}</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />

                {backupToNas && (
                  <FormField control={backupForm.control} name="backupNasPath" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.backupNasPath')}</FormLabel>
                      <FormControl><Input placeholder="Backups" {...field} value={field.value ?? ''} /></FormControl>
                      <FormDescription>{t('settings.backupNasPathHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </div>

              <FormField control={backupForm.control} name="backupKeepRecent" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.backupKeepRecent')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      className="w-32"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>{t('settings.backupKeepRecentHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={backupForm.control} name="backupKeepMonthly" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.backupKeepMonthly')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={120}
                      className="w-32"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>{t('settings.backupKeepMonthlyHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={backupForm.control} name="auditLogRetentionMonths" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.auditLogRetentionMonths')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={240}
                      className="w-32"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>{t('settings.auditLogRetentionMonthsHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              </fieldset>

              <div className="flex gap-2 pt-1">
                {canManageSettings && <Button type="submit" disabled={saveBackup.isPending}>{t('common.save')}</Button>}
                {canBackup && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={createBackupMutation.isPending}
                    onClick={() => createBackupMutation.mutate()}
                  >
                    <HardDrive className="h-4 w-4 mr-2" />
                    {createBackupMutation.isPending ? t('common.loading') : t('settings.createBackup')}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {canBackup && (<>
      {/* Backup file list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{t('settings.backupFiles')}</CardTitle>
          </div>
          <CardDescription>{t('settings.backupFilesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {backupFiles.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Archive className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('settings.backupFilesEmpty')}</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y rounded-md border overflow-hidden">
              {backupFiles.map((f) => (
                <div key={f.filename} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors">
                  {f.filename.endsWith('.tar.gz')
                    ? <Archive className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                    : <HardDrive className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
                  <span className="flex-1 text-xs font-mono truncate">{f.filename}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                  <span className="text-xs text-muted-foreground/60 shrink-0 hidden sm:block">{formatDateTime(f.createdAt)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    title={t('common.download')}
                    onClick={() => api.downloadBlob(`/settings/backup/download/${encodeURIComponent(f.filename)}`, f.filename).catch(() => toast.error(t('errors.internal')))}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    title={t('settings.restoreThis')}
                    disabled={restoring}
                    onClick={() => handleRestoreServerFile(f.filename)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    title={t('common.delete')}
                    onClick={() => setDeleteBackupTarget(f.filename)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{t('settings.restoreBackupTitle')}</CardTitle>
          </div>
          <CardDescription>{t('settings.restoreBackupDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={restoreInputRef}
            type="file"
            accept=".sql,.tar.gz"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleRestoreFileChange(f); e.target.value = ''; }}
          />
          <Button variant="outline" onClick={() => restoreInputRef.current?.click()} disabled={restoring}>
            <Upload className="h-4 w-4 mr-2" />
            {restoring ? t('common.loading') : t('settings.restoreBackup')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('settings.restoreUploadHint')}</p>
        </CardContent>
      </Card>

      {/* Restart services */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Power className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{t('settings.restartServices')}</CardTitle>
          </div>
          <CardDescription>{t('settings.restartServicesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setRestartConfirmOpen(true)} disabled={restartMutation.isPending}>
            <Power className="h-4 w-4 mr-2" />
            {restartMutation.isPending ? t('common.loading') : t('settings.restartServices')}
          </Button>
        </CardContent>
      </Card>
      </>)}

      {/* Restore confirmation */}
      <Dialog open={restoreConfirmOpen} onOpenChange={(open) => { if (!open && !restoring) closeRestoreDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.restoreConfirmTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{t('settings.restoreConfirmDesc')}</p>
          </DialogHeader>
          {restoreName && (
            <p className="text-xs font-mono bg-muted rounded px-2 py-1">{restoreName}</p>
          )}
          <p className="text-xs text-muted-foreground">{t('settings.restoreSafetyNote')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={closeRestoreDialog} disabled={restoring}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleRestoreConfirm} disabled={restoring}>
              {restoring ? t('settings.restoring') : t('settings.restoreConfirmBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restart confirmation */}
      <Dialog open={restartConfirmOpen} onOpenChange={setRestartConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.restartConfirmTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{t('settings.restartConfirmDesc')}</p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestartConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => restartMutation.mutate()} disabled={restartMutation.isPending}>
              {restartMutation.isPending ? t('common.loading') : t('settings.restartServices')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteBackupTarget} onOpenChange={(v) => { if (!v) setDeleteBackupTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.delete')} {deleteBackupTarget}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{t('settings.deleteBackupConfirm')}</p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBackupTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={deleteBackupMutation.isPending}
              onClick={() => deleteBackupTarget && deleteBackupMutation.mutate(deleteBackupTarget)}
            >
              {deleteBackupMutation.isPending ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
