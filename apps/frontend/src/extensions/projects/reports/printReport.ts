import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { sortByEmployeeOrder } from '../employeeOrder';
import { isPastDue } from '../dates';
import { escapeHtml as h, monthName, num } from './format';
import type { CompletionsRow, OutstandingProject, RevenueTrendRow, SummaryData } from './types';

interface PrintInput {
  year: number;
  customer: string;
  lang: string;
  summary: SummaryData | undefined;
  revenueTrend: RevenueTrendRow[] | undefined;
  completions: CompletionsRow[] | undefined;
  outstanding: OutstandingProject[] | undefined;
  employeeOrder: string[];
  withCustomer: (url: string) => string;
}

const fmtEur = (v: number | string | null | undefined) => {
  const n = num(v);
  return n === 0 ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
};

const GROUP_COLORS = ['#dbeafe', '#d1fae5', '#ede9fe', '#fef3c7', '#fee2e2', '#cffafe', '#ffedd5', '#ccfbf1'];

// Opens a printable A4 report in a new window. All names are escaped: they are free text.
export async function printProjectReport(input: PrintInput) {
  const { year, customer, lang, summary, revenueTrend, completions, outstanding, employeeOrder, withCustomer } = input;
  // Open the window before awaiting, so the browser treats it as a response to the click
  const win = window.open('', '_blank');
  if (!win) return;
  const generated = new Date().toLocaleDateString('sl-SI');

  let activeResp: { data: any[] }, archivedResp: { data: any[] };
  try {
    [activeResp, archivedResp] = await Promise.all([
      api.get<{ data: any[] }>(withCustomer(`/pm/projects?archived=false&limit=500`)),
      api.get<{ data: any[] }>(withCustomer(`/pm/projects?archived=true&limit=500`)),
    ]);
  } catch (err) {
    win.close();
    throw err;
  }
  const activeProjects: any[] = activeResp.data ?? [];
  const completedThisYear: any[] = (archivedResp.data ?? []).filter((p: any) =>
    p.completedAt && new Date(p.completedAt).getFullYear() === year);

  function groupByEmp(projects: any[]) {
    const groups: { employeeId: string | null; employeeName: string | null; projects: any[] }[] = [];
    const seen = new Map<string, number>();
    for (const p of projects) {
      const key = p.employeeId ?? '__none__';
      if (!seen.has(key)) { seen.set(key, groups.length); groups.push({ employeeId: p.employeeId, employeeName: p.employeeName, projects: [] }); }
      groups[seen.get(key)!].projects.push(p);
    }
    return sortByEmployeeOrder(groups, employeeOrder);
  }

  function projectTable(projects: any[], showCompleted: boolean, groupHeader: string) {
    if (projects.length === 0) return '<p style="color:#888;font-size:11px;padding:6px 0">—</p>';
    const rows = projects.map(p => {
      const remaining = num(p.contractValue) - num(p.invoicedAmount);
      const overdue = !showCompleted && isPastDue(p.endDate);
      return `<tr>
        <td><span style="color:#666">${h(p.projectNumber)}</span> <strong>${h(p.name)}</strong></td>
        <td>${h(p.customerName ?? '—')}</td>
        <td>${h(p.facilityName ?? '—')}</td>
        ${showCompleted
          ? `<td style="color:#15803d">${p.completedAt ? formatDate(p.completedAt) : '—'}</td>`
          : `<td style="${overdue ? 'color:#dc2626;font-weight:600' : ''}">${p.endDate ? formatDate(p.endDate) : '—'}</td>`}
        <td style="text-align:right">${fmtEur(p.contractValue)}</td>
        <td style="text-align:right">${fmtEur(p.invoicedAmount)}</td>
        <td style="text-align:right;${!showCompleted && remaining > 0 ? 'color:#15803d' : showCompleted && remaining > 0 ? 'color:#dc2626' : ''}">${fmtEur(remaining)}</td>
      </tr>`;
    }).join('');
    // Fixed widths so columns line up across all manager groups
    return `<table class="fixed">
      <colgroup><col style="width:22%"><col style="width:18%"><col style="width:18%"><col style="width:10%"><col style="width:11%"><col style="width:11%"><col style="width:10%"></colgroup>
      <thead>${groupHeader}<tr>
      <th>Delovni nalog</th><th>Naročnik</th><th>Objekt</th><th>${showCompleted ? 'Zaključeno' : 'Rok'}</th>
      <th style="text-align:right">Vrednost</th><th style="text-align:right">Fakturirano</th><th style="text-align:right">${showCompleted ? 'Nefakt.' : 'Ostalo'}</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }

  function groupedSection(projects: any[], showCompleted: boolean) {
    return groupByEmp(projects).map((g, i) => {
      // Group header lives in <thead> so it never gets orphaned at a page bottom
      // and repeats on each page the group spans
      const header = `<tr><th colspan="7" class="group-header" style="background:${GROUP_COLORS[i % GROUP_COLORS.length]}">${h(g.employeeName ?? 'Nedodeljeno')} (${g.projects.length})</th></tr>`;
      return `<div style="margin-bottom:10px">${projectTable(g.projects, showCompleted, header)}</div>`;
    }).join('');
  }

  const totalRevenue = (revenueTrend ?? []).reduce((s, r) => s + r.revenue, 0);
  const totalPrev = (revenueTrend ?? []).reduce((s, r) => s + r.prevRevenue, 0);

  const monthRows = (revenueTrend ?? []).map((r, i) => {
    const c = completions?.[i]?.count ?? 0;
    return `<tr>
      <td>${h(monthName(r.month, lang))}</td>
      <td style="text-align:right;${r.revenue > 0 ? 'color:#15803d;font-weight:600' : 'color:#aaa'}">${fmtEur(r.revenue)}</td>
      <td style="text-align:right;color:#666">${fmtEur(r.prevRevenue)}</td>
      <td style="text-align:right">${r.invoiceCount > 0 ? r.invoiceCount : '—'}</td>
      <td style="text-align:right">${c > 0 ? c : '—'}</td>
    </tr>`;
  }).join('');

  const outstandingRows = (outstanding ?? []).map(p => {
    const gap = num(p.contractValue) - num(p.invoicedAmount);
    return `<tr>
      <td><strong>${h(p.name)}</strong><br><span style="font-size:9px;color:#666">${h(p.projectNumber)}</span></td>
      <td>${h(p.customerName ?? '—')}</td>
      <td>${h(p.employeeName ?? '—')}</td>
      <td>${p.completedAt ? formatDate(p.completedAt) : '—'}</td>
      <td style="text-align:right">${fmtEur(p.contractValue)}</td>
      <td style="text-align:right">${fmtEur(p.invoicedAmount)}</td>
      <td style="text-align:right;color:#dc2626;font-weight:600">${fmtEur(gap)}</td>
    </tr>`;
  }).join('');

  const totalOutstanding = (outstanding ?? []).reduce((s, p) => s + num(p.contractValue) - num(p.invoicedAmount), 0);
  const customerSuffix = customer ? ` — Naročnik: ${h(customer)}` : '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Poročilo projektov ${year}${customer ? ` — ${h(customer)}` : ''}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h2 { font-size: 15px; margin: 0 0 2px 0; }
      h3 { font-size: 12px; margin: 16px 0 6px 0; border-bottom: 2px solid #6366f1; padding-bottom: 3px; color: #4338ca; }
      .meta { font-size: 10px; color: #666; margin-bottom: 14px; }
      .summary { display: flex; gap: 12px; margin-bottom: 16px; }
      .stat { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
      .stat-label { font-size: 9px; color: #888; margin-bottom: 2px; }
      .stat-value { font-size: 14px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px; }
      th { background: #f1f5f9; text-align: left; padding: 3px 6px; border-bottom: 1px solid #cbd5e1; font-size: 10px; }
      td { padding: 2px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      tr:last-child td { border-bottom: none; }
      thead { display: table-header-group; break-after: avoid; }
      tr { break-inside: avoid; }
      th.group-header { border: 1px solid #cbd5e1; border-left: 4px solid #6366f1; padding: 5px 10px; font-size: 11px; }
      table.fixed { table-layout: fixed; }
      table.fixed td { overflow-wrap: anywhere; }
      .page-break { page-break-before: always; }
      tfoot td { background: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1; }
      @media print { button { display: none; } }
    </style>
  </head><body>
    <h2>Poročilo projektov — ${year}${customerSuffix}</h2>
    <div class="meta">Generirano: ${generated} &nbsp;|&nbsp; Odprti projekti: ${activeProjects.length} &nbsp;|&nbsp; Zaključeni ${year}: ${completedThisYear.length}</div>

    <div class="summary">
      <div class="stat"><div class="stat-label">Skupna vrednost (odprti)</div><div class="stat-value">${fmtEur(summary?.totals.totalContractValue)}</div></div>
      <div class="stat"><div class="stat-label">Fakturirano (odprti)</div><div class="stat-value" style="color:#2563eb">${fmtEur(summary?.totals.totalInvoiced)}</div></div>
      <div class="stat"><div class="stat-label">Ostalo za fakturiranje (odprti)</div><div class="stat-value" style="color:#15803d">${fmtEur(summary?.totals.totalRemaining)}</div></div>
      <div class="stat"><div class="stat-label">Prihodki ${year} (fakture)</div><div class="stat-value" style="color:#15803d">${fmtEur(totalRevenue)}</div></div>
      ${totalOutstanding > 0 ? `<div class="stat" style="border-color:#fca5a5">
        <div class="stat-label" style="color:#dc2626">Nefakturirano (zaključeni)</div>
        <div class="stat-value" style="color:#dc2626">${fmtEur(totalOutstanding)}</div>
      </div>` : ''}
    </div>

    <h3>Mesečni prihodki ${year}</h3>
    <table style="width:420px">
      <thead><tr><th>Mesec</th><th style="text-align:right">${year}</th><th style="text-align:right">${year - 1}</th><th style="text-align:right">Faktur</th><th style="text-align:right">Zaključeni</th></tr></thead>
      <tbody>${monthRows}</tbody>
      <tfoot><tr><td><strong>Skupaj</strong></td><td style="text-align:right">${fmtEur(totalRevenue)}</td><td style="text-align:right;color:#666">${fmtEur(totalPrev)}</td><td></td><td></td></tr></tfoot>
    </table>

    <div class="page-break">
      <h3>Odprti projekti (${activeProjects.length})</h3>
      ${groupedSection(activeProjects, false)}
    </div>

    <div class="page-break">
      <h3>Zaključeni projekti ${year} (${completedThisYear.length})</h3>
      ${completedThisYear.length === 0 ? '<p style="color:#888;font-size:11px">Ni zaključenih projektov za to leto.</p>' : groupedSection(completedThisYear, true)}
    </div>

    ${outstandingRows ? `<div class="page-break">
      <h3>Nefakturirani zaključeni projekti</h3>
      <table>
        <thead><tr><th>Delovni nalog</th><th>Naročnik</th><th>Vodja</th><th>Zaključeno</th><th style="text-align:right">Vrednost</th><th style="text-align:right">Fakturirano</th><th style="text-align:right">Nefakturirano</th></tr></thead>
        <tbody>${outstandingRows}</tbody>
        <tfoot><tr><td colspan="6" style="text-align:right">Skupaj nefakturirano</td><td style="text-align:right;color:#dc2626">${fmtEur(totalOutstanding)}</td></tr></tfoot>
      </table>
    </div>` : ''}
  </body></html>`;

  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
