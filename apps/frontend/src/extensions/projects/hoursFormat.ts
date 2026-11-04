export function formatHours(seconds: number) {
  return `${(seconds / 3600).toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}
