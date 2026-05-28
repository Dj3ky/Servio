import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  contactName: z.string().max(200).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const customerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  contactName: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Customer = z.infer<typeof customerSchema>;
export type CreateCustomerRequest = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerRequest = z.infer<typeof updateCustomerSchema>;
