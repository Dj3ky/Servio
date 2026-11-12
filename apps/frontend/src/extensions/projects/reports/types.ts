export interface SummaryData {
  statusCounts: { status: string; count: number }[];
  totals: { totalContractValue: string; totalInvoiced: string; totalRemaining: string };
  employeeStats: { employeeId: string | null; employeeName: string | null; count: number; totalValue: string; totalInvoiced: string }[];
}

export interface WorkloadProject {
  id: string; projectNumber: string; name: string; priority: string; status: string;
  endDate: string | null; contractValue: string | null; invoicedAmount: string;
  customerName: string | null;
}

export interface WorkloadGroup {
  employeeId: string | null;
  employeeName: string | null;
  projects: WorkloadProject[];
}

export interface OverdueProject {
  id: string; projectNumber: string; name: string; priority: string; status: string;
  endDate: string | null; contractValue: string | null; invoicedAmount: string;
  employeeId: string | null; employeeName: string | null; customerName: string | null;
}

export interface CustomerRow {
  customerName: string | null; variants: number;
  activeCount: number; completedCount: number;
  contractValue: string; invoiced: string; remainingActive: string; unbilledCompleted: string;
}

// month: 1–12
export interface RevenueTrendRow { month: number; revenue: number; invoiceCount: number; prevRevenue: number }
export interface CompletionsRow { month: number; count: number }
export interface RevenueYearRow { year: number; revenue: number; invoiceCount: number; projectCount: number }

export interface OutstandingProject {
  id: string; projectNumber: string; name: string; customerName: string | null;
  employeeId: string | null; employeeName: string | null;
  contractValue: string | null; invoicedAmount: string; completedAt: string | null;
}

export type PipelineBucket = 'overdue' | 'thisMonth' | 'nextMonth' | 'next3Months' | 'later' | 'none';
export interface PipelineRow { bucket: PipelineBucket; count: number; remaining: number }
