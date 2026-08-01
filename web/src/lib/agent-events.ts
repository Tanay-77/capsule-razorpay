export const AGENT_EVENT_TYPES = [
  'agent:intent_parsed',
  'agent:state_changed',
  'agent:prava_request',
  'agent:session_created',
  'agent:awaiting_card_entry',
  'agent:callback_received',
  'agent:payment_result_polled',
  'agent:token_issued',
  'agent:status_reported',
  'agent:dom_step',
  'agent:renewal_required',
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
