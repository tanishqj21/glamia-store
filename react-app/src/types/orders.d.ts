export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'PICKED_UP_BY_COURIER' | 'RECEIVED' | 'REFUNDED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export interface Order {
  cancellation_refund?: CancellationRefund | null;
  delivery_estimate?: string;
  id: string;
  order_number: string;
  order_type: 'standard' | 'preorder' | 'replacement';
  orderType: 'STANDARD' | 'PREORDER' | 'REPLACEMENT';
  isReplacement: boolean;
  is_replacement: boolean;
  replacement_fulfilment_mode?: 'after_receipt' | 'immediate' | null;
  originalOrderId: string | null;
  original_order_id: string | null;
  trackingNumber: string;
  returnStatus?: ReturnStatus;
  subtotal: number;
  tax_total?: number;
  shipping_total?: number;
  total: number;
}
export interface CancellationRefund {
  id: string | null;
  state: 'approved' | 'submitting' | 'pending' | 'reconciliation_required' | 'processed' | 'failed' | 'review_required';
  total: number;
  gateway_amount: number;
  credit_amount: number;
  credits_restored: boolean;
  provider: string;
  provider_refund_id: string | null;
  checked_at: string | null;
  recovery_available: boolean;
  verification_retry_available?: boolean;
}
export interface ReturnRequest {
  /** Administrative closure only; never evidence of payment or receipt. */
  case_completed_at?: string | null;
  /** Staff-only fields; excluded from customer APIs. */
  case_completed_by?: string | null;
  case_completion_reason?: string | null;
  id: string;
  order_id: string;
  type: 'refund' | 'exchange';
  status: Lowercase<Exclude<ReturnStatus, 'PICKED_UP_BY_COURIER'>>;
  returnStatus: ReturnStatus;
  trackingNumber: string;
  pickup_confirmed_at: string | null;
  returned_at: string | null;
  label_available: boolean;
  logistics_json: string;
  replacement_order_id: string | null;
  replacement_fulfilment_mode?: 'after_receipt' | 'immediate' | null;
}
