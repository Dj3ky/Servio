import { Router, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { updateInvoiceSchema } from '@servio/shared';
import { db } from '../db';
import { invoices } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { createAuditLog } from '../utils/audit';
import { broadcast } from '../ws';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { readFromSmb } from '../services/smb';
import { sendMail, renderTemplate } from '../services/email';
import { documentUpload } from '../middleware/upload';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin', 'manager', 'accountant'));

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const status = req.query.status as string | undefined;
  const contractId = req.query.contractId as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;

  const data = await db.query.invoices.findMany({
    where: (inv, { eq, and }) => {
      const conditions = [];
      if (status) conditions.push(eq(inv.status, status as any));
      if (contractId) conditions.push(eq(inv.contractId, contractId));
      return conditions.length > 0 ? and(...conditions) : undefined;
    },
    with: {
      review: { with: { contract: { with: { customer: true, facility: true } } } },
      completedBy: { columns: { id: true, name: true } },
    },
    limit,
    offset,
    orderBy: (inv, { desc }) => [desc(inv.createdAt)],
  });

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(invoices).where(
    status ? eq(invoices.status, status as any) : undefined,
  );

  res.json({ data, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

router.get('/pending', async (_req: Request, res: Response): Promise<void> => {
  const data = await db.query.invoices.findMany({
    where: (inv, { ne }) => ne(inv.status, 'completed'),
    with: {
      review: { with: { contract: { with: { customer: true, facility: true } } } },
    },
    orderBy: (inv, { asc }) => [asc(inv.createdAt)],
  });
  res.json({ data });
});

router.post('/:id/send-email', documentUpload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'errors.file_required' }); return; }

  const invoice = await db.query.invoices.findFirst({
    where: (inv, { eq }) => eq(inv.id, req.params.id),
    with: { review: { with: { contract: { with: { facility: true, customer: true } } } } },
  });
  if (!invoice) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const review = (invoice as any).review;
  const contract = review?.contract;
  const facility = contract?.facility;
  const customer = contract?.customer;

  const recipientEmail = contract?.invoiceEmail;
  if (!recipientEmail) { res.status(400).json({ error: 'errors.no_email_configured' }); return; }

  const s = await db.query.settings.findFirst();
  const scheduledMonth = review?.scheduledMonth?.slice(0, 7) ?? '';
  const invoiceNumberInput = (req.body as any).invoiceNumber?.trim();

  const vars: Record<string, string> = {
    customer_name: customer?.name ?? '',
    facility_name: facility?.name ?? '',
    month: scheduledMonth,
    year: scheduledMonth.slice(0, 4),
    contract_number: contract?.contractNumber ?? '',
    invoice_number: invoiceNumberInput ?? invoice.invoiceNumber ?? '',
    app_name: s?.appName ?? 'Servio',
  };

  const subject = renderTemplate(
    (req.body as any).emailSubject?.trim() || `Invoice – ${facility?.name ?? ''} – ${scheduledMonth}`,
    vars,
  );
  const html = renderTemplate(
    (req.body as any).emailBody?.trim() || `Dear ${customer?.name ?? ''},\n\nPlease find attached your invoice.\n\nBest regards,\n${s?.appName ?? 'Servio'}`,
    vars,
  ).replace(/\n/g, '<br>');

  const filename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_') || 'invoice.pdf';
  const tmpFile = path.join(os.tmpdir(), `servio-inv-${Date.now()}-${filename}`);

  try {
    await fs.writeFile(tmpFile, req.file.buffer);
    await sendMail({
      to: recipientEmail,
      subject,
      html,
      attachments: [{ filename, path: tmpFile, contentType: req.file.mimetype || 'application/pdf' }],
    });
  } catch (err) {
    res.status(500).json({ error: 'errors.email_failed', details: String(err) });
    return;
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }

  const statusUpdate: Partial<typeof invoices.$inferInsert> = { status: 'sent_email' };
  if (invoiceNumberInput) statusUpdate.invoiceNumber = invoiceNumberInput;
  await db.update(invoices).set(statusUpdate).where(eq(invoices.id, invoice.id));

  await createAuditLog({
    userId: req.auth!.userId, userEmail: req.auth!.email,
    action: 'send_invoice_email', entityType: 'invoice', entityId: invoice.id,
    payload: { to: recipientEmail, invoiceNumber: invoiceNumberInput }, req,
  });

  broadcast('invoice_updated', { invoiceId: invoice.id, contractId: invoice.contractId, status: 'sent_email' });
  broadcast('dashboard_refresh', {});

  res.json({ success: true });
});

