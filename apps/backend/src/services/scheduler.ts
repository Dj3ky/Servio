import cron from 'node-cron';
import { db } from '../db';
import { reviews } from '../db/schema';
import { format, startOfMonth } from 'date-fns';
import { createAuditLog } from '../utils/audit';
import { sendDigestEmail, sendEscalationAlerts } from './email';

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

    await db.insert(reviews).values({
      contractId: contract.id,
      facilityId: contract.facilityId,
      scheduledMonth,
      status: 'pending',
      emailSent: false,
      smbSaved: false,
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

  console.log('[scheduler] Review scheduler started (runs on the 1st of each month at 06:00).');
  console.log('[scheduler] Digest email: daily at 07:00 (weekly on Mondays when set to weekly).');
  console.log('[scheduler] Escalation check: daily at 08:00.');
}
