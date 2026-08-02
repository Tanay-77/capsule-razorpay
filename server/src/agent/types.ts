export type PurchaseIntent = {
  platform: 'Linear';
  seatCount: number;
  durationDays: number;
  /** Provisional 30-day prorated estimate. Never send this value to Prava. */
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
