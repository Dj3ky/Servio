import { z } from 'zod';

export const createFacilitySchema = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateFacilitySchema = createFacilitySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const facilitySchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Facility = z.infer<typeof facilitySchema>;
export type CreateFacilityRequest = z.infer<typeof createFacilitySchema>;
export type UpdateFacilityRequest = z.infer<typeof updateFacilitySchema>;
