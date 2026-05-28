import { z } from 'zod';

export const publicSettingsSchema = z.object({
  appName: z.string(),
  logoUrl: z.string().nullable(),
  defaultLanguage: z.enum(['sl', 'en']),
});

export const updateGeneralSettingsSchema = z.object({
  appName: z.string().min(1).max(100),
  defaultLanguage: z.enum(['sl', 'en']),
});

export const updateSmtpSettingsSchema = z.object({
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().min(1),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().min(1),
  smtpSecure: z.boolean(),
});

export const updateSmbSettingsSchema = z.object({
  smbHost: z.string().min(1),
  smbShare: z.string().min(1),
  smbUsername: z.string().min(1),
  smbPassword: z.string().optional(),
  smbBasePath: z.string(),
});

export const updateBackupSettingsSchema = z.object({
  backupEnabled: z.boolean(),
  backupSchedule: z.string().min(1),
  backupPath: z.string().min(1),
});

export const settingsSchema = z.object({
  appName: z.string(),
  logoUrl: z.string().nullable(),
  smtpHost: z.string().nullable(),
  smtpPort: z.number().nullable(),
  smtpUser: z.string().nullable(),
  smtpFrom: z.string().nullable(),
  smtpSecure: z.boolean(),
  smbHost: z.string().nullable(),
  smbShare: z.string().nullable(),
  smbUsername: z.string().nullable(),
  smbBasePath: z.string().nullable(),
  defaultLanguage: z.enum(['sl', 'en']),
  backupEnabled: z.boolean(),
  backupSchedule: z.string().nullable(),
  backupPath: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export const testSmtpSchema = z.object({
  recipient: z.string().email(),
});

export type PublicSettings = z.infer<typeof publicSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type UpdateGeneralSettings = z.infer<typeof updateGeneralSettingsSchema>;
export type UpdateSmtpSettings = z.infer<typeof updateSmtpSettingsSchema>;
export type UpdateSmbSettings = z.infer<typeof updateSmbSettingsSchema>;
export type UpdateBackupSettings = z.infer<typeof updateBackupSettingsSchema>;
export type TestSmtpRequest = z.infer<typeof testSmtpSchema>;
