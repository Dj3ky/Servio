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

// PM Weekly Meetings
export const createPmMeetingSchema = z.object({
  meetingDate: z.string().min(1),
  notes: z.string().optional().nullable(),
  entries: z.array(z.object({
    projectId: z.string().uuid(),
    entryStatus: z.enum(['done', 'in_progress', 'blocked']).default('in_progress'),
    notes: z.string().optional().nullable(),
  })),
});

export const updatePmMeetingSchema = z.object({
  notes: z.string().optional().nullable(),
  entries: z.array(z.object({
    projectId: z.string().uuid(),
    entryStatus: z.enum(['done', 'in_progress', 'blocked']),
    notes: z.string().optional().nullable(),
  })).optional(),
});

// PM Project Invoices
export const createPmInvoiceSchema = z.object({
  invoiceDate: z.string().min(1),
  amount: z.string().min(1),
  notes: z.string().optional().nullable(),
});

// Extension config
export const updateExtensionConfigSchema = z.object({
  extension: z.string().min(1),
  enabled: z.boolean(),
});

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
