import puppeteer from 'puppeteer';
import ExcelJS from 'exceljs';
import { db } from '../db';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

export async function generateMonthlyReportPdf(year: number, month: number): Promise<Buffer> {
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
  <h2>Monthly Maintenance Report – ${monthLabel}</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Customer</th>
        <th>Facility</th>
        <th>Contract No.</th>
        <th>Completed At</th>
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
    <p>Generated: ${format(new Date(), 'dd.MM.yyyy HH:mm')} | Total: ${completedReviews.length} reviews</p>
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--headless',
    ],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
  await browser.close();

  return Buffer.from(pdfBuffer);
}

export async function generateMonthlyReportXlsx(year: number, month: number): Promise<Buffer> {
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
    { header: 'Customer', key: 'customer', width: 30 },
    { header: 'Facility', key: 'facility', width: 30 },
    { header: 'Contract No.', key: 'contract', width: 20 },
    { header: 'Scheduled Month', key: 'month', width: 18 },
    { header: 'Completed At', key: 'completedAt', width: 20 },
    { header: 'Email Sent', key: 'emailSent', width: 12 },
    { header: 'SMB Saved', key: 'smbSaved', width: 12 },
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
      emailSent: r.emailSent ? 'Yes' : 'No',
      smbSaved: r.smbSaved ? 'Yes' : 'No',
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateYearlyReportPdf(year: number): Promise<Buffer> {
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
    .map(([m, rows]) => `<tr style="background:#e2e8f0;font-weight:bold"><td colspan="5">${m} (${rows.length} reviews)</td></tr>` +
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
  <h2>Yearly Maintenance Report – ${year}</h2>
  <table>
    <thead><tr><th>#</th><th>Customer</th><th>Facility</th><th>Contract No.</th><th>Completed At</th></tr></thead>
    <tbody>${monthRows}</tbody>
  </table>
  <div class="footer"><p>Generated: ${format(new Date(), 'dd.MM.yyyy HH:mm')} | Total: ${completedReviews.length} reviews</p></div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--headless',
    ],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
  await browser.close();

  return Buffer.from(pdfBuffer);
}

export async function generateYearlyReportXlsx(year: number): Promise<Buffer> {
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
    { header: 'Month', key: 'month', width: 12 },
    { header: 'Customer', key: 'customer', width: 30 },
    { header: 'Facility', key: 'facility', width: 30 },
    { header: 'Contract No.', key: 'contract', width: 20 },
    { header: 'Completed At', key: 'completedAt', width: 20 },
    { header: 'Email Sent', key: 'emailSent', width: 12 },
    { header: 'SMB Saved', key: 'smbSaved', width: 12 },
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
      emailSent: r.emailSent ? 'Yes' : 'No',
      smbSaved: r.smbSaved ? 'Yes' : 'No',
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
