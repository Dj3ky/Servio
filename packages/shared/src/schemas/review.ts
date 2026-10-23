import { z } from 'zod';

export const reviewStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed', 'skipped']);

export const skipReviewSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const completeReviewSchema = z.object({
  notes: z.string().max(2000).optional(),
  emailTemplateId: z.string().uuid().optional(),
});

export const reviewSchema = z.object({
  id: z.string().uuid(),
  contractId: z.string().uuid(),
  facilityId: z.string().uuid(),
  scheduledMonth: z.string(),
  status: reviewStatusSchema,
  pdfPath: z.string().nullable(),
  pdfFilename: z.string().nullable(),
  pdfSize: z.number().nullable(),
  completedAt: z.string().datetime().nullable(),
  completedById: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  emailSent: z.boolean(),
  emailBounced: z.boolean(),
  smbSaved: z.boolean(),
  skipReason: z.string().nullable(),
  skippedAt: z.string().datetime().nullable(),
  skippedById: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Review = z.infer<typeof reviewSchema>;
export type CompleteReviewRequest = z.infer<typeof completeReviewSchema>;
export type SkipReviewRequest = z.infer<typeof skipReviewSchema>;
