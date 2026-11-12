import type { PmTask } from '../tasks';
import { sortByEmployeeOrder } from '../employeeOrder';

export interface EmployeeGroup<T> { key: string; employeeId: string | null; employeeName: string | null; items: T[] }

// Groups rows by project manager, in the same group order as the Projects page
export function groupByEmployee<T extends { employeeId: string | null; employeeName: string | null }>(
  rows: T[], order: string[],
): EmployeeGroup<T>[] {
  const groups = new Map<string, EmployeeGroup<T>>();
  for (const row of rows) {
    const key = row.employeeId ?? '__none__';
    let group = groups.get(key);
    if (!group) {
      group = { key, employeeId: row.employeeId, employeeName: row.employeeName, items: [] };
      groups.set(key, group);
    }
    group.items.push(row);
  }
  return sortByEmployeeOrder([...groups.values()], order);
}

export function groupTasksByProject(tasks: PmTask[]) {
  const map = new Map<string, PmTask[]>();
  for (const task of tasks) map.set(task.projectId, [...(map.get(task.projectId) ?? []), task]);
  return map;
}

// Accent per employee. Taken from the employee's place in the saved manual order (the same
// colours the Projects page shows), so a person keeps their colour in every meeting no matter
// who else is in the list. Employees not in the saved order fall back to a hash of their id.
const ACCENTS = [
  { bar: 'bg-blue-500', soft: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-300' },
  { bar: 'bg-emerald-500', soft: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300' },
  { bar: 'bg-violet-500', soft: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300' },
  { bar: 'bg-amber-500', soft: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300' },
  { bar: 'bg-rose-500', soft: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-300' },
  { bar: 'bg-cyan-500', soft: 'bg-cyan-500/10', text: 'text-cyan-700 dark:text-cyan-300' },
  { bar: 'bg-orange-500', soft: 'bg-orange-500/10', text: 'text-orange-700 dark:text-orange-300' },
  { bar: 'bg-teal-500', soft: 'bg-teal-500/10', text: 'text-teal-700 dark:text-teal-300' },
];
const NO_EMPLOYEE_ACCENT = { bar: 'bg-muted-foreground/40', soft: 'bg-muted/60', text: 'text-muted-foreground' };

export function employeeAccent(employeeId: string | null, order: string[]) {
  if (!employeeId) return NO_EMPLOYEE_ACCENT;
  const index = order.indexOf(employeeId);
  if (index !== -1) return ACCENTS[index % ACCENTS.length];
  let hash = 0;
  for (let i = 0; i < employeeId.length; i++) hash = (hash * 31 + employeeId.charCodeAt(i)) | 0;
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

export function initials(name: string | null) {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('');
}

// Whole days from a yyyy-MM-dd date to today (local)
export function daysSince(date: string, today: string) {
  const [y1, m1, d1] = date.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

// Parses yyyy-MM-dd as a local date (new Date('yyyy-MM-dd') would be UTC midnight)
export function parseLocalDate(date: string) {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Thursday, 12 November 2026"
export function longDate(date: string, locale: string) {
  return capitalize(parseLocalDate(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
}

// localStorage that never throws (private mode, blocked storage)
export const safeStorage = {
  get<T>(key: string): T | null {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
};
