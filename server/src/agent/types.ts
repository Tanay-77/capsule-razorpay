export type PurchaseIntent = {
  kind: 'purchase' | 'renewal' | 'unknown';
  merchant?: string;
  product?: string;
  amount?: string;
  currency?: string;
  raw: string;
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
