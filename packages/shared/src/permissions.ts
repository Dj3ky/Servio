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
  },
  invoices: {
    access: r('admin', 'manager', 'accountant'),
    reset:  r('admin'),
  },
  projects: {
    access: r('admin', 'manager', 'technician', 'project_manager'),
    manage: r('admin', 'manager', 'project_manager'),
    delete: r('admin'),
  },
  reports: {
    access: r('admin', 'manager', 'accountant'),
  },
  auditLog: {
    access: r('admin', 'manager'),
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
