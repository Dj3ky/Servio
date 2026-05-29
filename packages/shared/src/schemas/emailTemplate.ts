import { z } from 'zod';

export const emailTemplateTypeEnum = z.enum(['review', 'accounting', 'invoice']);

export const createEmailTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  language: z.enum(['sl', 'en']),
  isDefault: z.boolean().default(false),
  templateType: emailTemplateTypeEnum.default('review'),
});

export const updateEmailTemplateSchema = createEmailTemplateSchema.partial();

export const emailTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  subject: z.string(),
  body: z.string(),
  language: z.enum(['sl', 'en']),
  isDefault: z.boolean(),
  templateType: emailTemplateTypeEnum,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type EmailTemplate = z.infer<typeof emailTemplateSchema>;
export type CreateEmailTemplateRequest = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateRequest = z.infer<typeof updateEmailTemplateSchema>;
