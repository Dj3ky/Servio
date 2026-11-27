import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs/promises';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../../db/schema/users';
import { pmProjects } from './schema';

// "New project" sheet: one A4 page with the company logo, the project's base data and a lined
// notes box holding the project's notes (free lines below them for handwriting),
// sent to the project's manager (the assigned employee).

const i18n = {
  sl: {
    title: 'Nov projekt',
    projectNumber: 'Delovni nalog',
    name: 'Naziv projekta',
    customer: 'Naročnik',
    manager: 'Vodja projekta',
    orderDate: 'Datum naročila',
    startDate: 'Začetek',
    endDate: 'Rok zaključka',
    notes: 'Opombe',
    generated: 'Ustvarjeno',
    emailSubject: 'Nov projekt',
    emailIntro: 'Dodeljen vam je bil nov projekt. Podatki so v priloženem PDF dokumentu.',
  },
  en: {
    title: 'New project',
    projectNumber: 'Work order',
    name: 'Project name',
    customer: 'Customer',
    manager: 'Project manager',
    orderDate: 'Order date',
    startDate: 'Start',
    endDate: 'Deadline',
    notes: 'Notes',
    generated: 'Generated',
    emailSubject: 'New project',
    emailIntro: 'A new project has been assigned to you. The details are in the attached PDF.',
  },
};

export type SheetLang = keyof typeof i18n;
export const sheetText = (lang: string) => i18n[lang as SheetLang] ?? i18n.sl;

export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(v: string | null): string {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-');
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

export async function loadSheetProject(id: string) {
  const [project] = await db.select({
    id: pmProjects.id,
    projectNumber: pmProjects.projectNumber,
    name: pmProjects.name,
    orderDate: pmProjects.orderDate,
    startDate: pmProjects.startDate,
    endDate: pmProjects.endDate,
    customerName: pmProjects.customerName,
    notes: pmProjects.notes,
    employeeName: users.name,
    employeeEmail: users.email,
  })
    .from(pmProjects)
    .leftJoin(users, eq(pmProjects.employeeId, users.id))
    .where(eq(pmProjects.id, id))
    .limit(1);
  return project ?? null;
}

export type SheetProject = NonNullable<Awaited<ReturnType<typeof loadSheetProject>>>;

// The uploaded logo (uploads/logo.png|jpg) as a data URI, so Puppeteer needs no HTTP access
async function logoDataUri(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  const file = path.basename(logoUrl.split('?')[0]);
  if (!/^logo\.(png|jpe?g)$/i.test(file)) return null;
  try {
    const buf = await fs.readFile(path.join(process.cwd(), 'uploads', file));
    const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export function sheetFilename(project: SheetProject): string {
  const safe = `${project.projectNumber}`.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return `projekt-${safe}.pdf`;
}

export async function generateProjectSheetPdf(project: SheetProject, lang: string): Promise<Buffer> {
  const t = sheetText(lang);
  const s = await db.query.settings.findFirst();
  const appName = s?.appName ?? 'Servio';
  const logo = await logoDataUri(s?.logoUrl);

  const rows: Array<[string, string]> = [
    [t.projectNumber, project.projectNumber],
    [t.name, project.name],
    [t.customer, project.customerName || '—'],
    [t.manager, project.employeeName || '—'],
    [t.orderDate, formatDate(project.orderDate)],
    [t.startDate, formatDate(project.startDate)],
    [t.endDate, formatDate(project.endDate)],
  ];

  const now = new Date();
  const generated = `${now.getDate()}. ${now.getMonth() + 1}. ${now.getFullYear()}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12px; }
  .page { height: 257mm; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px;
           padding-bottom: 14px; border-bottom: 2px solid #1e293b; }
  header img { max-height: 64px; max-width: 220px; object-fit: contain; }
  header .company { font-size: 18px; font-weight: bold; }
  header .meta { text-align: right; }
  header .meta .doc { font-size: 22px; font-weight: bold; letter-spacing: .3px; }
  header .meta .num { font-size: 13px; color: #475569; margin-top: 2px; }
  h2 { font-size: 20px; margin: 22px 0 14px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.label { width: 38%; color: #475569; }
  td.value { font-weight: 600; }
  tr:nth-child(even) td { background: #f8fafc; }
  .notes { flex: 1; display: flex; flex-direction: column; margin-top: 22px; }
  .notes .label { font-weight: bold; font-size: 13px; margin-bottom: 6px; }
  .notes .box { flex: 1; border: 1px solid #94a3b8; border-radius: 4px;
                background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #cbd5e1 27px, #cbd5e1 28px);
                background-origin: content-box; padding: 4px 10px;
                font-size: 13px; line-height: 28px; white-space: pre-wrap; overflow-wrap: anywhere; }
  footer { margin-top: 10px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="page">
  <header>
    <div>${logo ? `<img src="${logo}" alt="">` : `<div class="company">${escapeHtml(appName)}</div>`}</div>
    <div class="meta">
      <div class="doc">${escapeHtml(t.title)}</div>
      <div class="num">${escapeHtml(project.projectNumber)}</div>
    </div>
  </header>

  <h2>${escapeHtml(project.name)}</h2>

  <table>
    ${rows.map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td class="value">${escapeHtml(value)}</td></tr>`).join('')}
  </table>

  <div class="notes">
    <div class="label">${escapeHtml(t.notes)}</div>
    <div class="box">${escapeHtml(project.notes?.trim() ?? '')}</div>
  </div>

  <footer>
    <span>${escapeHtml(appName)}</span>
    <span>${escapeHtml(t.generated)}: ${generated}</span>
  </footer>
</div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
