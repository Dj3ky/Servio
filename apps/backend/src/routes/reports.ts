import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { generateMonthlyReportPdf, generateMonthlyReportXlsx, generateYearlyReportPdf, generateYearlyReportXlsx } from '../services/pdf';
import { createAuditLog } from '../utils/audit';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin', 'manager', 'accountant'));

router.get('/monthly/pdf', async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string, 10);
  const month = parseInt(req.query.month as string, 10);

  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ error: 'errors.invalid_params' });
    return;
  }

  const buffer = await generateMonthlyReportPdf(year, month);
  const filename = `report_${year}_${String(month).padStart(2, '0')}.pdf`;

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'report', payload: { year, month, format: 'pdf' }, req });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

router.get('/monthly/xlsx', async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string, 10);
  const month = parseInt(req.query.month as string, 10);

  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ error: 'errors.invalid_params' });
    return;
  }

  const buffer = await generateMonthlyReportXlsx(year, month);
  const filename = `report_${year}_${String(month).padStart(2, '0')}.xlsx`;

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'report', payload: { year, month, format: 'xlsx' }, req });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

router.get('/yearly/pdf', async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string, 10);

  if (!year || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'errors.invalid_params' });
    return;
  }

  const buffer = await generateYearlyReportPdf(year);
  const filename = `report_${year}.pdf`;

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'report', payload: { year, format: 'pdf', type: 'yearly' }, req });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

router.get('/yearly/xlsx', async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string, 10);

  if (!year || year < 2000 || year > 2100) {
    res.status(400).json({ error: 'errors.invalid_params' });
    return;
  }

  const buffer = await generateYearlyReportXlsx(year);
  const filename = `report_${year}.xlsx`;

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'create', entityType: 'report', payload: { year, format: 'xlsx', type: 'yearly' }, req });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

export default router;
