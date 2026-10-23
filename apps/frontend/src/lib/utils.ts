import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, locale = 'sl-SI'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(date: string | Date, locale = 'sl-SI'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatCurrency(value: number | null | undefined, currency = 'EUR'): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('sl-SI', { style: 'currency', currency }).format(value);
}

export function getMonthName(month: number, locale = 'sl-SI'): string {
  return new Date(2000, month - 1, 1).toLocaleDateString(locale, { month: 'long' });
}

/** Whole calendar months between a scheduled month (yyyy-MM-dd) and now; 0 for the current month. */
export function monthsAgo(scheduledMonth: string): number {
  const now = new Date();
  const scheduled = new Date(scheduledMonth + 'T00:00:00');
  return (now.getFullYear() - scheduled.getFullYear()) * 12 + (now.getMonth() - scheduled.getMonth());
}

/** A review still waiting for work after its month has ended. */
export function isMissedReview(r: { status: string; scheduledMonth: string }): boolean {
  return (r.status === 'pending' || r.status === 'in_progress') && monthsAgo(r.scheduledMonth) > 0;
}

export function formatScheduledMonth(s: string, lang: string): string {
  const d = new Date(s + 'T00:00:00');
  const locale = lang === 'sl' ? 'sl-SI' : 'en-US';
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' }).format(d);
  return `${monthName} ${d.getFullYear()}`;
}
