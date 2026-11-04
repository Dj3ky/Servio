import type { UserRole } from './enums';

const r = (...roles: UserRole[]): UserRole[] => roles;

export const permissions = {
  users: {
    view:          r('admin', 'manager'),
    manage:        r('admin'),
    resetPassword: r('admin'),
  },
  records: {
    manage: r('admin', 'manager'),
    delete: r('admin'),
  },
  contractTimeline: {
    access: r('admin', 'manager', 'accountant', 'technician', 'project_manager'),
  },
  reviews: {
    upload:   r('admin', 'manager', 'technician', 'project_manager'),
    backfill: r('admin'),
    skip:     r('admin', 'manager'),
  },
  invoices: {
    access: r('admin', 'manager', 'accountant'),
    reset:  r('admin'),
  },
  projects: {
    access: r('admin', 'manager', 'technician', 'project_manager'),
    manage: r('admin', 'manager', 'project_manager'),
    delete: r('admin'),
    labourCost: r('admin'),
  },
  changelog: {
    access: r('admin', 'manager', 'accountant', 'technician', 'project_manager'),
    manage: r('admin'),
  },
  reports: {
    access: r('admin', 'manager', 'accountant'),
  },
  auditLog: {
    access: r('admin', 'manager'),
  },
  // Who sees the shared system notifications (personal ones, like tasks, always go to their user)
  notifications: {
    system:       r('admin'),                          // SMB save / backup failures
    email:        r('admin', 'manager'),               // review email send failures and bounces
    invoiceEmail: r('admin', 'manager', 'accountant'), // bounced invoice emails
  },
  settings: {
    view:            r('admin', 'manager'),
    manage:          r('admin'),
    manageTemplates: r('admin', 'manager'),
    deleteTemplates: r('admin'),
    backup:          r('admin'),
  },
  smb:       { access: r('admin') },
  scheduler: { access: r('admin') },
  update:    { access: r('admin') },
  license:   { access: r('admin') },
};
