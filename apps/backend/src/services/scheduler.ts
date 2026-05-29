import cron from 'node-cron';
import { db } from '../db';
import { reviews } from '../db/schema';
import { format, startOfMonth } from 'date-fns';
import { createAuditLog } from '../utils/audit';

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
  cron.schedule('0 6 1 * *', async () => {
    console.log('[scheduler] Creating pending reviews for current month...');
    try {
      const count = await createPendingReviews();
      console.log(`[scheduler] Created ${count} pending review(s).`);
    } catch (err) {
      console.error('[scheduler] Failed to create reviews:', err);
    }
  });

  console.log('[scheduler] Review scheduler started (runs on the 1st of each month at 06:00).');
}
