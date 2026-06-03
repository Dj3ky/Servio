import cron from 'node-cron';
import { db } from '../db';
import { reviews, invoices } from '../db/schema';
import { format, startOfMonth, subMonths } from 'date-fns';
import { createAuditLog } from '../utils/audit';
import { sendDigestEmail, sendEscalationAlerts } from './email';
import { getInboxStatus, detectAndProcessBounces } from './imap';
import { broadcast } from '../ws';

const BIANNUAL_MONTHS = [1, 7];
const QUADANNUAL_MONTHS = [1, 4, 7, 10];

export function shouldCreateReview(frequency: string, customMonths: number[] | null, month: number): boolean {
  switch (frequency) {
    case 'monthly':
      return true;
    case 'biannual':
      return BIANNUAL_MONTHS.includes(month);
    case 'quadannual':
      return QUADANNUAL_MONTHS.includes(month);
    case 'custom':
      return customMonths?.includes(month) ?? false;
    default:
      return false;
  }
}

export async function createPendingReviews(targetDate?: Date): Promise<number> {
  const now = targetDate ?? new Date();
  const currentMonth = now.getMonth() + 1;
  const scheduledMonth = format(startOfMonth(now), 'yyyy-MM-dd');

  const activeContracts = await db.query.contracts.findMany({
    where: (c, { eq }) => eq(c.isActive, true),
  });

  let created = 0;

  for (const contract of activeContracts) {
    if (!shouldCreateReview(contract.reviewFrequency, contract.customMonths, currentMonth)) {
      continue;
    }

    const existing = await db.query.reviews.findFirst({
      where: (r, { eq, and }) =>
        and(eq(r.contractId, contract.id), eq(r.scheduledMonth, scheduledMonth)),
    });

    if (existing) continue;

    const [review] = await db.insert(reviews).values({
      contractId: contract.id,
      facilityId: contract.facilityId,
      scheduledMonth,
      status: 'pending',
      emailSent: false,
      smbSaved: false,
    }).returning();

    await db.insert(invoices).values({
      reviewId: review.id,
      contractId: contract.id,
      status: 'pending',
      emailBounced: false,
    });

    created++;
  }

  if (created > 0) {
    await createAuditLog({
      action: 'create',
      entityType: 'review',
      payload: { scheduledMonth, created },
    });
  }

  return created;
}

export async function backfillMissingReviews(monthsBack = 12): Promise<number> {
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const cutoff = format(startOfMonth(subMonths(now, monthsBack)), 'yyyy-MM-dd');

  const [activeContracts, existingReviews] = await Promise.all([
    db.query.contracts.findMany({
      where: (c, { eq }) => eq(c.isActive, true),
    }),
    db.query.reviews.findMany({
      where: (r, { and, gte, lt }) => and(gte(r.scheduledMonth, cutoff), lt(r.scheduledMonth, monthStart)),
      columns: { contractId: true, scheduledMonth: true },
    }),
  ]);

  const existingSet = new Set(existingReviews.map((r) => `${r.contractId}:${r.scheduledMonth}`));

  let created = 0;

  for (const contract of activeContracts) {
    const contractStartMonth = format(startOfMonth(new Date(contract.startDate + 'T00:00:00')), 'yyyy-MM-dd');
    const contractEndMonth = contract.endDate
      ? format(startOfMonth(new Date(contract.endDate + 'T00:00:00')), 'yyyy-MM-dd')
      : null;

    for (let i = 1; i <= monthsBack; i++) {
      const d = subMonths(startOfMonth(now), i);
      const scheduledMonth = format(d, 'yyyy-MM-dd');

      if (scheduledMonth < contractStartMonth) continue;
      if (contractEndMonth && scheduledMonth > contractEndMonth) continue;

      const month = d.getMonth() + 1;
      if (!shouldCreateReview(contract.reviewFrequency, contract.customMonths, month)) continue;

      if (existingSet.has(`${contract.id}:${scheduledMonth}`)) continue;

      const [review] = await db.insert(reviews).values({
        contractId: contract.id,
        facilityId: contract.facilityId,
        scheduledMonth,
        status: 'pending',
        emailSent: false,
        smbSaved: false,
      }).returning();

      await db.insert(invoices).values({
        reviewId: review.id,
        contractId: contract.id,
        status: 'pending',
      });

      existingSet.add(`${contract.id}:${scheduledMonth}`);
      created++;
    }
  }

  if (created > 0) {
    await createAuditLog({
      action: 'backfill',
      entityType: 'review',
      payload: { created, monthsBack },
    });
  }

  return created;
}

export function startScheduler(): void {
  // Monthly review creation — 1st of each month at 06:00
  cron.schedule('0 6 1 * *', async () => {
    console.log('[scheduler] Creating pending reviews for current month...');
    try {
      const count = await createPendingReviews();
      console.log(`[scheduler] Created ${count} pending review(s).`);
    } catch (err) {
      console.error('[scheduler] Failed to create reviews:', err);
    }
  });

  // Backfill missing reviews + ensure current month reviews exist — daily at 06:30
  cron.schedule('30 6 * * *', async () => {
    try {
      const current = await createPendingReviews();
      if (current > 0) console.log(`[scheduler] Created ${current} review(s) for current month.`);
      const backfilled = await backfillMissingReviews();
      if (backfilled > 0) console.log(`[scheduler] Backfilled ${backfilled} missing review(s).`);
    } catch (err) {
      console.error('[scheduler] Backfill failed:', err);
    }
  });

  // Digest email — daily at 07:00
  cron.schedule('0 7 * * *', async () => {
    try {
      const s = await db.query.settings.findFirst();
      if (!s?.digestEnabled) return;
      if (s.digestFrequency === 'weekly') {
        // Only send on Mondays (day 1)
        if (new Date().getDay() !== 1) return;
      }
      await sendDigestEmail();
      console.log('[scheduler] Digest email sent.');
    } catch (err) {
      console.error('[scheduler] Digest email failed:', err);
    }
  });

  // Escalation check — daily at 08:00
  cron.schedule('0 8 * * *', async () => {
    try {
      await sendEscalationAlerts();
    } catch (err) {
      console.error('[scheduler] Escalation check failed:', err);
    }
  });

  // Inbox poll + bounce detection — every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await getInboxStatus();
      if (result) broadcast('inbox_count', { unreadCount: result.unreadCount });
    } catch (err) {
      console.error('[scheduler] Inbox poll failed:', err);
    }

    try {
      const bounced = await detectAndProcessBounces();
      if (bounced.length > 0) {
        broadcast('dashboard_refresh', {});
        console.log(`[scheduler] Marked ${bounced.length} review(s) as email bounced: ${bounced.join(', ')}`);
      }
    } catch (err) {
      console.error('[scheduler] Bounce detection failed:', err);
    }
  });

  console.log('[scheduler] Review scheduler started (runs on the 1st of each month at 06:00).');
  console.log('[scheduler] Backfill check: daily at 06:30.');
  console.log('[scheduler] Digest email: daily at 07:00 (weekly on Mondays when set to weekly).');
  console.log('[scheduler] Escalation check: daily at 08:00.');
  console.log('[scheduler] Inbox poll: every 5 minutes.');
}
