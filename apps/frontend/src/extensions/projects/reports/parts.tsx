import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { employeeAccent, initials } from '../meetings/utils';

// ── KPI tile ──────────────────────────────────────────────────────────────────

export function KpiTile({ label, value, delta, deltaTone = 'neutral', foot, tone = 'default', children, loading }: {
  label: string;
  value: string;
  delta?: string | null;
  deltaTone?: 'up' | 'down' | 'neutral' | 'danger';
  foot?: ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'danger';
  children?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 flex flex-col gap-2.5 min-w-0',
      tone === 'danger' && 'border-red-500/30 bg-red-500/[0.03]',
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground truncate">{label}</span>
        {delta && (
          <span className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
            deltaTone === 'up' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            deltaTone === 'down' && 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
            deltaTone === 'danger' && 'bg-red-500/10 text-red-700 dark:text-red-300',
            deltaTone === 'neutral' && 'bg-muted text-muted-foreground',
          )}>{delta}</span>
        )}
      </div>
      {loading ? <Skeleton className="h-8 w-3/4" /> : (
        <div className={cn(
          'text-2xl font-bold tracking-tight font-mono tabular-nums truncate',
          tone === 'primary' && 'text-primary',
          tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'danger' && 'text-red-600 dark:text-red-400',
        )} title={value}>{value}</div>
      )}
      <div className="h-7 flex items-end">{children}</div>
      {foot && <div className="text-xs text-muted-foreground truncate">{foot}</div>}
    </div>
  );
}

// Tiny bar chart for a KPI tile; the highlighted bar is the latest month with data
export function Sparkline({ values, highlight, className }: { values: number[]; highlight?: number; className?: string }) {
  const max = Math.max(...values, 0) || 1;
  return (
    <div className="flex h-7 w-full items-end gap-[3px]" aria-hidden="true">
      {values.map((v, i) => (
        <div
          key={i}
          className={cn('flex-1 rounded-[2px] min-h-[2px]', i === highlight ? 'bg-primary' : 'bg-primary/25', className)}
          style={{ height: `${Math.round((v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

// Thin progress bar used in tiles and rows
export function Meter({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full bg-primary', barClassName)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

// ── People ────────────────────────────────────────────────────────────────────

export function Avatar({ employeeId, name, order, size = 'sm' }: { employeeId: string | null; name: string | null; order: string[]; size?: 'sm' | 'md' }) {
  const accent = employeeAccent(employeeId, order);
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
      size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-xs',
      accent.bar,
    )}>{initials(name)}</span>
  );
}

export function Person({ employeeId, name, order, fallback }: { employeeId: string | null; name: string | null; order: string[]; fallback: string }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar employeeId={employeeId} name={name} order={order} />
      <span className="truncate">{name ?? fallback}</span>
    </span>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

export type Severity = 'low' | 'medium' | 'high';

export function SeverityBadge({ severity, children }: { severity: Severity; children: ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap',
      severity === 'low' && 'bg-muted text-muted-foreground',
      severity === 'medium' && 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
      severity === 'high' && 'bg-red-500/10 text-red-700 dark:text-red-300',
    )}>{children}</span>
  );
}

// ── Sortable tables ───────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

export function useSort<T, A extends Record<string, (row: T) => string | number>>(
  rows: T[],
  accessors: A,
  initialKey: keyof A & string,
  initialDir: SortDir = 'desc',
) {
  type K = keyof A & string;
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: initialKey, dir: initialDir });
  const sorted = useMemo(() => {
    const get = accessors[sort.key];
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
      return String(x).localeCompare(String(y), 'sl') * factor;
    });
    // accessors is a fresh object each render; the key and direction decide the order
  }, [rows, sort]);
  const toggle = (key: K) => setSort(prev => (
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: rows.length > 0 && typeof accessors[key](rows[0]) === 'number' ? 'desc' : 'asc' }
  ));
  return { sorted, sort, toggle };
}

export function SortTh<K extends string>({ label, sortKey, sort, onSort, align = 'left', className }: {
  label: string; sortKey: K; sort: { key: K; dir: SortDir }; onSort: (key: K) => void;
  align?: 'left' | 'right'; className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={cn('px-4 py-2.5 font-medium', align === 'right' ? 'text-right' : 'text-left', className)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground', align === 'right' && 'flex-row-reverse')}>
        {label}<Icon className={cn('h-3.5 w-3.5', !active && 'opacity-40')} />
      </button>
    </th>
  );
}

// Placeholder rows while a table loads
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; swatch: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {items.map(item => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-[3px]', item.swatch)} />{item.label}
        </span>
      ))}
    </div>
  );
}
