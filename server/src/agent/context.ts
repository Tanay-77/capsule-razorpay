import type { AgentEventEmitter } from '../events/AgentEventEmitter.js';

export interface AgentExecutionContext {
  runId: string;
  events: AgentEventEmitter;
}
