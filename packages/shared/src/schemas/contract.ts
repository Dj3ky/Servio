import { z } from 'zod';

export const reviewFrequencySchema = z.enum(['monthly', 'biannual', 'quadannual', 'custom']);

export const createContractSchema = z.object({
  facilityId: z.string().uuid(),
  customerId: z.string().uuid(),
  contractNumber: z.string().min(1).max(100),
  assignedTechnicianId: z.string().uuid().nullable().optional(),
  reviewFrequency: reviewFrequencySchema,
  customMonths: z.array(z.number().int().min(1).max(12)).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  emailTemplateId: z.string().uuid().nullable().optional(),
  smbPath: z.string().max(500).optional(),
  valueWithoutVat: z.number().nonnegative().nullable().optional(),
  valueWithoutVatPerYear: z.number().nonnegative().nullable().optional(),
  customerEmail: z.string().email().nullable().optional(),
});

export const updateContractSchema = createContractSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const contractSchema = z.object({
  id: z.string().uuid(),
  facilityId: z.string().uuid(),
  customerId: z.string().uuid(),
  contractNumber: z.string(),
  assignedTechnicianId: z.string().uuid().nullable(),
  reviewFrequency: reviewFrequencySchema,
  customMonths: z.array(z.number()).nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  emailTemplateId: z.string().uuid().nullable(),
  smbPath: z.string().nullable(),
  valueWithoutVat: z.number().nullable(),
  valueWithoutVatPerYear: z.number().nullable(),
  customerEmail: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Contract = z.infer<typeof contractSchema>;
export type CreateContractRequest = z.infer<typeof createContractSchema>;
export type UpdateContractRequest = z.infer<typeof updateContractSchema>;
