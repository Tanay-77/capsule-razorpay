import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export interface AgentEventPayloads {
  'agent:intent_parsed': {
    intent: 'purchase';
    skuId: string;
    quantity: number;
    requestedDurationDays: number;
    resolvedAmountPaise: number;
    billingNote: string;
    merchantId?: string;
    merchantName?: string;
  };
  'agent:intent_parse_attempt': {
    attempt: number;
    model: string;
    status: 'started' | 'succeeded' | 'validation_failed' | 'failed';
  };
  'agent:passkey_registered': {
    credentialId: string;
  };
  'agent:passkey_approved': Record<string, never>;
  'agent:state_changed': { from: string; to: string };
  'agent:razorpay_request': {
    operation: 'create_order' | 'create_payment_link';
    status: 'started' | 'succeeded' | 'failed';
  };
  'agent:order_created': {
    orderId: string;
    amountPaise: number;
    currency: string;
  };
  'agent:passkey_required': {
    orderId: string;
    message: string;
  };
  'agent:payment_link_created': {
    paymentLinkId: string;
    shortUrl: string;
    expireBy: number | null;
  };
  'agent:awaiting_payment': {
    orderId: string;
    paymentLinkUrl: string;
  };
  'agent:webhook_confirmed': {
    orderId: string;
    paymentId: string;
    amountPaidPaise: number;
  };
  'agent:upsell_suggested': {
    primarySkuId: string;
    addOnSkuId: string;
    addOnName: string;
    priceInPaise: number;
  };
  'agent:upsell_accepted': Record<string, never>;
  'agent:upsell_declined': Record<string, never>;
  'agent:upsell_order_created': {
    orderId: string;
    amountPaise: number;
    currency: string;
  };
  'agent:upsell_passkey_required': {
    orderId: string;
    message: string;
  };
  'agent:upsell_payment_link_created': {
    paymentLinkId: string;
    shortUrl: string;
    expireBy: number;
  };
  'agent:upsell_awaiting_payment': {
    paymentLinkUrl: string;
  };
  'agent:upsell_webhook_confirmed': {
    orderId: string;
    paymentId: string;
    amountPaidPaise: number;
  };
  'agent:dom_step': {
    step: string;
    status: 'started' | 'completed' | 'failed';
    detail?: string;
  };
  'agent:automation_mode': { mode: 'mock' | 'dry-run' | 'real' };
  'agent:manual_action_required': {
    action: 'linear_login' | 'linear_mfa' | 'razorpay_payment';
    message: string;
    url?: string;
  };
  'agent:checkout_total_read': {
    amount: string;
    currency: string;
    source: 'mock' | 'linear_dom' | 'catalog';
  };
  'agent:checkout_total_changed': { previous: string; current: string };
  'agent:screenshot_saved': { path: string };
  'agent:dry_run_complete': {
    orderId: string;
    amount: string;
    currency: string;
  };
  'agent:renewal_required': {
    periodEndedAt: string;
    decisionDeadline: string;
    seatCount: number;
    billingCadence: 'monthly';
    billingPeriodDays: 30;
    prompt: string;
    freshApprovalRequired: true;
  };
  'agent:renewal_approved': {
    approvedAt: string;
    renewalRunId: string;
    freshSessionRequired: true;
    freshPasskeyRequired: true;
  };
  'agent:renewal_not_approved': {
    resolvedAt: string;
    reason: 'no_user_approval';
    sessionCreated: false;
    tokenIssued: false;
    merchantChargeAttempted: false;
    reusableCredentialStored: false;
  };
  'agent:complete': { outcome: string };
  'agent:payment_mismatch': { expectedPaise: number; actualPaise: number };
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
