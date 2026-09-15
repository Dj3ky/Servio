import { z } from 'zod';

export const clProjectStatuses = ['active', 'completed', 'archived'] as const;

// Changelog Categories
export const createClCategorySchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const updateClCategorySchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  orderIndex: z.number().int().optional(),
});

// Changelog Projects
export const createClProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  nasPath: z.string().optional().nullable(),
});

export const updateClProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(clProjectStatuses).optional(),
  nasPath: z.string().optional().nullable(),
});

// Changelog Entries
export const createClEntrySchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  note: z.string().min(1),
});

export const updateClEntrySchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  note: z.string().min(1).optional(),
});

export type CreateClCategory = z.infer<typeof createClCategorySchema>;
export type UpdateClCategory = z.infer<typeof updateClCategorySchema>;
export type CreateClProject = z.infer<typeof createClProjectSchema>;
export type UpdateClProject = z.infer<typeof updateClProjectSchema>;
export type CreateClEntry = z.infer<typeof createClEntrySchema>;
export type UpdateClEntry = z.infer<typeof updateClEntrySchema>;
