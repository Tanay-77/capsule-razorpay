export const AGENT_EVENT_TYPES = [
  'agent:intent_parsed',
  'agent:intent_parse_attempt',
  'agent:state_changed',
  'agent:automation_mode',
  'agent:dom_step',
  'agent:manual_action_required',
  'agent:checkout_total_read',
  'agent:checkout_total_changed',
  'agent:prava_request',
  'agent:session_created',
  'agent:awaiting_card_entry',
  'agent:passkey_required',
  'agent:callback_received',
  'agent:payment_result_polled',
  'agent:token_issued',
  'agent:status_reported',
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
