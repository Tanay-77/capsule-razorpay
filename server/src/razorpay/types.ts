// ── Razorpay API types ──────────────────────────────────────────────
// Amount is always an INTEGER in the smallest currency subunit
// (paise for INR, cents for USD). ₹300 = 30000, not "300.00".

// ── Orders ──────────────────────────────────────────────────────────

export interface CreateOrderRequest {
  amount: number;         // integer, smallest subunit (paise)
  currency: string;       // e.g. "INR"
  receipt?: string;       // max 40 chars, merchant-side reference
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;             // e.g. "order_EKwxwAgItmmXdp"
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: 'created' | 'attempted' | 'paid';
  notes: Record<string, string>;
  created_at: number;
}

// ── Payment Links ───────────────────────────────────────────────────

export interface CreatePaymentLinkRequest {
  amount: number;         // integer, smallest subunit (paise)
  currency: string;
  expire_by?: number;     // unix timestamp (seconds)
  reference_id?: string;  // merchant-side reference
  description?: string;
  callback_url?: string;
  callback_method?: 'get';
  notes?: Record<string, string>;
}

export interface RazorpayPaymentLink {
  id: string;             // e.g. "plink_ExjpAiB..."
  amount: number;
  currency: string;
  status: 'created' | 'paid' | 'cancelled' | 'expired';
  description: string | null;
  short_url: string;      // the URL the buyer opens
  reference_id: string | null;
  expire_by: number | null;
  notes: Record<string, string>;
  created_at: number;
}

// ── Webhooks ────────────────────────────────────────────────────────

export interface RazorpayWebhookEvent {
  entity: 'event';
  account_id: string;
  event: string;          // e.g. "payment_link.paid", "order.paid"
  contains: string[];     // e.g. ["payment"]
  payload: {
    payment?: { entity: RazorpayWebhookPayment };
    payment_link?: { entity: RazorpayWebhookPaymentLinkEntity };
    order?: { entity: RazorpayWebhookOrderEntity };
  };
  created_at: number;
}

export interface RazorpayWebhookPayment {
  id: string;             // e.g. "pay_..."
  entity: 'payment';
  amount: number;
  currency: string;
  status: 'captured' | 'authorized' | 'failed' | string;
  order_id: string | null;
  method: string;
  description: string | null;
  notes: Record<string, string>;
}

export interface RazorpayWebhookPaymentLinkEntity {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'created' | 'expired' | 'cancelled';
  reference_id: string | null;
  short_url: string;
  notes: Record<string, string>;
}

export interface RazorpayWebhookOrderEntity {
  id: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: 'paid' | 'created' | 'attempted';
  receipt: string | null;
  notes: Record<string, string>;
}
