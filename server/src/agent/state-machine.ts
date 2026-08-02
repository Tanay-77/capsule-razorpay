import type { AgentExecutionContext } from './context.js';
import type { AgentState } from './types.js';

const transitions: Record<AgentState, readonly AgentState[]> = {
  idle: ['intent_parsed', 'failed'],
  intent_parsed: ['quoting_checkout', 'failed'],
  quoting_checkout: ['checkout_quoted', 'failed'],
  checkout_quoted: ['session_created', 'failed'],
  session_created: ['awaiting_card_entry', 'dry_run_complete', 'failed'],
  dry_run_complete: ['renewal_required'],
  awaiting_card_entry: ['callback_received', 'token_issued', 'failed'],
  callback_received: ['token_issued', 'failed'],
  token_issued: ['automating_checkout', 'failed'],
  automating_checkout: ['complete', 'failed'],
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
