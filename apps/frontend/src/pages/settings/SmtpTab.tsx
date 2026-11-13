import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { updateSmtpSettingsSchema, type UpdateSmtpSettings, testSmtpSchema, type TestSmtpRequest } from '@servio/shared';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { DisconnectCard, SectionHeader, useFullSettings, useReportUnsaved } from './shared';

export function SmtpTab() {
  const { t } = useTranslation();
  const settings = useFullSettings();

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

  useReportUnsaved(smtpForm.formState.isDirty);

  const saveSmtp = useMutation({
    mutationFn: (d: UpdateSmtpSettings) => api.patch('/settings/smtp', d),
    onSuccess: (_r, d) => {
      smtpForm.reset({ ...d, smtpPass: '' });
      toast.success(t('settings.saved'));
      // Refetch so the password field clears and shows "leave blank" once a password is stored
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const testSmtp = useMutation({
    mutationFn: (d: TestSmtpRequest) => api.post('/settings/smtp/test', d),
    onSuccess: (r: any) => r.success ? toast.success(t('settings.smtpTestOk')) : toast.error(r.error ?? t('settings.smtpTestFailed')),
  });

  const [showSmtpPass, setShowSmtpPass] = useState(false);

  return (
    <>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground" onClick={() => setShowSmtpPass((v) => !v)} title={showSmtpPass ? t('common.hidePassword') : t('common.showPassword')}>
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

      {settings?.smtpHost && (
        <DisconnectCard
          endpoint="/settings/smtp"
          title={t('settings.smtpDisconnectTitle')}
          description={t('settings.smtpDisconnectDesc')}
          confirm={t('settings.smtpDisconnectConfirm')}
        />
      )}
    </>
  );
}
