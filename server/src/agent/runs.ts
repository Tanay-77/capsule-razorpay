import { randomUUID } from 'node:crypto';
import { agentEvents } from '../events/AgentEventEmitter.js';
import type { AgentExecutionContext } from './context.js';
import type { AutomationMode, PurchaseIntent } from './types.js';
import { AgentStateMachine } from './state-machine.js';

export interface AgentRun {
  context: AgentExecutionContext;
  state: AgentStateMachine;
  orderId?: string;
  paymentLinkId?: string;
  paymentLinkUrl?: string;
  intent?: PurchaseIntent;
  automationStarted?: boolean;
  automationMode?: AutomationMode;
  renewalDemoMs?: number;
  renewalDecisionMs?: number;
  renewalTimer?: ReturnType<typeof setTimeout>;
  renewalDecisionTimer?: ReturnType<typeof setTimeout>;
  renewalResolved?: 'approved' | 'not_approved';
  /** Resolves when the webhook confirms payment for this run. */
  webhookPromise?: Promise<void>;
  webhookResolve?: () => void;
  webhookReject?: (reason?: any) => void;
  approvalResolve?: () => void;
}

const runs = new Map<string, AgentRun>();

export function createAgentRun(): AgentRun {
  const context = { runId: randomUUID(), events: agentEvents };
  const run: AgentRun = { context, state: new AgentStateMachine(context) };
  runs.set(context.runId, run);
  return run;
}

export function getAgentRun(runId: string): AgentRun | undefined {
  return runs.get(runId);
}

/** Look up a run by its Razorpay Order ID (set after order creation). */
export function getAgentRunByOrderId(orderId: string): AgentRun | undefined {
  for (const run of runs.values()) {
    if (run.orderId === orderId) return run;
  }
  return undefined;
}
