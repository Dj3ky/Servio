import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Trash2, Upload, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { SectionHeader } from './shared';

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

export function LicenseTab() {
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

  const deleteMutation = useMutation({
    mutationFn: () => api.delete('/license'),
    onSuccess: () => {
      toast.success(t('license.deleteSuccess'));
      refetch();
    },
    onError: () => toast.error(t('errors.internal')),
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

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
        <CardContent className="flex items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".key" className="hidden" onChange={handleFile} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
            <Upload className="h-4 w-4 mr-2" />
            {uploadMutation.isPending ? t('common.loading') : t('license.uploadHint')}
          </Button>
          {license?.configured && (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={deleteMutation.isPending}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('license.delete')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('license.deleteTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{t('license.deleteConfirm')}</p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={() => { deleteMutation.mutate(); setConfirmDelete(false); }} disabled={deleteMutation.isPending}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
