import type { AgentExecutionContext } from '../agent/context.js';

export interface DomStep {
  name: string;
  run: () => Promise<void>;
}

export async function runCheckoutSteps(
  context: AgentExecutionContext,
  steps: DomStep[],
): Promise<void> {
  for (const step of steps) {
    context.events.publish(context.runId, 'agent:dom_step', {
      step: step.name,
      status: 'started',
    });

    try {
      await step.run();
      context.events.publish(context.runId, 'agent:dom_step', {
        step: step.name,
        status: 'completed',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DOM step failed';
      context.events.publish(context.runId, 'agent:dom_step', {
        step: step.name,
        status: 'failed',
        detail: message,
      });
      context.events.publish(context.runId, 'agent:error', {
        phase: 'checkout_automation',
        message,
        retryable: true,
      });
      throw error;
    }
  }

}