router.post('/:id/send-accounting', async (req: Request, res: Response): Promise<void> => {
  const invoice = await db.query.invoices.findFirst({
    where: (inv, { eq }) => eq(inv.id, req.params.id),
    with: {
      review: {
        with: { contract: { with: { facility: true, customer: true } } },
      },
    },
  });

  if (!invoice) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const s = await db.query.settings.findFirst();
  const accountingEmail = s?.accountingEmail;
  if (!accountingEmail) { res.status(400).json({ error: 'errors.accounting_email_not_configured' }); return; }

  const review = (invoice as any).review;
  if (!review?.pdfPath) { res.status(400).json({ error: 'errors.no_document' }); return; }

  const contract = review.contract;
  const facility = contract?.facility;
  const customer = contract?.customer;

  const invoiceNumberInput = req.body.invoiceNumber?.trim();
  if (!invoiceNumberInput) { res.status(400).json({ error: 'errors.validation', details: { invoiceNumber: ['Invoice number is required'] } }); return; }

  const scheduledMonth = review.scheduledMonth?.slice(0, 7) ?? '';
  const year = scheduledMonth.slice(0, 4);

  const templateVars: Record<string, string> = {
    customer_name: customer?.name ?? '',
    facility_name: facility?.name ?? '',
    month: scheduledMonth,
    year,
    contract_number: contract?.contractNumber ?? '',
    invoice_number: invoiceNumberInput,
    app_name: s?.appName ?? 'Servio',
  };

  const rawSubject: string = req.body.emailSubject?.trim()
    || `Invoice – ${facility?.name ?? ''} – ${scheduledMonth}`;

  const rawBody: string = req.body.emailBody?.trim()
    || `Invoice for <strong>${customer?.name ?? ''}</strong>, ${facility?.name ?? ''}, ${scheduledMonth}.<br>Contract: ${contract?.contractNumber ?? ''}`;

  const subject = renderTemplate(rawSubject, templateVars);
  const html = renderTemplate(rawBody, templateVars);

  try {
    const buffer = await readFromSmb(review.pdfPath);
    const filename = review.pdfFilename ?? 'document.pdf';

    await sendMail({
      to: accountingEmail,
      subject,
      html,
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
    });

    await db.update(invoices)
      .set({ invoiceNumber: invoiceNumberInput })
      .where(eq(invoices.id, invoice.id));

    await createAuditLog({
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: 'send_accounting',
      entityType: 'invoice',
      entityId: invoice.id,
      payload: { to: accountingEmail, invoiceNumber: invoiceNumberInput },
      req,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'errors.smb_failed', details: String(err) });
  }
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = updateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const updates: Partial<typeof invoices.$inferInsert> = {
    status: parsed.data.status,
    notes: parsed.data.notes ?? null,
  };

  if (parsed.data.invoiceNumber !== undefined) updates.invoiceNumber = parsed.data.invoiceNumber;

  if (parsed.data.status === 'completed') {
    updates.completedAt = new Date();
    updates.completedById = req.auth!.userId;
  }

  const [updated] = await db.update(invoices).set(updates).where(eq(invoices.id, req.params.id)).returning();
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }

  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'complete_invoice', entityType: 'invoice', entityId: req.params.id, payload: { status: parsed.data.status }, req });

  broadcast('invoice_updated', { invoiceId: updated.id, contractId: updated.contractId, status: updated.status });
  broadcast('dashboard_refresh', {});

  res.json(updated);
});

export default router;
