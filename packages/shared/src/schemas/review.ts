import { z } from 'zod';

export const reviewStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed']);

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
  smbSaved: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Review = z.infer<typeof reviewSchema>;
export type CompleteReviewRequest = z.infer<typeof completeReviewSchema>;
