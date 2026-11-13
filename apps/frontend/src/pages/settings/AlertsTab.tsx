import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Bell, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { updateAlertsSettingsSchema, type UpdateAlertsSettings } from '@servio/shared';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { SectionHeader, useFullSettings, useReportUnsaved } from './shared';

export function AlertsTab() {
  const { t } = useTranslation();
  const settings = useFullSettings();

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

  const isDirty = alertsForm.formState.isDirty;
  useReportUnsaved(isDirty);

  const saveAlerts = useMutation({
    mutationFn: (d: UpdateAlertsSettings) => api.patch('/settings/alerts', d),
    onSuccess: (_r, d) => {
      alertsForm.reset(d);
      toast.success(t('settings.saved'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  // Sends the digest now with the saved settings, even when it is switched off
  const testDigest = useMutation({
    mutationFn: () => api.post<{ success: boolean; recipient?: string; error?: string }>('/settings/alerts/test-digest'),
    onSuccess: (r) => r.success
      ? toast.success(t('settings.testDigestSent', { email: r.recipient }))
      : toast.error(r.error ?? t('errors.internal'), { duration: 10000 }),
  });

  const digestEnabled = alertsForm.watch('digestEnabled');
  const escalationEnabled = alertsForm.watch('escalationEnabled');

  return (
    <>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="submit" disabled={saveAlerts.isPending}>{t('common.save')}</Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={testDigest.isPending || isDirty}
                  title={isDirty ? t('settings.testDigestSaveFirst') : undefined}
                  onClick={() => testDigest.mutate()}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {testDigest.isPending ? t('common.loading') : t('settings.testDigest')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
