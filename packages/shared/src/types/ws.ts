export const WsEventType = {
  review_completed: 'review_completed',
  invoice_created: 'invoice_created',
  invoice_updated: 'invoice_updated',
  facility_updated: 'facility_updated',
  notification_created: 'notification_created',
  dashboard_refresh: 'dashboard_refresh',
} as const;
export type WsEventType = (typeof WsEventType)[keyof typeof WsEventType];

export interface WsEvent<T = unknown> {
  type: WsEventType;
  payload: T;
  timestamp: string;
}

export interface ReviewCompletedPayload {
  reviewId: string;
  contractId: string;
  facilityId: string;
  facilityName: string;
  contractNumber: string;
}

export interface InvoiceCreatedPayload {
  invoiceId: string;
  contractId: string;
  facilityName: string;
  contractNumber: string;
}

export interface InvoiceUpdatedPayload {
  invoiceId: string;
  contractId: string;
  status: string;
}

export interface FacilityUpdatedPayload {
  facilityId: string;
  contractId: string;
}

export interface NotificationCreatedPayload {
  id: string;
  type: string;
  title: string;
  message: string;
}

export interface DashboardRefreshPayload {
  pendingReviews: number;
  pendingInvoices: number;
  completedThisMonth: number;
}
