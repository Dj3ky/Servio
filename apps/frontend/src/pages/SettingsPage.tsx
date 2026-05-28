import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Trash2, HardDrive, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  updateGeneralSettingsSchema, updateSmtpSettingsSchema, updateSmbSettingsSchema,
  updateBackupSettingsSchema,
  type UpdateGeneralSettings, type UpdateSmtpSettings, type UpdateSmbSettings,
  type UpdateBackupSettings,
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
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  language: 'sl' | 'en';
  isDefault: boolean;
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

export default function SettingsPage() {
  const { t } = useTranslation();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<FullSettings>('/settings'),
  });

  // ── General form ──────────────────────────────────────────────────────────
  const generalForm = useForm<UpdateGeneralSettings>({
    resolver: zodResolver(updateGeneralSettingsSchema),
    values: { appName: settings?.appName ?? 'Servio', defaultLanguage: settings?.defaultLanguage ?? 'sl', accountingEmail: settings?.accountingEmail ?? '' },
  });

  const saveGeneral = useMutation({
    mutationFn: (d: UpdateGeneralSettings) => api.patch('/settings/general', d),
    onSuccess: () => { toast.success(t('common.save')); queryClient.invalidateQueries({ queryKey: ['settings'] }); queryClient.invalidateQueries({ queryKey: ['public-settings'] }); },
  });

  // ── Logo upload ────────────────────────────────────────────────────────────
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

  // ── SMTP form ──────────────────────────────────────────────────────────────
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
  const testSmtpForm = useForm<TestSmtpRequest>({ resolver: zodResolver(testSmtpSchema), defaultValues: { recipient: '' } });

  const saveSmtp = useMutation({ mutationFn: (d: UpdateSmtpSettings) => api.patch('/settings/smtp', d), onSuccess: () => toast.success(t('common.save')) });
  const testSmtp = useMutation({
    mutationFn: (d: TestSmtpRequest) => api.post('/settings/smtp/test', d),
    onSuccess: (r: any) => r.success ? toast.success('SMTP OK') : toast.error(r.error ?? 'Failed'),
  });

  // ── SMB form ───────────────────────────────────────────────────────────────
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
    onSuccess: (r) => r.success ? toast.success('SMB OK') : toast.error(r.error ?? 'SMB connection failed'),
    onError: (err: any) => toast.error(err?.message ?? 'SMB test failed'),
  });

  // ── Backup ─────────────────────────────────────────────────────────────────
  const backupForm = useForm<UpdateBackupSettings>({
    resolver: zodResolver(updateBackupSettingsSchema),
    values: {
      backupEnabled: settings?.backupEnabled ?? false,
      backupSchedule: settings?.backupSchedule ?? '0 2 * * *',
      backupPath: settings?.backupPath ?? './backups',
    },
  });

  const saveBackup = useMutation({ mutationFn: (d: UpdateBackupSettings) => api.patch('/settings/backup', d), onSuccess: () => { toast.success(t('common.save')); queryClient.invalidateQueries({ queryKey: ['settings'] }); } });

  const { data: backupFiles = [], refetch: refetchBackups } = useQuery({
    queryKey: ['backup-list'],
    queryFn: () => api.get<BackupFile[]>('/settings/backup/list'),
  });

  const createBackupMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean; filePath: string }>('/settings/backup/create', {}),
    onSuccess: () => { toast.success('Backup created'); refetchBackups(); },
    onError: (err: any) => toast.error(err?.message ?? t('errors.internal')),
  });

  // ── Templates ──────────────────────────────────────────────────────────────
  const { data: templates = [], refetch: refetchTemplates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/settings/templates'),
  });

  const [templateDialog, setTemplateDialog] = useState<{ mode: 'create' | 'edit'; template?: EmailTemplate } | null>(null);

  const templateForm = useForm<CreateEmailTemplateRequest>({
    resolver: zodResolver(createEmailTemplateSchema),
    defaultValues: { name: '', subject: '', body: '', language: 'sl', isDefault: false },
  });

  function openCreateTemplate() {
    templateForm.reset({ name: '', subject: '', body: '', language: 'sl', isDefault: false });
    setTemplateDialog({ mode: 'create' });
  }

  function openEditTemplate(tpl: EmailTemplate) {
    templateForm.reset({ name: tpl.name, subject: tpl.subject, body: tpl.body, language: tpl.language, isDefault: tpl.isDefault });
    setTemplateDialog({ mode: 'edit', template: tpl });
  }

  const saveTemplate = useMutation({
    mutationFn: (d: CreateEmailTemplateRequest) => {
      if (templateDialog?.mode === 'edit' && templateDialog.template) {
        return api.patch(`/settings/templates/${templateDialog.template.id}`, d);
      }
      return api.post('/settings/templates', d);
    },
    onSuccess: () => {
      toast.success(t('common.save'));
      refetchTemplates();
      setTemplateDialog(null);
    },
    onError: () => toast.error(t('errors.internal')),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/templates/${id}`),
    onSuccess: () => { toast.success(t('common.delete')); refetchTemplates(); },
    onError: () => toast.error(t('errors.internal')),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
          <TabsTrigger value="smtp">{t('settings.smtp')}</TabsTrigger>
          <TabsTrigger value="smb">{t('settings.smb')}</TabsTrigger>
          <TabsTrigger value="templates">{t('settings.templates')}</TabsTrigger>
          <TabsTrigger value="backup">{t('settings.backup')}</TabsTrigger>
        </TabsList>

        {/* ── GENERAL ── */}
        <TabsContent value="general">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('settings.general')}</CardTitle></CardHeader>
              <CardContent>
                <Form {...generalForm}>
                  <form onSubmit={generalForm.handleSubmit((d) => saveGeneral.mutate(d))} className="space-y-4 max-w-md">
                    <FormField control={generalForm.control} name="appName" render={({ field }) => (
                      <FormItem><FormLabel>{t('settings.appName')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={generalForm.control} name="defaultLanguage" render={({ field }) => (
                      <FormItem><FormLabel>{t('settings.defaultLanguage')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="sl">Slovenščina</SelectItem>
                            <SelectItem value="en">English</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={generalForm.control} name="accountingEmail" render={({ field }) => (
                      <FormItem><FormLabel>{t('settings.accountingEmail')}</FormLabel><FormControl><Input type="email" placeholder="accounting@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <Button type="submit" disabled={saveGeneral.isPending}>{t('common.save')}</Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{t('settings.logoUpload')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {settings?.logoUrl && (
                  <img src={settings.logoUrl} alt="Logo" className="h-16 object-contain border rounded p-2" />
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }}
                />
                <Button
                  variant="outline"
                  disabled={logoUploading}
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {logoUploading ? t('common.loading') : t('common.upload')}
                </Button>
                <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 5 MB.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── SMTP ── */}
        <TabsContent value="smtp">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('settings.smtp')}</CardTitle></CardHeader>
            <CardContent>
              <Form {...smtpForm}>
                <form onSubmit={smtpForm.handleSubmit((d) => saveSmtp.mutate(d))} className="space-y-4 max-w-md">
                  <FormField control={smtpForm.control} name="smtpHost" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smtpHost')}</FormLabel><FormControl><Input placeholder="smtp.gmail.com" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smtpForm.control} name="smtpPort" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smtpPort')}</FormLabel><FormControl><Input type="number" {...field} onChange={(e) => field.onChange(Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smtpForm.control} name="smtpUser" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smtpUser')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smtpForm.control} name="smtpPass" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smtpPass')}</FormLabel><FormControl><Input type="password" placeholder="Leave blank to keep current" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smtpForm.control} name="smtpFrom" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smtpFrom')}</FormLabel><FormControl><Input placeholder='Servio <noreply@example.com>' {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smtpForm.control} name="smtpSecure" render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormLabel className="mt-0">{t('settings.smtpSecure')}</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                  <Button type="submit" disabled={saveSmtp.isPending}>{t('common.save')}</Button>
                </form>
              </Form>
              <div className="mt-6 border-t pt-4">
                <Form {...testSmtpForm}>
                  <form onSubmit={testSmtpForm.handleSubmit((d) => testSmtp.mutate(d))} className="flex gap-2 max-w-md">
                    <FormField control={testSmtpForm.control} name="recipient" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl><Input type="email" placeholder={t('settings.testRecipient')} {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <Button type="submit" variant="outline" disabled={testSmtp.isPending}>{t('settings.testSmtp')}</Button>
                  </form>
                </Form>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SMB ── */}
        <TabsContent value="smb">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('settings.smb')}</CardTitle></CardHeader>
            <CardContent>
              <Form {...smbForm}>
                <form onSubmit={smbForm.handleSubmit((d) => saveSmb.mutate(d))} className="space-y-4 max-w-md">
                  <FormField control={smbForm.control} name="smbHost" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smbHost')}</FormLabel><FormControl><Input placeholder="192.168.1.100" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smbForm.control} name="smbShare" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smbShare')}</FormLabel><FormControl><Input placeholder="reports" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smbForm.control} name="smbUsername" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smbUser')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smbForm.control} name="smbPassword" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smbPass')}</FormLabel><FormControl><Input type="password" placeholder="Leave blank to keep current" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={smbForm.control} name="smbBasePath" render={({ field }) => (
                    <FormItem><FormLabel>{t('settings.smbBasePath')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={saveSmb.isPending}>{t('common.save')}</Button>
                    <Button type="button" variant="outline" disabled={testSmb.isPending} onClick={() => testSmb.mutate()}>{t('settings.testSmb')}</Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TEMPLATES ── */}
        <TabsContent value="templates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('settings.templates')}</CardTitle>
              <Button size="sm" onClick={openCreateTemplate}>
                <Plus className="h-4 w-4 mr-1" />
                {t('common.create')}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">{t('common.noData')}</p>
              )}
              {templates.map((tpl) => (
                <div key={tpl.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{tpl.name}</span>
                      {tpl.isDefault && <Badge variant="secondary" className="text-xs">default</Badge>}
                      <Badge variant="outline" className="text-xs">{tpl.language}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{tpl.subject}</p>
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
              <p className="text-xs text-muted-foreground pt-2">
                {'Available variables: {{customer_name}}, {{facility_name}}, {{month}}, {{year}}, {{contract_number}}, {{app_name}}'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BACKUP ── */}
        <TabsContent value="backup">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('settings.backup')}</CardTitle></CardHeader>
              <CardContent>
                <Form {...backupForm}>
                  <form onSubmit={backupForm.handleSubmit((d) => saveBackup.mutate(d))} className="space-y-4 max-w-md">
                    <FormField control={backupForm.control} name="backupEnabled" render={({ field }) => (
                      <FormItem className="flex items-center gap-3">
                        <FormLabel className="mt-0">{t('settings.backupEnabled')}</FormLabel>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={backupForm.control} name="backupSchedule" render={({ field }) => (
                      <FormItem><FormLabel>{t('settings.backupSchedule')}</FormLabel><FormControl><Input placeholder="0 2 * * *" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={backupForm.control} name="backupPath" render={({ field }) => (
                      <FormItem><FormLabel>{t('settings.backupPath')}</FormLabel><FormControl><Input placeholder="./backups" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="flex gap-2">
                      <Button type="submit" disabled={saveBackup.isPending}>{t('common.save')}</Button>
                      <Button type="button" variant="outline" disabled={createBackupMutation.isPending} onClick={() => createBackupMutation.mutate()}>
                        <HardDrive className="h-4 w-4 mr-2" />
                        {createBackupMutation.isPending ? t('common.loading') : t('settings.createBackup')}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Backup Files</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {backupFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">{t('common.noData')}</p>
                ) : backupFiles.map((f) => (
                  <div key={f.filename} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                    <span className="font-mono text-xs truncate">{f.filename}</span>
                    <div className="flex items-center gap-3 shrink-0 ml-3 text-muted-foreground text-xs">
                      <span>{formatBytes(f.size)}</span>
                      <span>{formatDateTime(f.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Template create/edit dialog ── */}
      <Dialog open={!!templateDialog} onOpenChange={(open) => { if (!open) setTemplateDialog(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {templateDialog?.mode === 'edit' ? t('common.edit') : t('common.create')} {t('settings.templates').toLowerCase()}
            </DialogTitle>
          </DialogHeader>
          <Form {...templateForm}>
            <form onSubmit={templateForm.handleSubmit((d) => saveTemplate.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={templateForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{t('common.name')}</FormLabel><FormControl><Input placeholder="Monthly report" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={templateForm.control} name="language" render={({ field }) => (
                  <FormItem><FormLabel>{t('users.language')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="sl">Slovenščina</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={templateForm.control} name="subject" render={({ field }) => (
                <FormItem><FormLabel>{t('reviews.emailSubject')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={templateForm.control} name="body" render={({ field }) => (
                <FormItem><FormLabel>{t('reviews.emailBody')}</FormLabel><FormControl><Textarea rows={8} className="font-mono text-sm resize-y" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={templateForm.control} name="isDefault" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormLabel className="mt-0">Set as default</FormLabel>
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
