export interface MerchantDetails {
  name: string;
  url: string;
  country_code_iso2: string;
  category_code?: string;
  category?: string;
}

export interface ProductDetails {
  description: string;
  unit_price: string;
  product_id?: string;
  quantity?: number;
}

export interface PurchaseContext {
  merchant_details: MerchantDetails;
  product_details: ProductDetails[];
  effective_until_minutes?: number;
}

export interface CreateSessionRequest {
  user_id: string;
  user_email: string;
  total_amount: string;
  currency: string;
  purchase_context: [PurchaseContext];
  integration_type: 'full_checkout';
  callback_url: string;
  user_phone?: string;
  user_country_code_iso2?: string;
  external_order_ref?: string;
  description?: string;
  card?: { card_id?: string; vault_ref_id?: string };
}

export interface SessionResponse {
  session_id: string;
  session_token: string;
  iframe_url: string;
  order_id: string;
  expires_at: string;
  authorizeOnly?: boolean;
}

export type PaymentStatus =
  | 'pending'
  | 'awaiting_result'
  | 'completed'
  | 'failed'
  | string;

export interface PaymentProduct {
  product_ref_id: string;
  external_product_id: string | null;
  name: string;
  unit_price: string;
  quantity: number;
}

export interface PaymentLineItem {
  txn_ref_id: string;
  merchant_name: string | null;
  merchant_url: string | null;
  total_amount: string;
  status: string;
  token: string | null;
  dynamic_cvv: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  products: PaymentProduct[];
}

export interface PaymentTransaction {
  txn_id: string;
  status: PaymentStatus;
  line_items: PaymentLineItem[];
  error?: { code: string; message: string };
}

export interface PaymentResultResponse {
  session_id: string;
  order_id: string | null;
  status: PaymentStatus;
  transactions: PaymentTransaction[];
}

export type ProductExecutionStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'
  | 'INPROGRESS'
  | 'PENDING'
  | 'ONHOLD';

export interface ReportStatusRequest {
  txn_ref_id: string;
  txn_status: 'APPROVED' | 'DECLINED';
  txn_type?: string;
  authorization_code?: string;
  response_code?: string;
  amount_paid?: string;
  product_statuses?: Array<{
    status: ProductExecutionStatus;
    product_id?: string;
    product_ref_id?: string;
    amount_paid?: string;
  }>;
}

export interface ReportStatusResponse {
  status: 'confirmed' | string;
  txn_ref_id: string;
  txn_status: 'APPROVED' | 'DECLINED';
  visa_confirmation: 'SUCCESS' | 'FAILURE' | string;
}

export interface OneTimeCredential {
  token: string;
  dynamicCvv: string;
  expiryMonth: string;
  expiryYear: string;
  transactionReferenceId: string;
}
