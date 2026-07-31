import { randomUUID } from 'node:crypto';
import { agentEvents } from '../events/AgentEventEmitter.js';
import type { OneTimeCredential } from '../prava/types.js';
import type { AgentExecutionContext } from './context.js';
import { AgentStateMachine } from './state-machine.js';

export interface AgentRun {
  context: AgentExecutionContext;
  state: AgentStateMachine;
  sessionId?: string;
  callbackUrl?: string;
  credential?: OneTimeCredential;
  tokenEventEmitted?: boolean;
}

const runs = new Map<string, AgentRun>();

export function createAgentRun(): AgentRun {
  const context = { runId: randomUUID(), events: agentEvents };
  const run = { context, state: new AgentStateMachine(context) };
  runs.set(context.runId, run);
  return run;
}

export function getAgentRun(runId: string): AgentRun | undefined {
  return runs.get(runId);
}
