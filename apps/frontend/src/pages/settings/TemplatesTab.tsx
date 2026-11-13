import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Trash2, MailOpen, CheckCircle2 } from 'lucide-react';
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
import { createEmailTemplateSchema, type CreateEmailTemplateRequest } from '@servio/shared';
import { api } from '@/lib/api';
import { useCan } from '@/stores/permissionsStore';
import { formatDateTime } from '@/lib/utils';
import { type EmailTemplate } from './shared';

export function TemplatesTab() {
  const { t } = useTranslation();
  const can = useCan();

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
    onSuccess: () => { toast.success(t('settings.saved')); refetchTemplates(); setTemplateDialog(null); },
    onError: () => toast.error(t('errors.internal')),
  });

  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<EmailTemplate | null>(null);
  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/templates/${id}`),
    onSuccess: () => { toast.success(t('common.delete')); refetchTemplates(); setDeleteTemplateTarget(null); },
    onError: () => toast.error(t('errors.internal')),
  });

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MailOpen className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{t('settings.templates')}</CardTitle>
            </div>
            {can('settings', 'manageTemplates') && (
              <Button size="sm" onClick={openCreateTemplate}>
                <Plus className="h-4 w-4 mr-1" />
                {t('common.create')}
              </Button>
            )}
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
                      <CheckCircle2 className="h-3 w-3" /> {t('settings.templateDefaultBadge')}
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
                {can('settings', 'manageTemplates') && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditTemplate(tpl)} title={t('common.edit')}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {can('settings', 'deleteTemplates') && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTemplateTarget(tpl)} title={t('common.delete')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      <Dialog open={!!deleteTemplateTarget} onOpenChange={(v) => { if (!v) setDeleteTemplateTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.deleteTemplateTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{t('settings.deleteTemplateConfirm', { name: deleteTemplateTarget?.name ?? '' })}</p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTemplateTarget(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={deleteTemplate.isPending}
              onClick={() => deleteTemplateTarget && deleteTemplate.mutate(deleteTemplateTarget.id)}
            >
              {deleteTemplate.isPending ? t('common.loading') : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
