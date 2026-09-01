export type PurchaseIntent = {
  platform: 'Linear';
  seatCount: number;
  /** The user's requested sprint length. This is never rewritten to match billing. */
  requestedDurationDays: number;
  billingCadence: 'monthly';
  /** A display/demo approximation for one monthly merchant billing cycle. */
  billingPeriodDays: 30;
  /** Capsule purchases only the first cycle; every later cycle needs fresh approval. */
  billablePeriodCount: 1;
  /** Human-readable disclosure when requested duration and billing granularity differ. */
  pricingNotice: string;
  /** Provisional first-cycle estimate. Converted to paise at the Razorpay API boundary. */
  exactAmount: string;
  tierName: 'Free' | 'Basic' | 'Business';
};

export type AgentState =
  | 'idle'
  | 'intent_parsed'
  | 'quoting_checkout'
  | 'checkout_quoted'
  | 'order_created'
  | 'passkey_approved'
  | 'awaiting_payment'
  | 'webhook_confirmed'
  | 'dry_run_complete'
  | 'complete'
  | 'renewal_required'
  | 'renewal_approved'
  | 'renewal_not_approved'
  | 'failed';

export type AutomationMode = 'mock' | 'dry-run' | 'real';
