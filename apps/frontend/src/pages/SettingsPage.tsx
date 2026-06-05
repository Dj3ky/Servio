import { useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Plus, Pencil, Trash2, HardDrive, Upload, Settings2, Mail, Server,
  MailOpen, Archive, Lock, Globe, CheckCircle2, FileDown, Bell, RefreshCw,
  GitBranch, AlertCircle, Download, RotateCcw, Power, Eye, EyeOff, KeyRound,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  updateGeneralSettingsSchema, updateSmtpSettingsSchema, updateSmbSettingsSchema,
  updateBackupSettingsSchema, updateAlertsSettingsSchema,
  type UpdateGeneralSettings, type UpdateSmtpSettings, type UpdateSmbSettings,
  type UpdateBackupSettings, type UpdateAlertsSettings,
  testSmtpSchema, type TestSmtpRequest,
  createEmailTemplateSchema, type CreateEmailTemplateRequest,
  type UserRole,
} from '@servio/shared';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDateTime, cn } from '@/lib/utils';

interface FullSettings {
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
  smbPassSet: boolean;
  defaultLanguage: 'sl' | 'en';
  backupEnabled: boolean;
  backupSchedule: string | null;
  backupPath: string | null;
  backupToNas: boolean;
  backupNasPath: string | null;
  accountingEmail: string | null;
  digestEnabled: boolean;
  digestFrequency: 'daily' | 'weekly';
  digestEmail: string | null;
  escalationEnabled: boolean;
  escalationDays: number;
}

interface EmailTemplate {
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

interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getToken() {
  try { return JSON.parse(localStorage.getItem('servio-auth') ?? '{}').state?.token ?? ''; } catch { return ''; }
}

interface UpdateStatus {
  currentCommit: string;
  remoteCommit: string | null;
  updateAvailable: boolean;
  lastChecked: string | null;
  checking: boolean;
  applying: boolean;
  lastError: string | null;
  isDocker: boolean;
}

interface UpdateLog {
  lines: string[];
  done: boolean;
  success: boolean;
}

function UpdatesTab() {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [updateDone, setUpdateDone] = useState(false);
  const [updateSucceeded, setUpdateSucceeded] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: status } = useQuery<UpdateStatus>({
    queryKey: ['update-status'],
    queryFn: () => api.get<UpdateStatus>('/update/status'),
    refetchInterval: isUpdating ? false : 60_000,
  });

