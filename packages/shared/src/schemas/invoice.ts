import { z } from 'zod';

export const invoiceStatusSchema = z.enum(['pending', 'sent_email', 'sent_post', 'completed']);

export const updateInvoiceSchema = z.object({
  status: invoiceStatusSchema,
  invoiceNumber: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  reviewId: z.string().uuid(),
  contractId: z.string().uuid(),
  status: invoiceStatusSchema,
  invoiceNumber: z.string().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  completedById: z.string().uuid().nullable(),
  notes: z.string().nullable(),
});

export type Invoice = z.infer<typeof invoiceSchema>;
export type UpdateInvoiceRequest = z.infer<typeof updateInvoiceSchema>;
