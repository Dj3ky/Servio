import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { HardDrive, Server, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { updateSmbSettingsSchema, type UpdateSmbSettings } from '@servio/shared';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useCan } from '@/stores/permissionsStore';
import { DisconnectCard, SectionHeader, useFullSettings, useReportUnsaved } from './shared';

export function SmbTab() {
  const { t } = useTranslation();
  const can = useCan();
  const canManageSettings = can('settings', 'manage');
  const settings = useFullSettings();

  // ── SMB ──────────────────────────────────────────────────────────────────────
  const smbForm = useForm<UpdateSmbSettings>({
    resolver: zodResolver(updateSmbSettingsSchema),
    values: {
      smbHost: settings?.smbHost ?? '',
      smbShare: settings?.smbShare ?? '',
      smbUsername: settings?.smbUsername ?? '',
      smbPassword: '',
      smbBasePath: settings?.smbBasePath ?? '',
      smbPathTemplate: settings?.smbPathTemplate ?? '{year}/{contract_number}/{year_month}_{filename}',
    },
    resetOptions: { keepDirtyValues: true },
  });

  useReportUnsaved(smbForm.formState.isDirty);

  const saveSmb = useMutation({
    mutationFn: (d: UpdateSmbSettings) => api.patch('/settings/smb', d),
    onSuccess: (_r, d) => {
      smbForm.reset({ ...d, smbPassword: '' });
      toast.success(t('settings.saved'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const testSmb = useMutation({
    mutationFn: () => api.post<{ success: boolean; error?: string }>('/smb/test'),
    onSuccess: (r) => r.success ? toast.success(t('settings.smbTestOk')) : toast.error(r.error ?? t('settings.smbTestFailed')),
    onError: (err: any) => toast.error(err?.message ?? t('settings.smbTestFailed')),
  });

  const [showSmbPass, setShowSmbPass] = useState(false);

  return (
    <>
      <Card>
        <SectionHeader
          icon={Server}
          title={t('settings.smb')}
          description={t('settings.smbDesc')}
        />
        <CardContent>
          <Form {...smbForm}>
            <form onSubmit={smbForm.handleSubmit((d) => saveSmb.mutate(d))} className="space-y-5">
              <fieldset disabled={!canManageSettings} className="space-y-5">
              {/* Server */}
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.smbServer')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <FormField control={smbForm.control} name="smbPathTemplate" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('settings.smbPathTemplate')}</FormLabel>
                  <FormControl><Input placeholder="{year}/{contract_number}/{year_month}_{filename}" {...field} /></FormControl>
                  <FormDescription>{t('settings.smbPathTemplateHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <Separator />

              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('settings.smtpCredentials')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 text-muted-foreground" onClick={() => setShowSmbPass((v) => !v)} title={showSmbPass ? t('common.hidePassword') : t('common.showPassword')}>
                          {showSmbPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>{t('settings.smbPassHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              </fieldset>

              <div className="flex gap-2 pt-1">
                {canManageSettings && <Button type="submit" disabled={saveSmb.isPending}>{t('common.save')}</Button>}
                {can('smb', 'access') && (
                  <Button type="button" variant="outline" disabled={testSmb.isPending} onClick={() => testSmb.mutate()}>
                    <HardDrive className="h-4 w-4 mr-2" />
                    {testSmb.isPending ? t('common.loading') : t('settings.testSmb')}
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {canManageSettings && settings?.smbHost && (
        <DisconnectCard
          endpoint="/settings/smb"
          title={t('settings.smbDisconnectTitle')}
          description={t('settings.smbDisconnectDesc')}
          confirm={t('settings.smbDisconnectConfirm')}
        />
      )}
    </>
  );
}
