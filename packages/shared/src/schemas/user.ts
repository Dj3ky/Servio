import { z } from 'zod';

export const userRoleSchema = z.enum(['admin', 'manager', 'accountant', 'technician']);
export const languageSchema = z.enum(['sl', 'en']);

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(100),
  role: userRoleSchema,
  languagePreference: languageSchema.default('sl'),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: userRoleSchema.optional(),
  languagePreference: languageSchema.optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8).max(100),
});

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  languagePreference: languageSchema,
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;
export type CreateUserRequest = z.infer<typeof createUserSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
