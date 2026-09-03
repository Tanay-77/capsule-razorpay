'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AGENT_EVENT_TYPES,
  type AgentEvent,
  type AgentEventType,
} from '@/lib/agent-events';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

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

      {isApprovalPending(events) ? (
        <PasskeyApprovalPanel runId={runId!} />
      ) : null}

      {isUpsellApprovalPending(events) ? (
        <PasskeyApprovalPanel runId={runId!} endpoint="approve_upsell" />
      ) : null}

      {latestUpsellDecision(events) ? (
        <UpsellDecisionPanel runId={runId!} event={latestUpsellDecision(events)!} />
      ) : null}

      {renewalMoment ? (
        <RenewalMomentPanel
          approving={renewalApproving}
          error={renewalError}
          event={renewalMoment}
          onApprove={() => void approveRenewal()}
        />
      ) : null}

      <AuditTrailPanel events={events} />

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
            {view.detail.startsWith('http') ? (
              <a href={view.detail} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                {view.detail}
              </a>
            ) : (
              view.detail
            )}
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
            No order exists yet. Approval starts a fresh quote, a fresh Razorpay Order, and a fresh passkey checkpoint.
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

function UpsellDecisionPanel({ runId, event }: { runId: string, event: AgentEvent }) {
  const [deciding, setDeciding] = useState(false);

  async function handleDecision(accepted: boolean) {
    if (!runId || deciding) return;
    setDeciding(true);
    try {
      await fetch(`${API_URL}/api/agent/${runId}/upsell_decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setDeciding(false);
    }
  }

  const { addOnName, priceInPaise } = event.payload;
  const price = typeof priceInPaise === 'number' ? `₹${(priceInPaise / 100).toFixed(2)}` : '';

  return (
    <div className="border-t-4 border-ink bg-signal px-5 py-5 text-ink" role="status">
      <p className="text-[10px] font-black uppercase tracking-[0.2em]">Add-on suggested</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xl font-black uppercase leading-tight sm:text-2xl">Add {readString(addOnName)} for {price}?</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink/65">This is an independent purchase with a separate order.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="border-4 border-ink bg-transparent px-6 py-4 text-sm font-black uppercase tracking-[0.12em] hover:bg-ink hover:text-signal disabled:opacity-50"
            onClick={() => void handleDecision(false)}
            disabled={deciding}
          >
            Decline
          </button>
          <button
            className="border-4 border-ink bg-paper px-6 py-4 text-sm font-black uppercase tracking-[0.12em] hover:bg-ink hover:text-paper disabled:opacity-50"
            onClick={() => void handleDecision(true)}
            disabled={deciding}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

function PasskeyApprovalPanel({ runId, endpoint = 'approve' }: { runId: string, endpoint?: 'approve' | 'approve_upsell' }) {
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string>();

  async function handleApprove() {
    if (!runId || approving) return;
    setApproving(true);
    setError(undefined);
    try {
      let wasRegistration = false;
      let credentialId = '';
      
      const statusRes = await fetch(`${API_URL}/api/webauthn/status`);
      const { isRegistered } = await statusRes.json();
      
      if (!isRegistered) {
        const optsRes = await fetch(`${API_URL}/api/webauthn/generate-registration-options`, { method: 'POST' });
        if (!optsRes.ok) throw new Error('Failed to fetch registration options');
        const opts = await optsRes.json();
        const attResp = await startRegistration({ optionsJSON: opts });
        const verifyRes = await fetch(`${API_URL}/api/webauthn/verify-registration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(attResp),
        });
        const verifyJson = await verifyRes.json();
        if (!verifyJson.verified) throw new Error('Registration failed');
        wasRegistration = true;
        credentialId = verifyJson.credentialId;
      } else {
        const optsRes = await fetch(`${API_URL}/api/webauthn/generate-authentication-options`, { method: 'POST' });
        if (!optsRes.ok) throw new Error('Failed to fetch authentication options');
        const opts = await optsRes.json();
        const asseResp = await startAuthentication({ optionsJSON: opts });
        const verifyRes = await fetch(`${API_URL}/api/webauthn/verify-authentication`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asseResp),
        });
        const verifyJson = await verifyRes.json();
        if (!verifyJson.verified) throw new Error('Authentication failed');
      }
      
      const approveRes = await fetch(`${API_URL}/api/agent/${runId}/${endpoint}`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wasRegistration, credentialId }),
      });
      if (!approveRes.ok) throw new Error('Agent approval failed');
    } catch (e) {
      console.error(e);
      setError((e as Error).message);
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="border-t-4 border-ink bg-signal px-5 py-5 text-ink" role="status">
      <p className="text-[10px] font-black uppercase tracking-[0.2em]">Passkey / human checkpoint</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xl font-black uppercase leading-tight sm:text-2xl">Approve checkout</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink/65">Capsule is paused. No checkout continues without you.</p>
        </div>
        <button
          className="border-4 border-ink bg-paper px-6 py-4 text-sm font-black uppercase tracking-[0.12em] hover:bg-ink hover:text-paper disabled:opacity-50"
          onClick={() => void handleApprove()}
          disabled={approving}
        >
          {approving ? 'Authenticating...' : 'Approve with passkey →'}
        </button>
      </div>
      {error && <p className="mt-4 text-sm font-bold text-red-700">{error}</p>}
    </div>
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
      status.merchant = (payload.merchantName as string)?.toUpperCase() || 'CAPSULE STORE';
      status.amount = typeof payload.resolvedAmountPaise === 'number' ? (payload.resolvedAmountPaise / 100).toFixed(2) : '--';
      status.currency = 'INR';
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
        message: readString(payload.billingNote, 'Store constraint applies.'),
        detail: `Original request · ${readNumber(payload.requestedDurationDays)} days · ₹${readNumber(payload.resolvedAmountPaise) / 100} exact total`,
        tone: 'accent',
      };
    case 'agent:order_created':
      return {
        label: 'Razorpay order',
        message: 'Exact-amount Razorpay Order created.',
        detail: `Order ${shortId(readString(payload.orderId))} · ₹${readNumber(payload.amountPaise) / 100} ${readString(payload.currency, 'INR')}`,
        tone: 'default',
      };
    case 'agent:payment_link_created':
      return {
        label: 'Payment link',
        message: 'Razorpay Payment Link created with tight expiry.',
        detail: readString(payload.shortUrl) || 'Link pending',
        tone: 'default',
      };
    case 'agent:awaiting_payment':
      return {
        label: 'Awaiting payment',
        message: 'Open the Payment Link to complete checkout on Razorpay.',
        detail: readString(payload.paymentLinkUrl) || undefined,
        tone: 'accent',
      };
    case 'agent:webhook_confirmed':
      return {
        label: 'Payment confirmed',
        message: 'Razorpay webhook confirmed payment. Amount rechecked.',
        detail: `Payment ${shortId(readString(payload.paymentId))} · ${readNumber(payload.amountPaidPaise)} paise`,
        tone: 'inverse',
      };
    case 'agent:passkey_required':
      return {
        label: 'Human approval required',
        message: readString(payload.message, 'Approve this exact-amount purchase with your passkey.'),
        detail: 'Face ID / Touch ID / device passkey · no approval is automated',
        tone: 'accent',
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
        detail: readString(payload.source) === 'mock' ? 'Mock preview amount' : 'This value locks the Razorpay Order amount',
        tone: 'default',
      };
    case 'agent:renewal_required':
      return {
        label: 'Renewal decision',
        message: readString(payload.prompt, 'Monthly billing cycle ending — approve the next cycle?'),
        detail: 'No Razorpay Order exists until explicit approval',
        tone: 'accent',
      };
    case 'agent:renewal_approved':
      return {
        label: 'Renewal approved',
        message: 'A fresh purchase run is starting from a new quote.',
        detail: 'Fresh Razorpay Order + fresh passkey required',
        tone: 'inverse',
      };
    case 'agent:renewal_not_approved':
      return {
        label: 'Renewal not approved',
        message: 'Silence created no session, no token, and no merchant charge.',
        detail: 'No reusable payment credential was retained',
        tone: 'accent',
      };
    case 'agent:upsell_suggested':
      return {
        label: 'Add-on Suggested',
        message: `You bought ${readString(payload.primarySkuId)}. Add ${readString(payload.addOnName)} for ₹${readNumber(payload.priceInPaise) / 100}?`,
        detail: 'Accepting will start an independent checkout flow.',
        tone: 'accent',
      };
    case 'agent:upsell_accepted':
      return {
        label: 'Add-on Accepted',
        message: 'Proceeding to upsell checkout.',
        detail: 'Starting secondary Razorpay flow',
        tone: 'default',
      };
    case 'agent:upsell_declined':
      return {
        label: 'Add-on Declined',
        message: 'No add-on purchased.',
        detail: 'Skipping upsell',
        tone: 'muted',
      };
    case 'agent:upsell_order_created':
      return {
        label: 'Razorpay order (Upsell)',
        message: 'Exact-amount Razorpay Order created for add-on.',
        detail: `Order ${shortId(readString(payload.orderId))} · ₹${readNumber(payload.amountPaise) / 100} ${readString(payload.currency, 'INR')}`,
        tone: 'default',
      };
    case 'agent:upsell_passkey_required':
      return {
        label: 'Human approval required (Upsell)',
        message: readString(payload.message, 'Approve the add-on purchase with your passkey.'),
        detail: 'Face ID / Touch ID / device passkey',
        tone: 'accent',
      };
    case 'agent:upsell_payment_link_created':
      return {
        label: 'Razorpay link (Upsell)',
        message: 'Payment Link generated for add-on.',
        detail: `Link ${shortId(readString(payload.paymentLinkId))} · expires in 15m`,
        tone: 'default',
      };
    case 'agent:upsell_awaiting_payment':
      return {
        label: 'Awaiting payment (Upsell)',
        message: 'Open the Payment Link to complete the add-on checkout.',
        detail: readString(payload.paymentLinkUrl) || undefined,
        tone: 'inverse',
      };
    case 'agent:upsell_webhook_confirmed':
      return {
        label: 'Payment verified (Upsell)',
        message: 'Webhook received for add-on. Amount matches Order.',
        detail: `Payment ${shortId(readString(payload.paymentId))} · ${readNumber(payload.amountPaidPaise)} paise`,
        tone: 'inverse',
      };
    case 'agent:complete':
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

    case 'agent:automation_mode':
      return {
        label: 'Run mode',
        message: `${readString(payload.mode, 'unknown').toUpperCase()} execution selected.`,
        tone: 'muted',
      };
    case 'agent:dry_run_complete':
      return {
        label: 'Dry-run stop',
        message: 'Quote and Razorpay Order verified. Purchase was not submitted.',
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
    if (type === 'agent:awaiting_payment' || type === 'agent:webhook_confirmed' || type === 'agent:complete' || type === 'agent:error' || type === 'agent:upsell_suggested') return false;
  }
  return false;
}

