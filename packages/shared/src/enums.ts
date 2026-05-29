export const UserRole = {
  admin: 'admin',
  manager: 'manager',
  accountant: 'accountant',
  technician: 'technician',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ReviewStatus = {
  pending: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
  failed: 'failed',
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const InvoiceStatus = {
  pending: 'pending',
  sent_email: 'sent_email',
  sent_post: 'sent_post',
  completed: 'completed',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const ReviewFrequency = {
  monthly: 'monthly',
  biannual: 'biannual',
  quadannual: 'quadannual',
  custom: 'custom',
} as const;
export type ReviewFrequency = (typeof ReviewFrequency)[keyof typeof ReviewFrequency];

export const NotificationType = {
  smb_failed: 'smb_failed',
  email_failed: 'email_failed',
  backup_failed: 'backup_failed',
  review_overdue: 'review_overdue',
  invoice_waiting: 'invoice_waiting',
  review_completed: 'review_completed',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const AuditAction = {
  create: 'create',
  update: 'update',
  delete: 'delete',
  login: 'login',
  logout: 'logout',
  upload: 'upload',
  complete_review: 'complete_review',
  complete_invoice: 'complete_invoice',
  send_email: 'send_email',
  test_smb: 'test_smb',
  test_smtp: 'test_smtp',
  create_backup: 'create_backup',
  restore_backup: 'restore_backup',
  deactivate_user: 'deactivate_user',
  reset_password: 'reset_password',
  send_accounting: 'send_accounting',
  send_invoice_email: 'send_invoice_email',
  reset: 'reset',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const Language = {
  sl: 'sl',
  en: 'en',
} as const;
export type Language = (typeof Language)[keyof typeof Language];