  const check = useMutation({
    mutationFn: () => api.post<UpdateStatus>('/update/check'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['update-status'] }),
    onError: () => toast.error(t('settings.checkFailed')),
  });


  function startLogPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    let consecutiveErrors = 0;
    let maxSeenLines = 0;

    function finishAsSuccess(extraLine?: string) {
      clearInterval(pollRef.current!);
      pollRef.current = null;
      if (extraLine) setLogLines(prev => [...prev, extraLine]);
      setUpdateDone(true);
      setUpdateSucceeded(true);
      waitForServerAndReload();
    }

    pollRef.current = setInterval(async () => {
      try {
        const log = await api.get<UpdateLog>('/update/log');
        consecutiveErrors = 0;

        setLogLines(log.lines);
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;

        if (log.done) {
          // Script finished cleanly before the process was killed
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setUpdateDone(true);
          setUpdateSucceeded(log.success);
          if (log.success) setTimeout(() => waitForServerAndReload(), 3000);
          return;
        }

        if (log.lines.length > maxSeenLines) {
          maxSeenLines = log.lines.length;
        } else if (maxSeenLines > 0 && log.lines.length === 0) {
          // pm2 reload swapped to new process — in-memory log reset to empty.
          // All fallible steps (git pull, build, migrate) already passed.
          finishAsSuccess('==> Restarting server...');
        }
      } catch {
        consecutiveErrors++;
        // pm2 restart (hard kill) scenario — server fully down for ≥3 s
        if (consecutiveErrors >= 3) {
          finishAsSuccess('==> Restarting server...');
        }
      }
    }, 1000);
  }

  function waitForServerAndReload() {
    const poll = setInterval(async () => {
      try {
        await fetch('/api/health');
        clearInterval(poll);
        window.location.reload();
      } catch {
        // not back yet
      }
    }, 2000);
  }

  const apply = useMutation({
    mutationFn: () => api.post('/update/apply'),
    onSuccess: () => {
      setConfirmOpen(false);
      setIsUpdating(true);
      setLogLines([]);
      setUpdateDone(false);
      setUpdateSucceeded(false);
      startLogPolling();
    },
    onError: () => toast.error(t('settings.updateFailed')),
  });

  const busy = status?.checking || status?.applying || check.isPending || isUpdating;

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader icon={GitBranch} title={t('settings.updates')} description={t('settings.updatesDesc')} />
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('settings.currentVersion')}</p>
              <p className="text-sm font-mono">{status?.currentCommit || t('settings.unknown')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('settings.remoteVersion')}</p>
              <p className="text-sm font-mono">{status?.remoteCommit || '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('settings.lastChecked')}</p>
              <p className="text-sm">{status?.lastChecked ? formatDateTime(status.lastChecked) : t('settings.neverChecked')}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('common.status')}</p>
              {status?.updateAvailable ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />{t('settings.updateAvailable')}
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />{t('settings.upToDate')}
                </Badge>
              )}
            </div>
          </div>

          {status?.lastError && !isUpdating && !status.isDocker && (
            <p className="text-sm text-destructive">{status.lastError}</p>
          )}

          <Separator />

          {status?.isDocker ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => check.mutate()} disabled={busy}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${check.isPending || status?.checking ? 'animate-spin' : ''}`} />
                  {t('settings.checkNow')}
                </Button>
              </div>
              {status?.lastError && (
                <p className="text-sm text-destructive">{status.lastError}</p>
              )}
              <div className="flex items-start gap-3 rounded-md border border-muted bg-muted/40 p-4 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p>{t('settings.dockerUpdateNotice')}</p>
                  <pre className="text-xs font-mono bg-black/10 dark:bg-white/5 rounded px-2 py-1 select-all whitespace-pre-wrap">docker compose pull && docker compose up -d</pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => check.mutate()} disabled={busy}>
                <RefreshCw className={`h-4 w-4 mr-2 ${check.isPending || status?.checking ? 'animate-spin' : ''}`} />
                {t('settings.checkNow')}
              </Button>
              {status?.updateAvailable && !isUpdating && (
                <Button onClick={() => setConfirmOpen(true)} disabled={busy}>
                  {t('settings.applyUpdate')}
                </Button>
              )}
            </div>
          )}

          {/* Terminal output */}
          {isUpdating && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {!updateDone && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {updateDone && updateSucceeded && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                {updateDone && !updateSucceeded && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                <p className="text-xs font-medium text-muted-foreground">
                  {!updateDone
                    ? t('settings.applying')
                    : updateSucceeded
                    ? t('settings.updateSuccess')
                    : t('settings.updateFailed')}
                </p>
                {updateDone && updateSucceeded && (
                  <p className="text-xs text-muted-foreground">{t('settings.reloading')}</p>
                )}
              </div>
              <pre
                ref={logRef}
                className="bg-black text-green-400 text-xs font-mono rounded-md p-3 h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed"
              >
                {logLines.join('\n')}
                {!updateDone && <span className="animate-pulse">█</span>}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.applyConfirmTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{t('settings.applyConfirmDesc')}</p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
              {apply.isPending ? t('settings.applying') : t('settings.applyUpdate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface LicenseStatus {
  valid: boolean;
  configured: boolean;
  customer?: string;
  seats?: number;
  features?: string[];
  domain?: string | null;
  perpetual?: boolean;
  expiresAt?: string | null;
  daysLeft?: number | null;
  issuedAt?: string;
  error?: string;
}

function LicenseTab() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: license, refetch } = useQuery<LicenseStatus>({
    queryKey: ['license-status'],
    queryFn: () => api.get<LicenseStatus>('/license/status'),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('license', file);
      return api.post<LicenseStatus>('/license/upload', form);
    },
    onSuccess: () => {
      toast.success(t('license.uploadSuccess'));
      refetch();
    },
    onError: () => toast.error(t('license.uploadError')),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = '';
  }

  const expiringSoon = license?.valid && !license.perpetual && license.daysLeft !== null && license.daysLeft !== undefined && license.daysLeft <= 30;

  return (
    <div className="space-y-4">
      <Card>
        <SectionHeader icon={KeyRound} title={t('license.status')} description={t('license.statusDesc')} />
        <CardContent className="space-y-6">
          {!license?.configured && (
            <div className="flex items-start gap-3 rounded-md border border-muted bg-muted/40 p-4 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t('license.notConfigured')}</span>
            </div>
          )}

          {license?.configured && !license.valid && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t('license.invalidDesc')}</span>
            </div>
          )}

          {expiringSoon && (
            <div className="flex items-start gap-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-600 dark:text-yellow-400">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t('license.expiringSoon', { days: license!.daysLeft })}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('common.status')}</p>
              {license?.valid ? (
                <Badge variant="secondary" className="gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />{t('license.valid')}
                </Badge>
              ) : license?.configured ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />{t('license.expired')}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  {t('license.notFound')}
                </Badge>
              )}
            </div>

            {license?.customer && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('license.customer')}</p>
                <p className="text-sm font-medium">{license.customer}</p>
              </div>
            )}

            {license?.seats !== undefined && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('license.seats')}</p>
                <p className="text-sm">{license.seats}</p>
              </div>
            )}

            {license?.expiresAt !== undefined && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('license.expiresAt')}</p>
                <p className="text-sm">
                  {license.perpetual ? t('license.neverExpires') : license.expiresAt ? formatDateTime(license.expiresAt) : '—'}
                </p>
              </div>
            )}

            {license?.daysLeft !== null && license?.daysLeft !== undefined && !license.perpetual && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('license.daysLeft')}</p>
                <p className={`text-sm font-medium ${expiringSoon ? 'text-yellow-600 dark:text-yellow-400' : ''}`}>{license.daysLeft}</p>
              </div>
            )}

            {license?.features && license.features.length > 0 && (
              <div className="space-y-1 col-span-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('license.features')}</p>
                <div className="flex flex-wrap gap-1">
                  {license.features.map(f => (
                    <Badge key={f} variant="secondary">{f}</Badge>
                  ))}
                </div>
              </div>
            )}

            {license?.issuedAt && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('license.issuedAt')}</p>
                <p className="text-sm text-muted-foreground">{formatDateTime(license.issuedAt)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <SectionHeader icon={Upload} title={t('license.upload')} description={t('license.uploadDesc')} />
        <CardContent>
          <input ref={fileInputRef} type="file" accept=".key" className="hidden" onChange={handleFile} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
            <Upload className="h-4 w-4 mr-2" />
            {uploadMutation.isPending ? t('common.loading') : t('license.uploadHint')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
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

export default function SettingsPage() {
  const { t } = useTranslation();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<FullSettings>('/settings'),
  });

  // ── General ──────────────────────────────────────────────────────────────────
  const generalForm = useForm<UpdateGeneralSettings>({
    resolver: zodResolver(updateGeneralSettingsSchema),
    values: {
      appName: settings?.appName ?? 'Servio',
      defaultLanguage: settings?.defaultLanguage ?? 'sl',
      accountingEmail: settings?.accountingEmail ?? '',
    },
  });

  const saveGeneral = useMutation({
    mutationFn: (d: UpdateGeneralSettings) => api.patch('/settings/general', d),
    onSuccess: () => {
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['public-settings'] });
    },
  });

  // ── Logo ─────────────────────────────────────────────────────────────────────
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    const formData = new FormData();
    formData.append('logo', file);
    try {
      await fetch('/api/settings/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      }).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
      toast.success(t('common.save'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['public-settings'] });
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setLogoUploading(false);
    }
  }

  // ── SMTP ─────────────────────────────────────────────────────────────────────
  const smtpForm = useForm<UpdateSmtpSettings>({
    resolver: zodResolver(updateSmtpSettingsSchema),
    values: {
      smtpHost: settings?.smtpHost ?? '',
      smtpPort: settings?.smtpPort ?? 587,
      smtpUser: settings?.smtpUser ?? '',
      smtpPass: '',
      smtpFrom: settings?.smtpFrom ?? '',
      smtpSecure: settings?.smtpSecure ?? false,
      imapPort: settings?.imapPort ?? null,
    },
  });

  const testSmtpForm = useForm<TestSmtpRequest>({
    resolver: zodResolver(testSmtpSchema),
    defaultValues: { recipient: '' },
  });

  const saveSmtp = useMutation({
    mutationFn: (d: UpdateSmtpSettings) => api.patch('/settings/smtp', d),
    onSuccess: () => toast.success(t('common.save')),
  });

  const testSmtp = useMutation({
    mutationFn: (d: TestSmtpRequest) => api.post('/settings/smtp/test', d),
    onSuccess: (r: any) => r.success ? toast.success('SMTP OK — test email sent') : toast.error(r.error ?? 'SMTP test failed'),
  });

  // ── SMB ──────────────────────────────────────────────────────────────────────
  const smbForm = useForm<UpdateSmbSettings>({
    resolver: zodResolver(updateSmbSettingsSchema),
    values: {
      smbHost: settings?.smbHost ?? '',
      smbShare: settings?.smbShare ?? '',
      smbUsername: settings?.smbUsername ?? '',
      smbPassword: '',
      smbBasePath: settings?.smbBasePath ?? '',
    },
    resetOptions: { keepDirtyValues: true },
  });

  const saveSmb = useMutation({
    mutationFn: (d: UpdateSmbSettings) => api.patch('/settings/smb', d),
    onSuccess: () => { toast.success(t('common.save')); queryClient.invalidateQueries({ queryKey: ['settings'] }); },
  });

  const testSmb = useMutation({
    mutationFn: () => api.post<{ success: boolean; error?: string }>('/smb/test'),
    onSuccess: (r) => r.success ? toast.success('SMB OK — connection successful') : toast.error(r.error ?? 'SMB connection failed'),
    onError: (err: any) => toast.error(err?.message ?? 'SMB test failed'),
  });

  // ── Backup ───────────────────────────────────────────────────────────────────
  const backupForm = useForm<UpdateBackupSettings>({
    resolver: zodResolver(updateBackupSettingsSchema),
    values: {
      backupEnabled: settings?.backupEnabled ?? false,
      backupSchedule: settings?.backupSchedule ?? '0 2 * * *',
      backupPath: settings?.backupPath ?? './backups',
      backupToNas: settings?.backupToNas ?? false,
      backupNasPath: settings?.backupNasPath ?? '',
    },
  });

  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [showSmbPass, setShowSmbPass] = useState(false);

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

  async function handleRestoreConfirm() {
    if (!restoreFile) return;
    setRestoring(true);
    const formData = new FormData();
    formData.append('backup', restoreFile);
    try {
      const r = await fetch('/api/settings/backup/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      if (!r.ok) throw new Error();
      toast.success(t('settings.restoreSuccess'));
      setRestoreConfirmOpen(false);
      setRestoreFile(null);
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setRestoring(false);
    }
  }

  function handleRestoreFileChange(file: File) {
    setRestoreFile(file);
    setRestoreConfirmOpen(true);
  }

  const saveBackup = useMutation({
    mutationFn: (d: UpdateBackupSettings) => api.patch('/settings/backup', d),
    onSuccess: () => { toast.success(t('common.save')); queryClient.invalidateQueries({ queryKey: ['settings'] }); },
  });

  const { data: backupFiles = [], refetch: refetchBackups } = useQuery({
    queryKey: ['backup-list'],
    queryFn: () => api.get<BackupFile[]>('/settings/backup/list'),
  });

  const createBackupMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean; filePath: string }>('/settings/backup/create', {}),
    onSuccess: () => { toast.success('Backup created'); refetchBackups(); },
    onError: (err: any) => toast.error(err?.message ?? t('errors.internal')),
  });

  // ── Templates ────────────────────────────────────────────────────────────────
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/settings/templates'),
  });

  const [templateDialog, setTemplateDialog] = useState<{ mode: 'create' | 'edit'; template?: EmailTemplate } | null>(null);

  const templateForm = useForm<CreateEmailTemplateRequest>({
    resolver: zodResolver(createEmailTemplateSchema),
    defaultValues: { name: '', subject: '', body: '', language: 'sl', isDefault: false, templateType: 'review' },
  });

  function openCreateTemplate() {
    templateForm.reset({ name: '', subject: '', body: '', language: 'sl', isDefault: false, templateType: 'review' });
    setTemplateDialog({ mode: 'create' });
  }

  function openEditTemplate(tpl: EmailTemplate) {
    templateForm.reset({ name: tpl.name, subject: tpl.subject, body: tpl.body, language: tpl.language, isDefault: tpl.isDefault, templateType: tpl.templateType });
    setTemplateDialog({ mode: 'edit', template: tpl });
  }

  const saveTemplate = useMutation({
    mutationFn: (d: CreateEmailTemplateRequest) => {
      if (templateDialog?.mode === 'edit' && templateDialog.template) {
        return api.patch(`/settings/templates/${templateDialog.template.id}`, d);
      }
      return api.post('/settings/templates', d);
    },
    onSuccess: () => { toast.success(t('common.save')); refetchTemplates(); setTemplateDialog(null); },
    onError: () => toast.error(t('errors.internal')),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/templates/${id}`),
    onSuccess: () => { toast.success(t('common.delete')); refetchTemplates(); },
    onError: () => toast.error(t('errors.internal')),
  });

  // ── Alerts ───────────────────────────────────────────────────────────────────
  const alertsForm = useForm<UpdateAlertsSettings>({
    resolver: zodResolver(updateAlertsSettingsSchema),
    values: {
      digestEnabled: settings?.digestEnabled ?? false,
      digestFrequency: settings?.digestFrequency ?? 'daily',
      digestEmail: settings?.digestEmail ?? '',
      escalationEnabled: settings?.escalationEnabled ?? false,
      escalationDays: settings?.escalationDays ?? 3,
    },
  });

  const saveAlerts = useMutation({
    mutationFn: (d: UpdateAlertsSettings) => api.patch('/settings/alerts', d),
    onSuccess: () => { toast.success(t('common.save')); queryClient.invalidateQueries({ queryKey: ['settings'] }); },
  });

  const digestEnabled = alertsForm.watch('digestEnabled');
  const escalationEnabled = alertsForm.watch('escalationEnabled');

  const backupEnabled = backupForm.watch('backupEnabled');
  const backupToNas = backupForm.watch('backupToNas');

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'general';
  const setActiveTab = (tab: string) => setSearchParams({ tab }, { replace: true });

  const navItems = [
    { value: 'general', icon: Settings2, label: t('settings.general') },
    { value: 'smtp', icon: Mail, label: t('settings.smtp') },
    { value: 'smb', icon: Server, label: t('settings.smb') },
    { value: 'templates', icon: MailOpen, label: t('settings.templates') },
    { value: 'backup', icon: Archive, label: t('settings.backup') },
    { value: 'alerts', icon: Bell, label: t('settings.alerts') },
    { value: 'updates', icon: RefreshCw, label: t('settings.updates') },
    { value: 'license', icon: KeyRound, label: t('license.tab') },
    { value: 'roles', icon: ShieldCheck, label: t('settings.roles') },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('settings.pageDesc')}</p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar nav */}
        <nav className="w-48 shrink-0">
          <div className="space-y-0.5">
            {navItems.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={cn(
                  'w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors text-left',
                  activeTab === value
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0 space-y-4">

        {activeTab === 'general' && (<>
          <Card>
            <SectionHeader
              icon={Globe}
              title={t('settings.general')}
              description={t('settings.generalDesc')}
            />
            <CardContent>
              <Form {...generalForm}>
                <form onSubmit={generalForm.handleSubmit((d) => saveGeneral.mutate(d))} className="space-y-5">
                  <FormField control={generalForm.control} name="appName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.appName')}</FormLabel>
                      <FormControl><Input placeholder="Servio" {...field} /></FormControl>
                      <FormDescription>{t('settings.appNameHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={generalForm.control} name="defaultLanguage" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.defaultLanguage')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="w-48"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="sl">🇸🇮 Slovenščina</SelectItem>
                          <SelectItem value="en">🇬🇧 English</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>{t('settings.defaultLanguageHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={generalForm.control} name="accountingEmail" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.accountingEmail')}</FormLabel>
                      <FormControl><Input type="email" placeholder="accounting@company.com" {...field} /></FormControl>
                      <FormDescription>{t('settings.accountingEmailHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="pt-1">
                    <Button type="submit" disabled={saveGeneral.isPending}>{t('common.save')}</Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card>
            <SectionHeader
              icon={Upload}
              title={t('settings.logoUpload')}
              description={t('settings.logoDesc')}
            />
            <CardContent className="space-y-4">
              {settings?.logoUrl ? (
                <div className="inline-flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                  <img src={settings.logoUrl} alt="Logo" className="h-12 object-contain" />
                  <div className="text-xs text-muted-foreground">{t('common.currentLogo')}</div>
                </div>
              ) : (
                <div className="flex h-14 w-36 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                  {t('common.noLogoSet')}
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }}
              />
              <div className="flex items-center gap-3">
                <Button variant="outline" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  {logoUploading ? t('common.loading') : t('common.upload')}
                </Button>
                <p className="text-xs text-muted-foreground">{t('settings.logoHint')}</p>
              </div>
            </CardContent>
          </Card>
        </>)}

        {activeTab === 'smtp' && (<>
          <Card>
            <SectionHeader
              icon={Mail}
              title={t('settings.smtp')}
              description={t('settings.smtpDesc')}
            />
            <CardContent>
              <Form {...smtpForm}>
                <form onSubmit={smtpForm.handleSubmit((d) => saveSmtp.mutate(d))} className="space-y-5">
                  {/* Connection */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.smtpConnection')}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <FormField control={smtpForm.control} name="smtpHost" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('settings.smtpHost')}</FormLabel>
                          <FormControl><Input placeholder="smtp.gmail.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={smtpForm.control} name="smtpPort" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.smtpPort')}</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2">{t('settings.smtpPortHint')}</p>

                  <FormField control={smtpForm.control} name="smtpSecure" render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3.5">
                      <div>
                        <FormLabel className="flex items-center gap-1.5 mb-0">
                          <Lock className="h-3.5 w-3.5" />
                          {t('settings.smtpSecure')}
                        </FormLabel>
                        <FormDescription className="mt-0.5">{t('settings.smtpSecureHint')}</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(val) => {
                            field.onChange(val);
                            const currentPort = smtpForm.getValues('smtpPort');
                            if (val && currentPort === 587) smtpForm.setValue('smtpPort', 465);
                            if (!val && currentPort === 465) smtpForm.setValue('smtpPort', 587);
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )} />

                  <Separator />

                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.smtpCredentials')}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={smtpForm.control} name="smtpUser" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.smtpUser')}</FormLabel>
                        <FormControl><Input placeholder="noreply@company.com" {...field} /></FormControl>
                        <FormDescription>{t('settings.smtpUserHint')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={smtpForm.control} name="smtpPass" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.smtpPass')}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input type={showSmtpPass ? 'text' : 'password'} placeholder={settings?.smtpPassSet ? t('common.leaveBlank') : ''} className="pr-10" {...field} />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground" onClick={() => setShowSmtpPass((v) => !v)}>
                              {showSmtpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>{t('settings.smtpPassHint')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={smtpForm.control} name="smtpFrom" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.smtpFrom')}</FormLabel>
                      <FormControl><Input placeholder='Servio <noreply@company.com>' {...field} /></FormControl>
                      <FormDescription>{t('settings.smtpFromHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Separator />

                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.imapSection')}</p>
                    <p className="text-xs text-muted-foreground">{t('settings.imapSectionHint')}</p>
                  </div>
                  <FormField control={smtpForm.control} name="imapPort" render={({ field }) => (
                    <FormItem className="max-w-[160px]">
                      <FormLabel>{t('settings.imapPort')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="993"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormDescription>{t('settings.imapPortHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="pt-1">
                    <Button type="submit" disabled={saveSmtp.isPending}>{t('common.save')}</Button>
                  </div>
                </form>
              </Form>

              <Separator className="my-6" />

              {/* Test section */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">{t('settings.smtpTestTitle')}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('settings.smtpTestDesc')}</p>
                </div>
                <Form {...testSmtpForm}>
                  <form onSubmit={testSmtpForm.handleSubmit((d) => testSmtp.mutate(d))} className="flex gap-2">
                    <FormField control={testSmtpForm.control} name="recipient" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input type="email" placeholder={t('settings.testRecipient')} {...field} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <Button type="submit" variant="outline" disabled={testSmtp.isPending}>
                      {testSmtp.isPending ? t('common.loading') : t('settings.testSmtp')}
                    </Button>
                  </form>
                </Form>
              </div>
            </CardContent>
          </Card>
        </>)}

        {activeTab === 'smb' && (<>
          <Card>
            <SectionHeader
              icon={Server}
              title={t('settings.smb')}
              description={t('settings.smbDesc')}
            />
            <CardContent>
              <Form {...smbForm}>
                <form onSubmit={smbForm.handleSubmit((d) => saveSmb.mutate(d))} className="space-y-5">
                  {/* Server */}
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.smbServer')}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={smbForm.control} name="smbHost" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.smbHost')}</FormLabel>
                        <FormControl><Input placeholder="192.168.1.100" {...field} /></FormControl>
                        <FormDescription>{t('settings.smbHostHint')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={smbForm.control} name="smbShare" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.smbShare')}</FormLabel>
                        <FormControl><Input placeholder="reports" {...field} /></FormControl>
                        <FormDescription>{t('settings.smbShareHint')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={smbForm.control} name="smbBasePath" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.smbBasePath')}</FormLabel>
                      <FormControl><Input placeholder="Servio/Reports" {...field} /></FormControl>
                      <FormDescription>{t('settings.smbBasePathHint')}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Separator />

                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.smtpCredentials')}</p>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={smbForm.control} name="smbUsername" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.smbUser')}</FormLabel>
                        <FormControl><Input placeholder="DOMAIN\user" {...field} /></FormControl>
                        <FormDescription>{t('settings.smbUsernameHint')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={smbForm.control} name="smbPassword" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.smbPass')}</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input type={showSmbPass ? 'text' : 'password'} placeholder={settings?.smbPassSet ? t('common.leaveBlank') : ''} className="pr-10" {...field} />
                            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground" onClick={() => setShowSmbPass((v) => !v)}>
                              {showSmbPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormDescription>{t('settings.smbPassHint')}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button type="submit" disabled={saveSmb.isPending}>{t('common.save')}</Button>
                    <Button type="button" variant="outline" disabled={testSmb.isPending} onClick={() => testSmb.mutate()}>
                      <HardDrive className="h-4 w-4 mr-2" />
                      {testSmb.isPending ? t('common.loading') : t('settings.testSmb')}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </>)}

        {activeTab === 'templates' && (<>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MailOpen className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{t('settings.templates')}</CardTitle>
                </div>
                <Button size="sm" onClick={openCreateTemplate}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t('common.create')}
                </Button>
              </div>
              <CardDescription>{t('settings.templatesDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {templates.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <MailOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{t('settings.templatesEmpty')}</p>
                </div>
              ) : templates.map((tpl) => (
                <div key={tpl.id} className="flex items-start gap-3 rounded-lg border p-3.5 hover:bg-muted/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{tpl.name}</span>
                      {tpl.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <CheckCircle2 className="h-3 w-3" /> default
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs font-mono">{tpl.language.toUpperCase()}</Badge>
                      <Badge variant={tpl.templateType === 'accounting' ? 'info' : tpl.templateType === 'invoice' ? 'warning' : 'secondary'} className="text-xs">
                        {t(tpl.templateType === 'accounting' ? 'settings.templateTypeAccounting' : tpl.templateType === 'invoice' ? 'settings.templateTypeInvoice' : 'settings.templateTypeReview')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{tpl.subject}</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{t('common.edit')} {formatDateTime(tpl.updatedAt)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditTemplate(tpl)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteTemplate.mutate(tpl.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Variables reference */}
              <div className="rounded-lg border bg-muted/30 p-3.5 mt-2">
                <p className="text-xs font-medium mb-2 text-muted-foreground">{t('settings.templateVariables')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {['{{customer_name}}', '{{facility_name}}', '{{month}}', '{{year}}', '{{contract_number}}', '{{app_name}}'].map((v) => (
                    <code key={v} className="rounded bg-background border px-1.5 py-0.5 text-xs font-mono">{v}</code>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>)}

        {activeTab === 'backup' && (<>
          <Card>
            <SectionHeader
              icon={Archive}
              title={t('settings.backup')}
              description={t('settings.backupDesc')}
            />
            <CardContent>
              <Form {...backupForm}>
                <form onSubmit={backupForm.handleSubmit((d) => saveBackup.mutate(d))} className="space-y-5">
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

                  <div className="flex gap-2 pt-1">
                    <Button type="submit" disabled={saveBackup.isPending}>{t('common.save')}</Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={createBackupMutation.isPending}
                      onClick={() => createBackupMutation.mutate()}
                    >
                      <HardDrive className="h-4 w-4 mr-2" />
                      {createBackupMutation.isPending ? t('common.loading') : t('settings.createBackup')}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

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

        {activeTab === 'alerts' && (<>
          <Card>
            <SectionHeader
              icon={Bell}
              title={t('settings.alerts')}
              description={t('settings.alertsDesc')}
            />
            <CardContent>
              <Form {...alertsForm}>
                <form onSubmit={alertsForm.handleSubmit((d) => saveAlerts.mutate(d))} className="space-y-6">

                  {/* Digest section */}
                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.digestSection')}</p>

                    <FormField control={alertsForm.control} name="digestEnabled" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3.5">
                        <div>
                          <FormLabel className="mb-0">{t('settings.digestEnabled')}</FormLabel>
                          <FormDescription className="mt-0.5">{t('settings.digestEnabledHint')}</FormDescription>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />

                    <div className={`space-y-4 transition-opacity ${digestEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={alertsForm.control} name="digestFrequency" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('settings.digestFrequency')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="daily">{t('settings.digestDaily')}</SelectItem>
                                <SelectItem value="weekly">{t('settings.digestWeekly')}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={alertsForm.control} name="digestEmail" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('settings.digestEmail')}</FormLabel>
                            <FormControl><Input type="email" placeholder={t('settings.digestEmailHint')} {...field} value={field.value ?? ''} /></FormControl>
                            <FormDescription>{t('settings.digestEmailFallback')}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Escalation section */}
                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.escalationSection')}</p>

                    <FormField control={alertsForm.control} name="escalationEnabled" render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3.5">
                        <div>
                          <FormLabel className="mb-0">{t('settings.escalationEnabled')}</FormLabel>
                          <FormDescription className="mt-0.5">{t('settings.escalationEnabledHint')}</FormDescription>
                        </div>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />

                    <div className={`transition-opacity ${escalationEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                      <FormField control={alertsForm.control} name="escalationDays" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('settings.escalationDays')}</FormLabel>
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
                          <FormDescription>{t('settings.escalationDaysHint')}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  <div className="pt-1">
                    <Button type="submit" disabled={saveAlerts.isPending}>{t('common.save')}</Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </>)}

        {activeTab === 'updates' && <UpdatesTab />}
        {activeTab === 'license' && <LicenseTab />}
        {activeTab === 'roles' && <PermissionsTab />}

        </div>
      </div>

      {/* Template dialog */}
      <Dialog open={!!templateDialog} onOpenChange={(open) => { if (!open) setTemplateDialog(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {templateDialog?.mode === 'edit' ? t('common.edit') : t('common.create')} {t('settings.templates').toLowerCase()}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {templateDialog?.mode === 'edit'
                ? `${t('settings.templateDialogEditing')} "${templateDialog.template?.name}"`
                : t('settings.templateDialogCreate')}
            </p>
          </DialogHeader>
          <Form {...templateForm}>
            <form onSubmit={templateForm.handleSubmit((d) => saveTemplate.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <FormField control={templateForm.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-1">
                    <FormLabel>{t('settings.templateName')}</FormLabel>
                    <FormControl><Input placeholder="Monthly report — SL" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={templateForm.control} name="language" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.language')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="sl">🇸🇮 Slovenščina</SelectItem>
                        <SelectItem value="en">🇬🇧 English</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={templateForm.control} name="templateType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.templateType')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="review">{t('settings.templateTypeReview')}</SelectItem>
                        <SelectItem value="accounting">{t('settings.templateTypeAccounting')}</SelectItem>
                        <SelectItem value="invoice">{t('settings.templateTypeInvoice')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={templateForm.control} name="subject" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('reviews.emailSubject')}</FormLabel>
                  <FormControl><Input placeholder="Poročilo o vzdrževanju — {{month}} {{year}}" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={templateForm.control} name="body" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('reviews.emailBody')}</FormLabel>
                  <FormControl>
                    <Textarea rows={8} className="font-mono text-sm resize-y" {...field} />
                  </FormControl>
                  <FormDescription className="flex flex-wrap gap-1 mt-1">
                    {['{{customer_name}}', '{{facility_name}}', '{{month}}', '{{year}}', '{{contract_number}}', '{{app_name}}'].map((v) => (
                      <code key={v} className="rounded bg-muted border px-1 py-0 text-xs">{v}</code>
                    ))}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={templateForm.control} name="isDefault" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3.5">
                  <div>
                    <FormLabel className="mb-0">{t('settings.templateDefault')}</FormLabel>
                    <FormDescription className="mt-0.5">{t('settings.templateDefaultHint')}</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />

              <Separator />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTemplateDialog(null)}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={saveTemplate.isPending}>{t('common.save')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation */}
      <Dialog open={restoreConfirmOpen} onOpenChange={(open) => { if (!open) { setRestoreConfirmOpen(false); setRestoreFile(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.restoreConfirmTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{t('settings.restoreConfirmDesc')}</p>
          </DialogHeader>
          {restoreFile && (
            <p className="text-xs font-mono bg-muted rounded px-2 py-1">{restoreFile.name}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRestoreConfirmOpen(false); setRestoreFile(null); }}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleRestoreConfirm} disabled={restoring}>
              {restoring ? t('common.loading') : t('settings.restoreBackup')}
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
    </div>
  );
}

type PermMap = Record<string, Record<string, string[]>>;

function PermissionsTab() {
  const { t } = useTranslation();
  const ALL_ROLES: UserRole[] = ['admin', 'manager', 'accountant', 'technician'];

  const { data: serverPerms, isLoading, refetch } = useQuery<PermMap>({
    queryKey: ['permissions'],
    queryFn: () => api.get<PermMap>('/settings/permissions'),
  });

  const [local, setLocal] = useState<PermMap | null>(null);

  useEffect(() => {
    if (serverPerms) setLocal(JSON.parse(JSON.stringify(serverPerms)));
  }, [serverPerms]);

  const save = useMutation({
    mutationFn: () => api.patch('/settings/permissions', local),
    onSuccess: () => { toast.success(t('common.save')); refetch(); },
  });

  const reset = useMutation({
    mutationFn: () => api.delete('/settings/permissions'),
    onSuccess: () => { setLocal(null); refetch(); toast.success(t('common.reset')); },
  });

  const toggle = (section: string, action: string, role: UserRole) => {
    if (role === 'admin') return;
    setLocal(prev => {
      if (!prev) return prev;
      const current: string[] = prev[section]?.[action] ?? [];
      const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
      return { ...prev, [section]: { ...prev[section], [action]: next } };
    });
  };

  const hasRole = (section: string, action: string, role: UserRole): boolean => {
    const perms = local ?? serverPerms;
    if (!perms) return false;
    return (perms[section]?.[action] ?? []).includes(role);
  };

  const sections = [
    { label: t('settings.perm.users'), rows: [
      { section: 'users', action: 'view', label: t('settings.perm.usersView') },
      { section: 'users', action: 'manage', label: t('settings.perm.usersManage') },
      { section: 'users', action: 'resetPassword', label: t('settings.perm.usersResetPw') },
    ]},
    { label: t('settings.perm.records'), rows: [
      { section: 'records', action: 'manage', label: t('settings.perm.recordsManage') },
      { section: 'records', action: 'delete', label: t('settings.perm.recordsDelete') },
      { section: 'contractTimeline', action: 'access', label: t('settings.perm.contractTimelineAccess') },
    ]},
    { label: t('settings.perm.reviews'), rows: [
      { section: 'reviews', action: 'upload', label: t('settings.perm.reviewsUpload') },
      { section: 'reviews', action: 'backfill', label: t('settings.perm.reviewsBackfill') },
    ]},
    { label: t('settings.perm.invoices'), rows: [
      { section: 'invoices', action: 'access', label: t('settings.perm.invoicesAccess') },
      { section: 'invoices', action: 'reset', label: t('settings.perm.invoicesReset') },
    ]},
    { label: t('settings.perm.reports'), rows: [
      { section: 'reports', action: 'access', label: t('settings.perm.reportsAccess') },
    ]},
    { label: t('settings.perm.auditLog'), rows: [
      { section: 'auditLog', action: 'access', label: t('settings.perm.auditLogAccess') },
    ]},
    { label: t('settings.perm.settingsSection'), rows: [
      { section: 'settings', action: 'view', label: t('settings.perm.settingsView') },
      { section: 'settings', action: 'manage', label: t('settings.perm.settingsManage') },
      { section: 'settings', action: 'manageTemplates', label: t('settings.perm.settingsTemplates') },
      { section: 'settings', action: 'deleteTemplates', label: t('settings.perm.settingsDeleteTemplates') },
      { section: 'settings', action: 'backup', label: t('settings.perm.settingsBackup') },
    ]},
    { label: t('settings.perm.system'), rows: [
      { section: 'smb', action: 'access', label: t('settings.perm.systemSmb') },
      { section: 'scheduler', action: 'access', label: t('settings.perm.systemScheduler') },
      { section: 'update', action: 'access', label: t('settings.perm.systemUpdates') },
      { section: 'license', action: 'access', label: t('settings.perm.systemLicense') },
    ]},
  ];

  const isDirty = local !== null && JSON.stringify(local) !== JSON.stringify(serverPerms);

  if (isLoading) return <div className="text-sm text-muted-foreground py-4">{t('common.loading')}</div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t('settings.roles')}</CardTitle>
            <CardDescription className="mt-1">{t('settings.rolesDesc')}</CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => reset.mutate()} disabled={reset.isPending}>
              {t('common.reset')}
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={!isDirty || save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4 font-medium text-muted-foreground w-52" />
                {ALL_ROLES.map(role => (
                  <th key={role} className="text-center py-2 px-3 font-medium w-24">
                    <span className="text-xs uppercase tracking-wide">{t(`users.roles.${role}` as any)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map(section => (
                <>
                  <tr key={section.label}>
                    <td colSpan={5} className="py-1.5 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30">
                      {section.label}
                    </td>
                  </tr>
                  {section.rows.map(row => (
                    <tr key={`${row.section}.${row.action}`} className="border-b border-muted/20 hover:bg-muted/10">
                      <td className="py-2 px-4 text-sm">{row.label}</td>
                      {ALL_ROLES.map(role => {
                        const checked = hasRole(row.section, row.action, role);
                        const isAdmin = role === 'admin';
                        return (
                          <td key={role} className="text-center py-2 px-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isAdmin}
                              onChange={() => toggle(row.section, row.action, role)}
                              className="h-4 w-4 rounded border-border cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 accent-primary"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
