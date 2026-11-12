import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ENTRY_STATUSES, type EntryStatus, type QuickViewProject } from './types';

const STATUS_ACTIVE_CLASS: Record<EntryStatus, string> = {
  active: 'bg-background text-foreground shadow-sm',
  on_hold: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 shadow-sm',
  completed: 'bg-emerald-600 text-white shadow-sm',
};

// Three-way segmented control: one click instead of opening a dropdown
export function StatusToggle({ value, onChange }: { value: EntryStatus; onChange: (v: EntryStatus) => void }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" className="inline-flex w-full rounded-md border bg-muted/40 p-0.5">
      {ENTRY_STATUSES.map(s => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={cn(
            'flex-1 whitespace-nowrap rounded px-2 h-6 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === s ? STATUS_ACTIVE_CLASS[s] : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(`pm.status.${s}`)}
        </button>
      ))}
    </div>
  );
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  active: 'border-border text-foreground bg-transparent',
  on_hold: 'border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300',
  completed: 'border-transparent bg-emerald-600 text-white',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return <Badge variant="outline" className={cn('text-xs font-medium', STATUS_BADGE_CLASS[status], className)}>{t(`pm.status.${status}`)}</Badge>;
}

// Textarea that grows with its content, starting at one line
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, value, ...props }, ref) => {
    const inner = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => inner.current!);
    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    }, [value]);
    return (
      <textarea
        ref={inner}
        rows={1}
        value={value}
        className={cn(
          'block w-full resize-none overflow-hidden rounded-md border border-input bg-background px-2.5 py-1.5 text-sm leading-snug placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        {...props}
      />
    );
  },
);
AutoTextarea.displayName = 'AutoTextarea';

export function ProgressBar({ value, max, className, barClassName }: { value: number; max: number; className?: string; barClassName?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full bg-primary transition-[width] duration-300', pct === 100 && 'bg-emerald-500', barClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ConfirmDialog({
  open, title, text, confirmLabel, cancelLabel, onConfirm, onCancel, destructive = true, busy,
}: {
  open: boolean; title: string; text: ReactNode; confirmLabel: string; cancelLabel: string;
  onConfirm: () => void; onCancel: () => void; destructive?: boolean; busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="text-sm text-muted-foreground">{text}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Read-only project summary, opened from a project name in the meeting form
export function ProjectQuickView({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: project } = useQuery<QuickViewProject>({
    queryKey: ['pm-project-quickview', projectId],
    queryFn: () => api.get(`/pm/projects/${projectId}`),
    enabled: !!projectId,
  });
  const money = (v: string | null) => v ? `${Number(v).toLocaleString('sl-SI')} €` : '—';

  return (
    <Dialog open={!!projectId} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? `${project.name} (${project.projectNumber})` : '…'}</DialogTitle>
        </DialogHeader>
        {project && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div className="text-muted-foreground">{t('pm.projects.fieldCustomer')}</div>
              <div>{project.customerName || '—'}</div>
              <div className="text-muted-foreground">{t('pm.projects.fieldFacility')}</div>
              <div>{project.facilityName || '—'}</div>
              <div className="text-muted-foreground">{t('pm.projects.fieldEmployee')}</div>
              <div>{project.employeeName || '—'}</div>
              <div className="text-muted-foreground">{t('common.status')}</div>
              <div><Badge variant="outline">{t(`pm.status.${project.status}`)}</Badge></div>
              <div className="text-muted-foreground">{t('pm.projects.fieldPriority')}</div>
              <div><Badge variant="secondary">{t(`pm.priority.${project.priority}`)}</Badge></div>
              <div className="text-muted-foreground">{t('pm.projects.fieldStartDate')}</div>
              <div>{project.startDate ? formatDate(project.startDate) : '—'}</div>
              <div className="text-muted-foreground">{t('pm.projects.fieldEndDate')}</div>
              <div>{project.endDate ? formatDate(project.endDate) : '—'}</div>
              <div className="text-muted-foreground">{t('pm.projects.fieldContractValue')}</div>
              <div>{money(project.contractValue)}</div>
              <div className="text-muted-foreground">{t('pm.projects.fieldInvoiced')}</div>
              <div>{money(project.invoicedAmount)}</div>
            </div>
            {project.notes && (
              <div className="pt-1 border-t">
                <p className="text-muted-foreground mb-1">{t('pm.projects.fieldNotes')}</p>
                <p className="whitespace-pre-wrap">{project.notes}</p>
              </div>
            )}
            <div className="pt-2 border-t flex justify-end">
              {/* New tab so unsaved meeting edits underneath aren't lost */}
              <Button variant="outline" size="sm" onClick={() => window.open(`/pm/projects/${project.id}`, '_blank', 'noopener')}>
                {t('pm.meetings.openProject')} <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