function latestUpsellDecision(events: AgentEvent[]): AgentEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (event.type === 'agent:upsell_suggested') return event;
    if (event.type === 'agent:upsell_accepted' || event.type === 'agent:upsell_declined' || event.type === 'agent:complete' || event.type === 'agent:error') return undefined;
  }
  return undefined;
}

function isUpsellApprovalPending(events: AgentEvent[]): boolean {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const type = events[index]?.type;
    if (type === 'agent:upsell_passkey_required') return true;
    if (type === 'agent:upsell_awaiting_payment' || type === 'agent:upsell_webhook_confirmed' || type === 'agent:complete' || type === 'agent:error') return false;
  }
  return false;
}

function phaseFor(type: AgentEventType): string | undefined {
  const phases: Partial<Record<AgentEventType, string>> = {
    'agent:intent_parsed': 'INTENT READY',
    'agent:checkout_total_read': 'TOTAL READ',
    'agent:order_created': 'ORDER CREATED',
    'agent:passkey_required': 'APPROVAL',
    'agent:payment_link_created': 'LINK CREATED',
    'agent:awaiting_payment': 'AWAITING PAYMENT',
    'agent:webhook_confirmed': 'PAYMENT CONFIRMED',
    'agent:upsell_suggested': 'UPSELL',
    'agent:upsell_accepted': 'UPSELL',
    'agent:upsell_declined': 'UPSELL',
    'agent:upsell_order_created': 'UPSELL',
    'agent:upsell_passkey_required': 'UPSELL',
    'agent:upsell_payment_link_created': 'UPSELL',
    'agent:upsell_awaiting_payment': 'UPSELL',
    'agent:upsell_webhook_confirmed': 'UPSELL',
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

function extractAuditTrail(events: AgentEvent[]) {
  const trail = {
    orderId: '--',
    amount: '--',
    item: '--',
    passkeyTimestamp: '--',
    paymentLinkId: '--',
    webhookTimestamp: '--',
    webhookVerified: false,
    finalStatus: 'IN PROGRESS',
  };

  for (const event of events) {
    if (event.type === 'agent:intent_parsed') {
      trail.item = readString(event.payload.skuId, '--');
    }
    if (event.type === 'agent:order_created' || event.type === 'agent:upsell_order_created') {
      trail.orderId = readString(event.payload.orderId, '--');
      const amountPaise = readNumber(event.payload.amountPaise);
      trail.amount = amountPaise ? `₹${(amountPaise / 100).toFixed(2)} INR` : '--';
    }
    if (event.type === 'agent:payment_link_created' || event.type === 'agent:upsell_payment_link_created') {
      trail.passkeyTimestamp = new Date(event.timestamp).toLocaleTimeString([], { hour12: false });
      trail.paymentLinkId = readString(event.payload.paymentLinkId, '--');
    }
    if (event.type === 'agent:webhook_confirmed' || event.type === 'agent:upsell_webhook_confirmed') {
      trail.webhookTimestamp = new Date(event.timestamp).toLocaleTimeString([], { hour12: false });
      trail.webhookVerified = true;
    }
    if (event.type === 'agent:complete') {
      trail.finalStatus = 'COMPLETE';
    }
    if (event.type === 'agent:error') {
      trail.finalStatus = 'FAILED';
    }
    if (event.type === 'agent:dry_run_complete') {
      trail.finalStatus = 'DRY RUN';
    }
  }
  return trail;
}

function AuditTrailPanel({ events }: { events: AgentEvent[] }) {
  const trail = useMemo(() => extractAuditTrail(events), [events]);
  if (events.length === 0) return null;

  return (
    <div className="border-t-4 border-signal bg-paper text-ink p-4 sm:p-5">
      <h3 className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-signal">
        Audit Trail (Cryptographic & Financial Proof)
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 gap-y-6 text-xs font-bold uppercase tracking-[0.05em]">
        <div className="flex flex-col border-l-2 border-ink pl-3">
          <span className="text-[9px] opacity-60">Order ID</span>
          <span className="mt-1">{shortId(trail.orderId)}</span>
        </div>
        <div className="flex flex-col border-l-2 border-ink pl-3">
          <span className="text-[9px] opacity-60">Exact Amount</span>
          <span className="mt-1">{trail.amount}</span>
        </div>
        <div className="flex flex-col border-l-2 border-ink pl-3">
          <span className="text-[9px] opacity-60">Catalog Item</span>
          <span className="mt-1">{trail.item}</span>
        </div>
        <div className="flex flex-col border-l-2 border-ink pl-3">
          <span className="text-[9px] opacity-60">Final Status</span>
          <span className="mt-1">{trail.finalStatus}</span>
        </div>
        
        <div className="flex flex-col border-l-2 border-ink pl-3">
          <span className="text-[9px] opacity-60">Passkey Approved</span>
          <span className="mt-1">{trail.passkeyTimestamp}</span>
        </div>
        <div className="flex flex-col border-l-2 border-ink pl-3">
          <span className="text-[9px] opacity-60">Payment Link (Expiry 15m)</span>
          <span className="mt-1">{shortId(trail.paymentLinkId)}</span>
        </div>
        <div className="flex flex-col border-l-2 border-ink pl-3">
          <span className="text-[9px] opacity-60">Webhook Rcvd</span>
          <span className="mt-1">{trail.webhookTimestamp}</span>
        </div>
        <div className="flex flex-col border-l-2 border-ink pl-3">
          <span className="text-[9px] opacity-60">Signature Verified</span>
          <span className="mt-1">{trail.webhookVerified ? 'TRUE' : '--'}</span>
        </div>
      </div>
    </div>
  );
}
