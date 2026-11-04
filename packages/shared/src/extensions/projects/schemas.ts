import { z } from 'zod';

// PM Customers
export const createPmCustomerSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  contactName: z.string().optional(),
});

export const updatePmCustomerSchema = createPmCustomerSchema.partial();

// PM Facilities
export const createPmFacilitySchema = z.object({
  pmCustomerId: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export const updatePmFacilitySchema = createPmFacilitySchema.partial();

// PM Projects
export const createPmProjectSchema = z.object({
  projectNumber: z.string().min(1),
  name: z.string().min(1),
  orderDate: z.string().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  customerName: z.string().optional().nullable(),
  facilityName: z.string().optional().nullable(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  status: z.enum(['active', 'on_hold', 'completed']).default('active'),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  contractValue: z.string().optional().nullable(),
  invoicedAmount: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updatePmProjectSchema = createPmProjectSchema.partial();

// PM Project Phases
export const createPmPhaseSchema = z.object({
  name: z.string().min(1),
  orderIndex: z.number().int().default(0),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
});

export const updatePmPhaseSchema = createPmPhaseSchema.partial();

// PM Project Tasks
export const createPmTaskSchema = z.object({
  title: z.string().trim().min(1),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

export const updatePmTaskSchema = createPmTaskSchema.partial().extend({
  status: z.enum(['open', 'done']).optional(),
});

// Task changes made inside a meeting form, applied together with the meeting save
const pmMeetingTaskChangesSchema = z.object({
  create: z.array(createPmTaskSchema.extend({ projectId: z.string().uuid() })).default([]),
  complete: z.array(z.string().uuid()).default([]),
  reopen: z.array(z.string().uuid()).default([]),
});

// PM Weekly Meetings
export const createPmMeetingSchema = z.object({
  meetingDate: z.string().min(1),
  notes: z.string().optional().nullable(),
  entries: z.array(z.object({
    projectId: z.string().uuid(),
    entryStatus: z.enum(['active', 'on_hold', 'completed']).default('active'),
    notes: z.string().optional().nullable(),
  })),
  tasks: pmMeetingTaskChangesSchema.optional(),
});

export const updatePmMeetingSchema = z.object({
  notes: z.string().optional().nullable(),
  entries: z.array(z.object({
    projectId: z.string().uuid(),
    entryStatus: z.enum(['active', 'on_hold', 'completed']),
    notes: z.string().optional().nullable(),
  })).optional(),
  tasks: pmMeetingTaskChangesSchema.optional(),
});

// PM Project Invoices
export const createPmInvoiceSchema = z.object({
  direction: z.enum(['issued', 'received']).default('issued'),
  invoiceDate: z.string().min(1),
  amount: z.string().min(1),
  notes: z.string().optional().nullable(),
});

export const updatePmInvoiceSchema = createPmInvoiceSchema.omit({ direction: true }).partial();

// PM Employee group order (Projects page)
export const updatePmEmployeeOrderSchema = z.object({
  userIds: z.array(z.string().uuid()),
});

// Swap the position of two projects (Projects page)
export const swapPmProjectOrderSchema = z.object({
  projectId: z.string().uuid(),
  otherProjectId: z.string().uuid(),
});

// Extension config
export const updateExtensionConfigSchema = z.object({
  extension: z.string().min(1),
  enabled: z.boolean(),
});

// Kimai connection (settings and connection test); the token is optional so a saved one can be kept
export const kimaiSettingsSchema = z.object({
  url: z.string().trim().url()
    .refine((v) => v.toLowerCase().startsWith('https://'))
    .transform((v) => v.replace(/\/+$/, '')),
  token: z.string().trim().optional(),
});

export const kimaiCostModeSchema = z.object({
  ratesAreCosts: z.boolean(),
});

export const kimaiLinkSchema = z.object({
  kimaiProjectId: z.number().int().positive(),
  // Confirms taking over a Kimai project already linked to another Servio project
  moveExisting: z.boolean().optional(),
});

// Create a project in Kimai under an existing customer or a new one
export const kimaiCreateSchema = z.union([
  z.object({ customerId: z.number().int().positive() }),
  z.object({ newCustomerName: z.string().trim().min(1) }),
]);

// Name as Kimai will accept it: without the characters it rejects and within its 150 character limit
export function kimaiSafeName(value: string): string {
  return value.replace(/[<>"=]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150).trim();
}

export type CreatePmCustomer = z.infer<typeof createPmCustomerSchema>;
export type UpdatePmCustomer = z.infer<typeof updatePmCustomerSchema>;
export type CreatePmFacility = z.infer<typeof createPmFacilitySchema>;
export type UpdatePmFacility = z.infer<typeof updatePmFacilitySchema>;
export type CreatePmProject = z.infer<typeof createPmProjectSchema>;
export type UpdatePmProject = z.infer<typeof updatePmProjectSchema>;
export type CreatePmPhase = z.infer<typeof createPmPhaseSchema>;
export type UpdatePmPhase = z.infer<typeof updatePmPhaseSchema>;
export type CreatePmMeeting = z.infer<typeof createPmMeetingSchema>;
export type UpdatePmMeeting = z.infer<typeof updatePmMeetingSchema>;
export type CreatePmInvoice = z.infer<typeof createPmInvoiceSchema>;
export type UpdatePmInvoice = z.infer<typeof updatePmInvoiceSchema>;
export type UpdatePmEmployeeOrder = z.infer<typeof updatePmEmployeeOrderSchema>;
export type CreatePmTask = z.infer<typeof createPmTaskSchema>;
export type UpdatePmTask = z.infer<typeof updatePmTaskSchema>;
export type KimaiCreate = z.infer<typeof kimaiCreateSchema>;
