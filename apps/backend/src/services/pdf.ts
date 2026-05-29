import puppeteer from 'puppeteer';
import ExcelJS from 'exceljs';
import { db } from '../db';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

const i18n: Record<string, Record<string, string>> = {
  en: {
    customer: 'Customer',
    facility: 'Facility',
    contractNo: 'Contract No.',
    completedAt: 'Completed At',
    scheduledMonth: 'Scheduled Month',
    emailSent: 'Email Sent',
    smbSaved: 'SMB Saved',
    yes: 'Yes',
    no: 'No',
    month: 'Month',
    monthlyReport: 'Monthly Maintenance Report',
    yearlyReport: 'Yearly Maintenance Report',
    generated: 'Generated',
    total: 'Total',
    reviews: 'reviews',
  },
  sl: {
    customer: 'Naročnik',
    facility: 'Objekt',
    contractNo: 'Številka pogodbe',
    completedAt: 'Dokončano',
    scheduledMonth: 'Planirani mesec',
    emailSent: 'E-pošta poslana',
    smbSaved: 'SMB shranjeno',
    yes: 'Da',
    no: 'Ne',
    month: 'Mesec',
    monthlyReport: 'Mesečno poročilo vzdrževanj',
    yearlyReport: 'Letno poročilo vzdrževanj',
    generated: 'Generirano',
    total: 'Skupaj',
    reviews: 'pregledov',
  },
};

