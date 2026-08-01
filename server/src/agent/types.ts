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
  | 'session_created'
  | 'awaiting_card_entry'
  | 'callback_received'
  | 'token_issued'
  | 'automating_checkout'
  | 'complete'
  | 'renewal_required'
  | 'failed';
