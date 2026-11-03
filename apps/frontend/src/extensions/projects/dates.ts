// Today as yyyy-MM-dd in the user's local time zone
export function localToday(): string {
  return new Date().toLocaleDateString('sv-SE');
}

// True when a yyyy-MM-dd date is before today (a deadline of today is not yet overdue).
// Compares date strings, because new Date('yyyy-MM-dd') is UTC midnight and would flip at 01:00 in Slovenia.
export function isPastDue(date: string | null | undefined): boolean {
  return !!date && date.slice(0, 10) < localToday();
}