export async function generateMonthlyReportPdf(year: number, month: number, lang = 'sl'): Promise<Buffer> {
  const t = i18n[lang] ?? i18n.sl;
  const monthStart = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');

  const completedReviews = await db.query.reviews.findMany({
    where: (r, { eq, and, gte, lte }) =>
      and(eq(r.status, 'completed'), gte(r.scheduledMonth, monthStart), lte(r.scheduledMonth, monthEnd)),
    with: {
      contract: { with: { customer: true, facility: true } },
    },
  });

  const settings = await db.query.settings.findFirst();
  const appName = settings?.appName ?? 'Servio';
  const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 16px; color: #555; margin-top: 0; margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1e293b; color: white; padding: 8px 12px; text-align: left; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <h1>${appName}</h1>
  <h2>${t.monthlyReport} – ${monthLabel}</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>${t.customer}</th>
        <th>${t.facility}</th>
        <th>${t.contractNo}</th>
        <th>${t.completedAt}</th>
      </tr>
    </thead>
    <tbody>
      ${completedReviews
        .map(
          (r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${(r as any).contract?.customer?.name ?? '-'}</td>
          <td>${(r as any).contract?.facility?.name ?? '-'}</td>
          <td>${(r as any).contract?.contractNumber ?? '-'}</td>
          <td>${r.completedAt ? format(new Date(r.completedAt), 'dd.MM.yyyy HH:mm') : '-'}</td>
        </tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <div class="footer">
    <p>${t.generated}: ${format(new Date(), 'dd.MM.yyyy HH:mm')} | ${t.total}: ${completedReviews.length} ${t.reviews}</p>
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
  await browser.close();

  return Buffer.from(pdfBuffer);
}

export async function generateMonthlyReportXlsx(year: number, month: number, lang = 'sl'): Promise<Buffer> {
  const t = i18n[lang] ?? i18n.sl;
  const monthStart = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');

  const completedReviews = await db.query.reviews.findMany({
    where: (r, { eq, and, gte, lte }) =>
      and(eq(r.status, 'completed'), gte(r.scheduledMonth, monthStart), lte(r.scheduledMonth, monthEnd)),
    with: {
      contract: { with: { customer: true, facility: true } },
    },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${year}-${String(month).padStart(2, '0')}`);

  sheet.columns = [
    { header: '#', key: 'num', width: 5 },
    { header: t.customer, key: 'customer', width: 30 },
    { header: t.facility, key: 'facility', width: 30 },
    { header: t.contractNo, key: 'contract', width: 20 },
    { header: t.scheduledMonth, key: 'month', width: 18 },
    { header: t.completedAt, key: 'completedAt', width: 20 },
    { header: t.emailSent, key: 'emailSent', width: 12 },
    { header: t.smbSaved, key: 'smbSaved', width: 12 },
  ];

  sheet.getRow(1).font = { bold: true };

  completedReviews.forEach((r, i) => {
    sheet.addRow({
      num: i + 1,
      customer: (r as any).contract?.customer?.name ?? '-',
      facility: (r as any).contract?.facility?.name ?? '-',
      contract: (r as any).contract?.contractNumber ?? '-',
      month: r.scheduledMonth,
      completedAt: r.completedAt ? format(new Date(r.completedAt), 'dd.MM.yyyy HH:mm') : '-',
      emailSent: r.emailSent ? t.yes : t.no,
      smbSaved: r.smbSaved ? t.yes : t.no,
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateYearlyReportPdf(year: number, lang = 'sl'): Promise<Buffer> {
  const t = i18n[lang] ?? i18n.sl;
  const yearStart = format(startOfYear(new Date(year, 0)), 'yyyy-MM-dd');
  const yearEnd = format(endOfYear(new Date(year, 0)), 'yyyy-MM-dd');

  const completedReviews = await db.query.reviews.findMany({
    where: (r, { eq, and, gte, lte }) =>
      and(eq(r.status, 'completed'), gte(r.scheduledMonth, yearStart), lte(r.scheduledMonth, yearEnd)),
    with: { contract: { with: { customer: true, facility: true } } },
    orderBy: (r, { asc }) => [asc(r.scheduledMonth)],
  });

  const settings = await db.query.settings.findFirst();
  const appName = settings?.appName ?? 'Servio';

  const byMonth: Record<string, typeof completedReviews> = {};
  for (const r of completedReviews) {
    const m = r.scheduledMonth.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(r);
  }

  const monthRows = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, rows]) => `<tr style="background:#e2e8f0;font-weight:bold"><td colspan="5">${m} (${rows.length} ${t.reviews})</td></tr>` +
      rows.map((r, i) => `<tr><td>${i + 1}</td><td>${(r as any).contract?.customer?.name ?? '-'}</td><td>${(r as any).contract?.facility?.name ?? '-'}</td><td>${(r as any).contract?.contractNumber ?? '-'}</td><td>${r.completedAt ? format(new Date(r.completedAt), 'dd.MM.yyyy') : '-'}</td></tr>`).join(''))
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 16px; color: #555; margin-top: 0; margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1e293b; color: white; padding: 8px 12px; text-align: left; }
    td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
    .footer { margin-top: 40px; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <h1>${appName}</h1>
  <h2>${t.yearlyReport} – ${year}</h2>
  <table>
    <thead><tr><th>#</th><th>${t.customer}</th><th>${t.facility}</th><th>${t.contractNo}</th><th>${t.completedAt}</th></tr></thead>
    <tbody>${monthRows}</tbody>
  </table>
  <div class="footer"><p>${t.generated}: ${format(new Date(), 'dd.MM.yyyy HH:mm')} | ${t.total}: ${completedReviews.length} ${t.reviews}</p></div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
  await browser.close();

  return Buffer.from(pdfBuffer);
}

export async function generateYearlyReportXlsx(year: number, lang = 'sl'): Promise<Buffer> {
  const t = i18n[lang] ?? i18n.sl;
  const yearStart = format(startOfYear(new Date(year, 0)), 'yyyy-MM-dd');
  const yearEnd = format(endOfYear(new Date(year, 0)), 'yyyy-MM-dd');

  const completedReviews = await db.query.reviews.findMany({
    where: (r, { eq, and, gte, lte }) =>
      and(eq(r.status, 'completed'), gte(r.scheduledMonth, yearStart), lte(r.scheduledMonth, yearEnd)),
    with: { contract: { with: { customer: true, facility: true } } },
    orderBy: (r, { asc }) => [asc(r.scheduledMonth)],
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${year}`);

  sheet.columns = [
    { header: '#', key: 'num', width: 5 },
    { header: t.month, key: 'month', width: 12 },
    { header: t.customer, key: 'customer', width: 30 },
    { header: t.facility, key: 'facility', width: 30 },
    { header: t.contractNo, key: 'contract', width: 20 },
    { header: t.completedAt, key: 'completedAt', width: 20 },
    { header: t.emailSent, key: 'emailSent', width: 12 },
    { header: t.smbSaved, key: 'smbSaved', width: 12 },
  ];

  sheet.getRow(1).font = { bold: true };

  completedReviews.forEach((r, i) => {
    sheet.addRow({
      num: i + 1,
      month: r.scheduledMonth.slice(0, 7),
      customer: (r as any).contract?.customer?.name ?? '-',
      facility: (r as any).contract?.facility?.name ?? '-',
      contract: (r as any).contract?.contractNumber ?? '-',
      completedAt: r.completedAt ? format(new Date(r.completedAt), 'dd.MM.yyyy HH:mm') : '-',
      emailSent: r.emailSent ? t.yes : t.no,
      smbSaved: r.smbSaved ? t.yes : t.no,
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
