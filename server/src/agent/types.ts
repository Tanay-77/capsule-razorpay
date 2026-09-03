export type PurchaseIntent = {
  skuId: string;
  quantity: number;
  requestedDurationDays: number;
  resolvedAmountPaise: number;
  billingNote: string;
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
  | 'upsell_suggested'
  | 'upsell_accepted'
  | 'upsell_declined'
  | 'upsell_order_created'
  | 'upsell_passkey_approved'
  | 'upsell_awaiting_payment'
  | 'upsell_webhook_confirmed'
  | 'complete'
  | 'renewal_required'
  | 'renewal_approved'
  | 'renewal_not_approved'
  | 'failed';

export type AutomationMode = 'mock' | 'dry-run' | 'real';
