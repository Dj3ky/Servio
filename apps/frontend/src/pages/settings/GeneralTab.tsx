import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, Upload, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { updateGeneralSettingsSchema, type UpdateGeneralSettings } from '@servio/shared';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { getToken, SectionHeader, useFullSettings, useReportUnsaved } from './shared';

export function GeneralTab() {
  const { t } = useTranslation();
  const settings = useFullSettings();

  // ── General ──────────────────────────────────────────────────────────────────
  const generalForm = useForm<UpdateGeneralSettings>({
    resolver: zodResolver(updateGeneralSettingsSchema),
    values: {
      appName: settings?.appName ?? 'Servio',
      defaultLanguage: settings?.defaultLanguage ?? 'sl',
      accountingEmail: settings?.accountingEmail ?? '',
    },
  });

  useReportUnsaved(generalForm.formState.isDirty);

  const saveGeneral = useMutation({
    mutationFn: (d: UpdateGeneralSettings) => api.patch('/settings/general', d),
    onSuccess: (_r, d) => {
      generalForm.reset(d);
      toast.success(t('settings.saved'));
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
      const r = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });
      if (!r.ok) {
        // A rejected file type arrives as "no file", which is really a format problem
        const { error } = await r.json().catch(() => ({ error: 'errors.internal' }));
        toast.error(t(error === 'errors.file_required' ? 'errors.logo_format' : error ?? 'errors.internal'));
        return;
      }
      toast.success(t('settings.saved'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['public-settings'] });
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setLogoUploading(false);
    }
  }

  const removeLogo = useMutation({
    mutationFn: () => api.delete('/settings/logo'),
    onSuccess: () => {
      toast.success(t('settings.logoRemoved'));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['public-settings'] });
    },
  });

  return (
    <>
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
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ''; }}
          />
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              {logoUploading ? t('common.loading') : t('common.upload')}
            </Button>
            {settings?.logoUrl && (
              <Button variant="outline" disabled={removeLogo.isPending} onClick={() => removeLogo.mutate()}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('settings.logoRemove')}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">{t('settings.logoHint')}</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
