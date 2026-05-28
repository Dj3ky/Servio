import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  updateGeneralSettingsSchema, updateSmtpSettingsSchema, updateSmbSettingsSchema,
  type UpdateGeneralSettings, type UpdateSmtpSettings, type UpdateSmbSettings, testSmtpSchema, type TestSmtpRequest,
} from '@servio/shared';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

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

export default function SettingsPage() {
  const { t } = useTranslation();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<FullSettings>('/settings'),
  });

  const generalForm = useForm<UpdateGeneralSettings>({
    resolver: zodResolver(updateGeneralSettingsSchema),
    values: { appName: settings?.appName ?? 'Servio', defaultLanguage: settings?.defaultLanguage ?? 'sl', accountingEmail: settings?.accountingEmail ?? '' },
  });

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

  const smbForm = useForm<UpdateSmbSettings>({
    resolver: zodResolver(updateSmbSettingsSchema),
    values: {
      smbHost: settings?.smbHost ?? '',
      smbShare: settings?.smbShare ?? '',
      smbUsername: settings?.smbUsername ?? '',
      smbPassword: '',
      smbBasePath: settings?.smbBasePath ?? '',
    },
  });

  const saveGeneral = useMutation({ mutationFn: (d: UpdateGeneralSettings) => api.patch('/settings/general', d), onSuccess: () => { toast.success(t('common.save')); queryClient.invalidateQueries({ queryKey: ['settings'] }); queryClient.invalidateQueries({ queryKey: ['public-settings'] }); } });
  const saveSmtp = useMutation({ mutationFn: (d: UpdateSmtpSettings) => api.patch('/settings/smtp', d), onSuccess: () => toast.success(t('common.save')) });
  const testSmtp = useMutation({ mutationFn: (d: TestSmtpRequest) => api.post('/settings/smtp/test', d), onSuccess: (r: any) => r.success ? toast.success('SMTP OK') : toast.error(r.error ?? 'Failed') });
  const saveSmb = useMutation({ mutationFn: (d: UpdateSmbSettings) => api.patch('/settings/smb', d), onSuccess: () => toast.success(t('common.save')) });
  const testSmb = useMutation({
    mutationFn: () => api.post<{ success: boolean; error?: string }>('/smb/test'),
    onSuccess: (r) => r.success ? toast.success('SMB OK') : toast.error(r.error ?? 'SMB connection failed'),
    onError: (err: any) => toast.error(err?.code ? t(`errors.${err.code}` as any, err.code) : (err?.message ?? 'SMB test failed')),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
          <TabsTrigger value="smtp">{t('settings.smtp')}</TabsTrigger>
          <TabsTrigger value="smb">{t('settings.smb')}</TabsTrigger>
          <TabsTrigger value="backup">{t('settings.backup')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
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
        </TabsContent>

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
                    <FormItem><FormLabel>{t('settings.smbBasePath')}</FormLabel><FormControl><Input placeholder="" {...field} /></FormControl><FormMessage /></FormItem>
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

        <TabsContent value="backup">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('settings.backup')}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Backup configuration – use the general settings form or configure via .env for now.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
