'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AGENT_EVENT_TYPES,
  type AgentEvent,
  type AgentEventType,
} from '@/lib/agent-events';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type EventTone = 'default' | 'accent' | 'inverse' | 'muted' | 'error';

interface EventPresentation {
  label: string;
  message: string;
  detail?: string;
  tone: EventTone;
}

interface SessionStatus {
  merchant: string;
  amount: string;
  currency: string;
  amountSource: 'ESTIMATE' | 'CHECKOUT';
  phase: string;
}

export function AgentEventStream({
  runId,
  onRenewalRunStarted,
}: {
  runId?: string;
  onRenewalRunStarted?: (runId: string) => void;
}) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [renewalApproving, setRenewalApproving] = useState(false);
  const [renewalError, setRenewalError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!runId) {
      setEvents([]);
      setConnected(false);
      return;
    }

    setEvents([]);
    const stream = new EventSource(
      `${API_URL}/api/agent/stream?runId=${encodeURIComponent(runId)}`,
    );
    const handlers = new Map<AgentEventType, (event: MessageEvent<string>) => void>();

    for (const type of AGENT_EVENT_TYPES) {
      const handler = (message: MessageEvent<string>) => {
        try {
          const event = JSON.parse(message.data) as AgentEvent;
          setEvents((current) => {
            if (current.some((item) => item.id === event.id)) return current;
            return [...current, event].slice(-120);
          });
        } catch {
          // Ignore malformed frames; the EventSource connection remains usable.
        }
      };
      handlers.set(type, handler);
      stream.addEventListener(type, handler as EventListener);
    }

    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);

    return () => {
      for (const [type, handler] of handlers) {
        stream.removeEventListener(type, handler as EventListener);
      }
      stream.close();
    };
  }, [runId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [events]);

  const status = useMemo(() => deriveSessionStatus(events), [events]);
  const approvalPending = useMemo(() => isApprovalPending(events), [events]);
  const renewalMoment = useMemo(() => latestRenewalMoment(events), [events]);

  async function approveRenewal() {
    if (!runId || renewalApproving) return;
    setRenewalApproving(true);
    setRenewalError(undefined);
    try {
      const response = await fetch(`${API_URL}/api/agent/renewal/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      const result = (await response.json()) as { runId?: string; error?: string };
      if (!response.ok || !result.runId) throw new Error(result.error ?? 'Renewal approval failed');
      onRenewalRunStarted?.(result.runId);
    } catch (caught) {
      setRenewalError(caught instanceof Error ? caught.message : 'Renewal approval failed');
    } finally {
      setRenewalApproving(false);
    }
  }

  return (
    <section className="flex min-h-[34rem] flex-col border-4 border-ink bg-ink text-paper lg:min-h-[42rem]">
      <div className="flex items-center justify-between border-b-2 border-paper/40 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] sm:px-5">
        <span>Capsule / live execution</span>
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 ${connected ? 'bg-signal' : 'border border-paper/60'}`} />
          {connected ? 'streaming' : runId ? 'connecting' : 'standby'}
        </span>
      </div>

      <div className="terminal-scroll min-h-0 flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Live agent events">
        {events.length === 0 ? (
          <div className="grid min-h-[26rem] place-items-center px-8 text-center text-sm uppercase tracking-[0.12em] text-paper/45">
            <div>
              <p className="text-4xl text-paper/20">_</p>
              <p className="mt-3">{runId ? 'Opening event channel' : 'Awaiting command'}</p>
            </div>
          </div>
        ) : (
          <ol>
            {events.map((event, index) => (
              <EventLine event={event} index={index + 1} key={event.id} />
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      {approvalPending ? (
        <div className="border-t-4 border-ink bg-signal px-5 py-5 text-ink" role="status">
          <p className="text-[10px] font-black uppercase tracking-[0.2em]">Passkey / human checkpoint</p>
          <p className="mt-2 text-xl font-black uppercase leading-tight sm:text-2xl">Approve in the secure Prava window</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-ink/65">Capsule is paused. No checkout continues without you.</p>
        </div>
      ) : null}

      {renewalMoment ? (
        <RenewalMomentPanel
          approving={renewalApproving}
          error={renewalError}
          event={renewalMoment}
          onApprove={() => void approveRenewal()}
        />
      ) : null}

      <div className="grid border-t-4 border-signal bg-paper text-ink sm:grid-cols-[1fr_1fr_auto]">
        <StatusCell label="Merchant scope" value={status.merchant} />
        <StatusCell
          label={`${status.amountSource.toLowerCase()} amount`}
          value={formatAmount(status.amount, status.currency)}
        />
        <StatusCell label="State" value={status.phase} last />
      </div>
    </section>
  );
}

function EventLine({ event, index }: { event: AgentEvent; index: number }) {
  const view = presentEvent(event);
  const toneClasses: Record<EventTone, string> = {
    default: 'border-paper/20 bg-transparent text-paper',
    muted: 'border-paper/10 bg-paper/[0.03] text-paper/65',
    accent: 'border-signal bg-signal text-ink',
    inverse: 'border-paper bg-paper text-ink',
    error: 'border-signal bg-ink text-signal',
  };

  return (
    <li className={`grid grid-cols-[3.25rem_1fr] border-b-2 ${toneClasses[view.tone]}`}>
      <div className="border-r-2 border-current/20 px-3 py-4 text-right text-[10px] font-bold opacity-55">
        {String(index).padStart(2, '0')}
      </div>
      <div className="min-w-0 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-[11px] font-black uppercase tracking-[0.16em]">{view.label}</span>
          <time className="text-[10px] font-bold opacity-50">
            {new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}
          </time>
        </div>
        <p className={`mt-2 text-sm leading-6 ${view.tone === 'accent' ? 'text-lg font-black sm:text-xl' : ''}`}>
          {view.message}
        </p>
        {view.detail ? (
          <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.08em] opacity-55">
            {view.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function RenewalMomentPanel({
  event,
  approving,
  error,
  onApprove,
}: {
  event: AgentEvent;
  approving: boolean;
  error?: string;
  onApprove: () => void;
}) {
  if (event.type === 'agent:renewal_not_approved') {
    return (
      <section className="border-t-[10px] border-signal bg-paper px-5 py-8 text-ink sm:px-8 sm:py-12" role="status">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-signal">Monthly renewal / silence recorded</p>
        <h2 className="mt-4 font-black uppercase leading-[0.9] tracking-[-0.06em]">
          <span className="block text-4xl [word-spacing:-0.16em] sm:text-6xl lg:text-7xl">No approval</span>
          <span className="mt-2 block text-4xl [word-spacing:-0.16em] sm:text-6xl lg:text-7xl">No charge</span>
        </h2>
        <div className="mt-8 grid border-4 border-ink sm:grid-cols-2 lg:grid-cols-4">
          <ProofFact label="Renewal session" value="NOT CREATED" />
          <ProofFact label="Payment token" value="NOT ISSUED" />
          <ProofFact label="Merchant checkout" value="NOT ATTEMPTED" />
          <ProofFact label="Reusable credential" value="NOT STORED" last />
        </div>
        <p className="mt-6 max-w-4xl text-sm font-black uppercase leading-6 tracking-[0.08em]">
          Silence granted no payment authority. Capsule retained no reusable card credential that could be used for renewal.
        </p>
      </section>
    );
  }

  return (
    <section className="border-t-[10px] border-signal bg-paper px-5 py-7 text-ink sm:px-8 sm:py-9" role="status">
      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-signal">Monthly cycle ending / explicit decision required</p>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 className="text-3xl font-black uppercase leading-tight tracking-[-0.05em] sm:text-5xl">
            Approve the next monthly cycle for {readNumber(event.payload.seatCount)} seat{readNumber(event.payload.seatCount) === 1 ? '' : 's'}?
          </h2>
          <p className="mt-4 text-xs font-bold uppercase leading-5 tracking-[0.09em] text-ink/60">
            No session exists yet. Approval starts a fresh quote, a fresh Prava session, and a fresh passkey checkpoint.
          </p>
        </div>
        <button
          className="border-4 border-ink bg-signal px-6 py-5 text-sm font-black uppercase tracking-[0.12em] hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
          disabled={approving}
          onClick={onApprove}
          type="button"
        >
          {approving ? 'Starting fresh run…' : 'Approve + use passkey →'}
        </button>
      </div>
      <p className="mt-5 border-l-4 border-ink pl-4 text-[10px] font-black uppercase tracking-[0.12em]">
        Leave this unanswered to demonstrate: silence creates nothing.
      </p>
      {error ? <p className="mt-4 border-2 border-signal bg-ink px-4 py-3 text-xs font-bold text-signal">{error}</p> : null}
    </section>
  );
}

function ProofFact({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`min-h-28 px-4 py-4 ${last ? '' : 'border-b-2 border-ink sm:border-r-2 lg:border-b-0'}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-ink/50">{label}</p>
      <p className="mt-4 text-lg font-black uppercase leading-tight text-signal">{value}</p>
    </div>
  );
}
function StatusCell({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`px-4 py-3 ${last ? '' : 'border-b-2 border-ink sm:border-b-0 sm:border-r-2'}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-ink/55">{label}</p>
      <p className="mt-1 truncate text-xs font-black uppercase">{value}</p>
    </div>
  );
}

function deriveSessionStatus(events: AgentEvent[]): SessionStatus {
  const status: SessionStatus = {
    merchant: 'UNSCOPED',
    amount: '--',
    currency: '',
    amountSource: 'ESTIMATE',
    phase: 'IDLE',
  };

  for (const event of events) {
    const payload = event.payload;
    if (event.type === 'agent:intent_parsed') {
      status.merchant = readString(payload.platform, 'LINEAR').toUpperCase();
      status.amount = readString(payload.exactAmount, '--');
      status.currency = 'USD';
      status.amountSource = 'ESTIMATE';
    }
    if (event.type === 'agent:checkout_total_read') {
      status.amount = readString(payload.amount, status.amount);
      status.currency = readString(payload.currency, status.currency);
      status.amountSource = readString(payload.source) === 'mock' ? 'ESTIMATE' : 'CHECKOUT';
    }
    const nextPhase = phaseFor(event.type);
    if (nextPhase) status.phase = nextPhase;
  }

  return status;
}

function presentEvent(event: AgentEvent): EventPresentation {
  const payload = event.payload;
  switch (event.type) {
    case 'agent:intent_parsed':
      return {
        label: 'Billing constraint surfaced',
        message: readString(payload.pricingNotice, 'Linear bills in monthly cycles.'),
        detail: `Original request · ${readNumber(payload.requestedDurationDays)} days · ${formatAmount(readString(payload.exactAmount), 'USD')} first-cycle preview`,
        tone: 'accent',
      };
    case 'agent:session_created':
      return {
        label: 'Prava session',
        message: 'Exact-amount payment session created.',
        detail: `Session ${shortId(readString(payload.sessionId))} · credentials not issued yet`,
        tone: 'default',
      };
    case 'agent:passkey_required':
      return {
        label: 'Human approval required',
        message: readString(payload.message, 'Approve this purchase with your passkey in the secure Prava window.'),
        detail: 'Face ID / Touch ID / device passkey · no approval is automated',
        tone: 'accent',
      };
    case 'agent:awaiting_card_entry':
      return {
        label: 'Secure card window',
        message: 'Prava is waiting for saved-card selection or sandbox card entry.',
        detail: 'Raw card details never enter Capsule',
        tone: 'muted',
      };
    case 'agent:token_issued':
      return {
        label: 'Token issued',
        message: 'Single-use network credential received and held in server memory.',
        detail: 'Merchant + exact amount scoped · sensitive values hidden',
        tone: 'inverse',
      };
    case 'agent:dom_step':
      return {
        label: `DOM / ${readString(payload.status, 'update')}`,
        message: humanize(readString(payload.step, 'checkout step')),
        detail: readString(payload.detail) || undefined,
        tone: readString(payload.status) === 'failed' ? 'error' : 'muted',
      };
    case 'agent:checkout_total_read':
      return {
        label: 'Checkout total',
        message: `${formatAmount(readString(payload.amount), readString(payload.currency))} read from the merchant page.`,
        detail: readString(payload.source) === 'mock' ? 'Mock preview amount' : 'This value locks the Prava session',
        tone: 'default',
      };
    case 'agent:renewal_required':
      return {
        label: 'Renewal decision',
        message: readString(payload.prompt, 'Monthly billing cycle ending — approve the next cycle?'),
        detail: 'No Prava session exists until explicit approval',
        tone: 'accent',
      };
    case 'agent:renewal_approved':
      return {
        label: 'Renewal approved',
        message: 'A fresh purchase run is starting from a new quote.',
        detail: 'Fresh Prava session + fresh passkey required',
        tone: 'inverse',
      };
    case 'agent:renewal_not_approved':
      return {
        label: 'Renewal not approved',
        message: 'Silence created no session, no token, and no merchant charge.',
        detail: 'No reusable payment credential was retained',
        tone: 'accent',
      }; case 'agent:complete':
      return {
        label: 'Complete',
        message: readString(payload.outcome, 'Run completed.'),
        detail: 'No reusable payment credential retained',
        tone: 'accent',
      };
    case 'agent:error':
      return {
        label: 'Run error',
        message: readString(payload.message, 'The run failed.'),
        detail: `Phase · ${humanize(readString(payload.phase, 'unknown'))}`,
        tone: 'error',
      };
    case 'agent:payment_result_polled':
      return {
        label: 'Prava poll',
        message: `Payment state: ${humanize(readString(payload.status, 'pending'))}.`,
        detail: `Attempt ${readNumber(payload.attempt)}`,
        tone: 'muted',
      };
    case 'agent:automation_mode':
      return {
        label: 'Run mode',
        message: `${readString(payload.mode, 'unknown').toUpperCase()} execution selected.`,
        tone: 'muted',
      };
    case 'agent:dry_run_complete':
      return {
        label: 'Dry-run stop',
        message: 'Quote and real Prava session verified. Purchase was not submitted.',
        detail: formatAmount(readString(payload.amount), readString(payload.currency)),
        tone: 'accent',
      };
    case 'agent:screenshot_saved':
      return {
        label: 'Proof captured',
        message: 'Checkout result screenshot saved by the backend.',
        tone: 'default',
      };
    default:
      return {
        label: humanize(event.type.replace('agent:', '')),
        message: genericMessage(payload),
        tone: 'muted',
      };
  }
}

function latestRenewalMoment(events: AgentEvent[]): AgentEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.type === 'agent:renewal_not_approved') return event;
    if (event.type === 'agent:renewal_approved') return undefined;
    if (event.type === 'agent:renewal_required') return event;
  }
  return undefined;
}
function isApprovalPending(events: AgentEvent[]): boolean {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const type = events[index]?.type;
    if (type === 'agent:passkey_required') return true;
    if (type === 'agent:token_issued' || type === 'agent:complete' || type === 'agent:error') return false;
  }
  return false;
}

function phaseFor(type: AgentEventType): string | undefined {
  const phases: Partial<Record<AgentEventType, string>> = {
    'agent:intent_parsed': 'INTENT READY',
    'agent:checkout_total_read': 'TOTAL READ',
    'agent:session_created': 'SESSION LIVE',
    'agent:awaiting_card_entry': 'CARD ENTRY',
    'agent:passkey_required': 'APPROVAL',
    'agent:token_issued': 'TOKEN READY',
    'agent:dom_step': 'AUTOMATING',
    'agent:dry_run_complete': 'DRY RUN DONE',
    'agent:complete': 'COMPLETE',
    'agent:renewal_required': 'RENEWAL DECISION',
    'agent:renewal_approved': 'RENEWAL APPROVED',
    'agent:renewal_not_approved': 'NO RENEWAL',
    'agent:error': 'FAILED',
  };
  return phases[type];
}

function formatAmount(amount: string, currency: string): string {
  if (!amount || amount === '--') return '--';
  if (currency === 'USD') return `$${amount} USD`;
  return `${currency ? `${currency} ` : ''}${amount}`;
}

function genericMessage(payload: Record<string, unknown>): string {
  const status = readString(payload.status);
  const action = readString(payload.action);
  const message = readString(payload.message);
  if (message) return message;
  if (status) return `Status: ${humanize(status)}.`;
  if (action) return `${humanize(action)} required.`;
  return 'Agent state updated.';
}

function humanize(value: string): string {
  if (!value) return 'Update';
  const result = value.replace(/[_-]+/g, ' ').trim();
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function shortId(value: string): string {
  if (!value) return 'pending';
  return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-5)}` : value;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}
