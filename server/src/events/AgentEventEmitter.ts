import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export interface AgentEventPayloads {
  'agent:intent_parsed': {
    intent: string;
    merchant?: string;
    product?: string;
    amount?: string;
    currency?: string;
  };
  'agent:state_changed': { from: string; to: string };
  'agent:prava_request': {
    operation: 'create_session' | 'get_payment_result' | 'report_status';
    status: 'started' | 'succeeded' | 'failed';
  };
  'agent:session_created': {
    sessionId: string;
    orderId: string;
    expiresAt: string;
    hostedUrl: string;
  };
  'agent:awaiting_card_entry': {
    sessionId: string;
    hostedUrl: string;
    callbackUrl: string;
  };
  'agent:callback_received': { sessionId: string };
  'agent:payment_result_polled': {
    sessionId: string;
    attempt: number;
    status: 'pending' | 'processing' | 'awaiting_result' | 'completed' | 'failed';
    nextPollInMs?: number;
  };
  'agent:token_issued': {
    sessionId: string;
    transactionReferenceId: string;
    credentialAvailable: true;
  };
  'agent:status_reported': {
    sessionId: string;
    transactionReferenceId: string;
    transactionStatus: 'APPROVED' | 'DECLINED';
  };
  'agent:dom_step': {
    step: string;
    status: 'started' | 'completed' | 'failed';
    detail?: string;
  };
  'agent:renewal_required': { periodEndedAt: string; prompt: string };
  'agent:complete': { outcome: string };
  'agent:error': { phase: string; message: string; retryable: boolean };
}

export type AgentEventType = keyof AgentEventPayloads;

export type AgentEvent<T extends AgentEventType = AgentEventType> = {
  [K in T]: {
    id: string;
    runId: string;
    type: K;
    timestamp: string;
    payload: AgentEventPayloads[K];
  };
}[T];

type AgentEventListener = (event: AgentEvent) => void;
const EVENT_CHANNEL = 'agent:event';

export class AgentEventEmitter {
  private readonly emitter = new EventEmitter();
  private readonly history: AgentEvent[] = [];

  constructor(private readonly historyLimit = 100) {
    this.emitter.setMaxListeners(0);
  }

  publish<T extends AgentEventType>(
    runId: string,
    type: T,
    payload: AgentEventPayloads[T],
  ): AgentEvent<T> {
    const event = {
      id: randomUUID(),
      runId,
      type,
      timestamp: new Date().toISOString(),
      payload,
    } as AgentEvent<T>;

    this.history.push(event as AgentEvent);
    if (this.history.length > this.historyLimit) this.history.shift();
    this.emitter.emit(EVENT_CHANNEL, event as AgentEvent);
    return event;
  }

  subscribe(listener: AgentEventListener): () => void {
    this.emitter.on(EVENT_CHANNEL, listener);
    return () => this.emitter.off(EVENT_CHANNEL, listener);
  }

  recent(runId?: string): AgentEvent[] {
    return this.history.filter((event) => !runId || event.runId === runId);
  }
}

export const agentEvents = new AgentEventEmitter();
