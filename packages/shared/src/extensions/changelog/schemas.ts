import { z } from 'zod';

export const clEntryCategories = ['electrical_schema', 'plc_program', 'mechanical', 'general', 'other'] as const;
export const clProjectStatuses = ['active', 'completed', 'archived'] as const;

// Changelog Projects
export const createClProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});

export const updateClProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(clProjectStatuses).optional(),
});

// Changelog Entries
export const createClEntrySchema = z.object({
  category: z.enum(clEntryCategories),
  note: z.string().min(1),
});

export const updateClEntrySchema = z.object({
  category: z.enum(clEntryCategories).optional(),
  note: z.string().min(1).optional(),
});

export type CreateClProject = z.infer<typeof createClProjectSchema>;
export type UpdateClProject = z.infer<typeof updateClProjectSchema>;
export type CreateClEntry = z.infer<typeof createClEntrySchema>;
export type UpdateClEntry = z.infer<typeof updateClEntrySchema>;
