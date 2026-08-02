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
  /** Provisional first-cycle estimate. Never send this value to Prava. */
  exactAmount: string;
  tierName: 'Free' | 'Basic' | 'Business';
};

export type AgentState =
  | 'idle'
  | 'intent_parsed'
  | 'quoting_checkout'
  | 'checkout_quoted'
  | 'session_created'
  | 'awaiting_card_entry'
  | 'callback_received'
  | 'token_issued'
  | 'automating_checkout'
  | 'dry_run_complete'
  | 'complete'
  | 'renewal_required'
  | 'renewal_approved'
  | 'renewal_not_approved'
  | 'failed';

export type AutomationMode = 'mock' | 'dry-run' | 'real';
