import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ENTRY_STATUSES, type EntryStatus } from './types';

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
