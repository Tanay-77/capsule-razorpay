import type { AgentExecutionContext } from './context.js';
import type { AgentState } from './types.js';

const transitions: Record<AgentState, readonly AgentState[]> = {
  idle: ['intent_parsed', 'failed'],
  intent_parsed: ['quoting_checkout', 'failed'],
  quoting_checkout: ['checkout_quoted', 'failed'],
  checkout_quoted: ['order_created', 'failed'],
  order_created: ['passkey_approved', 'dry_run_complete', 'failed'],
  passkey_approved: ['awaiting_payment', 'failed'],
  awaiting_payment: ['webhook_confirmed', 'failed'],
  webhook_confirmed: ['upsell_suggested', 'complete', 'failed'],
  upsell_suggested: ['upsell_accepted', 'upsell_declined', 'failed'],
  upsell_accepted: ['upsell_order_created', 'failed'],
  upsell_declined: ['complete', 'failed'],
  upsell_order_created: ['upsell_passkey_approved', 'failed'],
  upsell_passkey_approved: ['upsell_awaiting_payment', 'failed'],
  upsell_awaiting_payment: ['upsell_webhook_confirmed', 'failed'],
  upsell_webhook_confirmed: ['complete', 'failed'],
  dry_run_complete: ['renewal_required'],
  complete: ['renewal_required'],
  renewal_required: ['renewal_approved', 'renewal_not_approved'],
  renewal_approved: [],
  renewal_not_approved: [],
  failed: ['intent_parsed'],
};

export class AgentStateMachine {
  private state: AgentState = 'idle';

  constructor(private readonly context: AgentExecutionContext) {}

  get current(): AgentState {
    return this.state;
  }

  transition(next: AgentState): AgentState {
    if (!transitions[this.state].includes(next)) {
      throw new Error(`Invalid agent transition: ${this.state} -> ${next}`);
    }

    const previous = this.state;
    this.state = next;
    this.context.events.publish(this.context.runId, 'agent:state_changed', {
      from: previous,
      to: next,
    });
    return this.state;
  }
}
