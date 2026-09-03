export const AGENT_EVENT_TYPES = [
  'agent:intent_parsed',
  'agent:intent_parse_attempt',
  'agent:state_changed',
  'agent:automation_mode',
  'agent:dom_step',
  'agent:manual_action_required',
  'agent:checkout_total_read',
  'agent:checkout_total_changed',
  'agent:razorpay_request',
  'agent:order_created',
  'agent:passkey_required',
  'agent:payment_link_created',
  'agent:awaiting_payment',
  'agent:webhook_confirmed',
  'agent:upsell_suggested',
  'agent:upsell_accepted',
  'agent:upsell_declined',
  'agent:upsell_order_created',
  'agent:upsell_passkey_required',
  'agent:upsell_payment_link_created',
  'agent:upsell_awaiting_payment',
  'agent:upsell_webhook_confirmed',
  'agent:screenshot_saved',
  'agent:dry_run_complete',
  'agent:renewal_required',
  'agent:renewal_approved',
  'agent:renewal_not_approved',
  'agent:complete',
  'agent:error',
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export interface AgentEvent {
  id: string;
  runId: string;
  type: AgentEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}
