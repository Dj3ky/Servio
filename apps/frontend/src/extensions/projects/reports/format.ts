import { formatDate } from '@/lib/utils';

export function num(v: string | number | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isNaN(n) ? 0 : n;
}

// de-DE: same format as sl-SI, but sl-SI skips the thousands separator for 4-digit amounts.
// Zero shows as "—" whether it arrives as a number or as a string.
export function eur(v: string | number | null | undefined, digits = 0): string {
  const n = num(v);
  if (n === 0) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

// Compact axis label: €12k
export function eurShort(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1000) return `€${Math.round(v / 1000)}k`;
  return `€${Math.round(v)}`;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// Short month name (1–12) in the UI language
export function monthName(month: number, lang: string): string {
  const name = new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2000, month - 1, 1));
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/\.$/, '');
}

export function escapeHtml(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// CSV cells for Excel with Slovenian settings: semicolon separator, decimal comma
export type CsvCell = string | number | null | undefined;
export const csvMoney = (v: string | number | null | undefined) => num(v).toFixed(2).replace('.', ',');
export const csvDate = (v: string | null | undefined) => (v ? formatDate(v) : '');

export function downloadCsv(filename: string, header: string[], rows: CsvCell[][]) {
  const cell = (v: CsvCell) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map(r => r.map(cell).join(';')).join('\r\n');
  // BOM so Excel reads č/š/ž correctly
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
