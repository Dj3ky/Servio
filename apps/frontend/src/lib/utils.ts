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
