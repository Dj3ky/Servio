import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Plus, Pencil, Trash2, HardDrive, Upload, Settings2, Mail, Server,
  MailOpen, Archive, Lock, Globe, CheckCircle2, FileDown, Bell,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from '@servio/shared';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { formatDateTime } from '@/lib/utils';

interface FullSettings {
  appName: string;
  logoUrl: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFrom: string | null;
  smtpSecure: boolean;
  smbHost: string | null;
  smbShare: string | null;
  smbUsername: string | null;
  smbBasePath: string | null;
  defaultLanguage: 'sl' | 'en';
  backupEnabled: boolean;
  backupSchedule: string | null;
  backupPath: string | null;
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
    },
  });

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

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('settings.pageDesc')}</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="general" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />{t('settings.general')}
          </TabsTrigger>
          <TabsTrigger value="smtp" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />{t('settings.smtp')}
          </TabsTrigger>
          <TabsTrigger value="smb" className="gap-1.5">
            <Server className="h-3.5 w-3.5" />{t('settings.smb')}
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <MailOpen className="h-3.5 w-3.5" />{t('settings.templates')}
          </TabsTrigger>
          <TabsTrigger value="backup" className="gap-1.5">
            <Archive className="h-3.5 w-3.5" />{t('settings.backup')}
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />{t('settings.alerts')}
          </TabsTrigger>
        </TabsList>

        {/* ── GENERAL ─────────────────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-4 mt-4">
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
        </TabsContent>

        {/* ── SMTP ────────────────────────────────────────────────────────── */}
        <TabsContent value="smtp" className="space-y-4 mt-4">
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
                        <FormControl><Input type="password" placeholder={t('common.leaveBlank')} {...field} /></FormControl>
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
        </TabsContent>

        {/* ── SMB ─────────────────────────────────────────────────────────── */}
        <TabsContent value="smb" className="space-y-4 mt-4">
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
                        <FormControl><Input type="password" placeholder={t('common.leaveBlank')} {...field} /></FormControl>
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
        </TabsContent>

        {/* ── TEMPLATES ───────────────────────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-4 mt-4">
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
        </TabsContent>

        {/* ── BACKUP ──────────────────────────────────────────────────────── */}
        <TabsContent value="backup" className="space-y-4 mt-4">
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
                      <HardDrive className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                      <span className="flex-1 text-xs font-mono truncate">{f.filename}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                      <span className="text-xs text-muted-foreground/60 shrink-0 hidden sm:block">{formatDateTime(f.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ALERTS ──────────────────────────────────────────────────────── */}
        <TabsContent value="alerts" className="space-y-4 mt-4">
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
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
