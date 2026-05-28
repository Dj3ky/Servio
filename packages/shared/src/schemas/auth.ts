import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    role: z.enum(['admin', 'manager', 'accountant', 'technician']),
    languagePreference: z.enum(['sl', 'en']),
  }),
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
