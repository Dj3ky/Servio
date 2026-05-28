import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  appName: text('app_name').notNull().default('Servio'),
  logoUrl: text('logo_url'),
  smtpHost: text('smtp_host'),
  smtpPort: integer('smtp_port').default(587),
  smtpUser: text('smtp_user'),
  smtpPassEncrypted: text('smtp_pass_encrypted'),
  smtpFrom: text('smtp_from'),
  smtpSecure: boolean('smtp_secure').notNull().default(false),
  smbHost: text('smb_host'),
  smbShare: text('smb_share'),
  smbUsername: text('smb_username'),
  smbPassEncrypted: text('smb_pass_encrypted'),
  smbBasePath: text('smb_base_path').notNull().default(''),
  defaultLanguage: text('default_language').notNull().default('sl'),
  backupEnabled: boolean('backup_enabled').notNull().default(false),
  backupSchedule: text('backup_schedule').default('0 2 * * *'),
  backupPath: text('backup_path'),
  accountingEmail: text('accounting_email'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type DbSettings = typeof settings.$inferSelect;
export type DbNewSettings = typeof settings.$inferInsert;
