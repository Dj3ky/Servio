import { Router, Request, Response } from 'express';
import { eq, sql, and } from 'drizzle-orm';
import { db } from '../db';
import { reviews, invoices, notifications } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { pdfUpload } from '../middleware/upload';
import { createAuditLog } from '../utils/audit';
import { saveToSmb, buildSmbPath } from '../services/smb';
import { sendMail, renderTemplate } from '../services/email';
import { broadcast } from '../ws';
import { format } from 'date-fns';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const contractId = req.query.contractId as string | undefined;
  const facilityId = req.query.facilityId as string | undefined;
  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string ?? '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string ?? '50', 10)));
  const offset = (page - 1) * limit;

  const data = await db.query.reviews.findMany({
    where: (r, { eq, and }) => {
      const conditions = [];
      if (contractId) conditions.push(eq(r.contractId, contractId));
      if (facilityId) conditions.push(eq(r.facilityId, facilityId));
      if (status) conditions.push(eq(r.status, status as any));
      return conditions.length > 0 ? and(...conditions) : undefined;
    },
    with: {
      contract: { with: { customer: true, facility: true } },
      completedBy: { columns: { id: true, name: true } },
    },
    limit,
    offset,
    orderBy: (r, { desc }) => [desc(r.scheduledMonth)],
  });

  const whereClause = and(
    contractId ? eq(reviews.contractId, contractId) : undefined,
    facilityId ? eq(reviews.facilityId, facilityId) : undefined,
    status ? eq(reviews.status, status as any) : undefined,
  );

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(reviews).where(whereClause);

  res.json({ data, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

router.get('/pending', async (_req: Request, res: Response): Promise<void> => {
  const data = await db.query.reviews.findMany({
    where: (r, { eq }) => eq(r.status, 'pending'),
    with: {
      contract: { with: { customer: true, facility: true } },
    },
    orderBy: (r, { asc }) => [asc(r.scheduledMonth)],
  });
  res.json(data);
});

router.post(
  '/',
  requireRole('admin', 'manager', 'technician'),
  async (req: Request, res: Response): Promise<void> => {
    const { contractId, scheduledMonth } = req.body as { contractId?: string; scheduledMonth?: string };

    if (!contractId || !scheduledMonth || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledMonth)) {
      res.status(400).json({ error: 'errors.validation' });
      return;
    }

    const contract = await db.query.contracts.findFirst({
      where: (c, { eq }) => eq(c.id, contractId),
    });
    if (!contract) { res.status(404).json({ error: 'errors.not_found' }); return; }

    const existing = await db.query.reviews.findFirst({
      where: (r, { eq, and }) => and(eq(r.contractId, contractId), eq(r.scheduledMonth, scheduledMonth)),
    });
    if (existing) { res.json(existing); return; }

    const [review] = await db.insert(reviews).values({
      contractId,
      facilityId: contract.facilityId,
      scheduledMonth,
      status: 'pending',
      emailSent: false,
      smbSaved: false,
    }).returning();

    await createAuditLog({
      userId: req.auth!.userId,
      userEmail: req.auth!.email,
      action: 'create',
      entityType: 'review',
      entityId: review.id,
      payload: { contractId, scheduledMonth },
      req,
    });

    res.status(201).json(review);
  },
);

router.post(
  '/:id/upload',
  requireRole('admin', 'manager', 'technician'),
  pdfUpload.single('pdf'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'errors.file_required' });
      return;
    }

    const review = await db.query.reviews.findFirst({
      where: (r, { eq }) => eq(r.id, req.params.id),
      with: {
        contract: { with: { customer: true, facility: true, emailTemplate: true } },
      },
    });

    if (!review) { res.status(404).json({ error: 'errors.not_found' }); return; }
    if (review.status === 'completed') { res.status(409).json({ error: 'errors.review_already_completed' }); return; }

    const contract = (review as any).contract;
    const facility = contract?.facility;
    const customer = contract?.customer;

    const scheduledDate = new Date(review.scheduledMonth);
    const year = scheduledDate.getFullYear();
    const yearMonth = format(scheduledDate, 'yyyy-MM');
    const filename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const settings = await db.query.settings.findFirst();
    const basePath = settings?.smbBasePath ?? '';
    const smbPath = buildSmbPath(basePath, year, contract.contractNumber, yearMonth, filename);

    let smbSaved = false;
    let smbError: string | null = null;

    try {
      await saveToSmb(smbPath, req.file.buffer);
      smbSaved = true;
    } catch (err) {
      smbError = err instanceof Error ? err.message : String(err);
      await db.insert(notifications).values({
        type: 'smb_failed',
        title: 'SMB Save Failed',
        message: `Failed to save PDF for ${facility?.name ?? 'unknown'}: ${smbError}`,
        entityType: 'review',
        entityId: review.id,
      });
      broadcast('notification_created', { id: '', type: 'smb_failed', title: 'SMB Save Failed', message: smbError });
    }

    if (!smbSaved) {
      await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'upload', entityType: 'review', entityId: review.id, payload: { error: smbError }, req });
      res.status(500).json({ error: 'errors.smb_failed', details: smbError });
      return;
    }

    let emailSent = false;
    let emailError: string | null = null;
    const customerEmail = contract.customerEmail ?? customer?.email;

    if (customerEmail) {
      try {
        const template = contract.emailTemplate;
        const appName = settings?.appName ?? 'Servio';
        const monthLabel = format(scheduledDate, 'MMMM yyyy');

        const subject = renderTemplate(
          template?.subject ?? `Maintenance Report – ${facility?.name} – ${monthLabel}`,
          { customer_name: customer?.name ?? '', facility_name: facility?.name ?? '', month: format(scheduledDate, 'MMMM'), year: String(year), contract_number: contract.contractNumber, app_name: appName },
        );
        const body = renderTemplate(
          template?.body ?? `Dear ${customer?.name},\n\nPlease find attached the maintenance report.\n\nBest regards,\n${appName}`,
          { customer_name: customer?.name ?? '', facility_name: facility?.name ?? '', month: format(scheduledDate, 'MMMM'), year: String(year), contract_number: contract.contractNumber, app_name: appName },
        );

        await sendMail({
          to: customerEmail,
          subject,
          html: body.replace(/\n/g, '<br>'),
          attachments: [{ filename, content: req.file!.buffer, contentType: 'application/pdf' }],
        });
        emailSent = true;
        await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'send_email', entityType: 'review', entityId: review.id, payload: { to: customerEmail }, req });
      } catch (err) {
        emailError = err instanceof Error ? err.message : String(err);
        await db.insert(notifications).values({
          type: 'email_failed',
          title: 'Email Send Failed',
          message: `Failed to send email for ${facility?.name ?? 'unknown'}: ${emailError}`,
          entityType: 'review',
          entityId: review.id,
        });
        broadcast('notification_created', { id: '', type: 'email_failed', title: 'Email Send Failed', message: emailError });
      }
    }

    const [updatedReview] = await db
      .update(reviews)
      .set({
        status: 'completed',
        pdfPath: smbPath,
        pdfFilename: filename,
        pdfSize: req.file.size,
        completedAt: new Date(),
        completedById: req.auth!.userId,
        emailSent,
        smbSaved,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, review.id))
      .returning();

    const [invoice] = await db
      .insert(invoices)
      .values({ reviewId: review.id, contractId: review.contractId, status: 'pending' })
      .returning();

    await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'complete_review', entityType: 'review', entityId: review.id, payload: { smbPath, emailSent, emailError }, req });

    broadcast('review_completed', { reviewId: review.id, contractId: review.contractId, facilityId: review.facilityId, facilityName: facility?.name ?? '', contractNumber: contract.contractNumber });
    broadcast('invoice_created', { invoiceId: invoice.id, contractId: invoice.contractId, facilityName: facility?.name ?? '', contractNumber: contract.contractNumber });
    broadcast('dashboard_refresh', {});

    await db.insert(notifications).values({
      type: 'review_completed',
      title: 'Review Completed',
      message: `Review for ${facility?.name ?? 'unknown'} completed successfully.`,
      entityType: 'review',
      entityId: review.id,
    });

    res.json({ review: updatedReview, invoice, emailSent, smbSaved, emailError });
  },
);

export default router;
