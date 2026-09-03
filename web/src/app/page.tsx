'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AgentEventStream } from '@/components/AgentEventStream';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
type AutomationMode = 'mock' | 'dry-run' | 'real';

interface ApiResponse {
  runId?: string;
  error?: string;
}

const MODES: Array<{ value: AutomationMode; label: string; note: string }> = [
  { value: 'mock', label: 'MOCK', note: 'No browser or payment network' },
  { value: 'dry-run', label: 'DRY', note: 'Real quote + Razorpay Order' },
  { value: 'real', label: 'REAL', note: 'Can submit a sandbox purchase' },
];

export default function HomePage() {
  const [input, setInput] = useState('Provision 1 Basic seat for a 10-day QA sprint, budget capped at ₹1000');
  const [mode, setMode] = useState<AutomationMode>('mock');
  const [runId, setRunId] = useState<string>();
  const [merchantId, setMerchantId] = useState('capsule-demo-store');
  const [renewalDemoSeconds, setRenewalDemoSeconds] = useState(90);
  const [renewalDecisionSeconds, setRenewalDecisionSeconds] = useState(12);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const returnedRunId = new URLSearchParams(window.location.search).get('runId');
    if (returnedRunId) setRunId(returnedRunId);
  }, []);

  async function submitIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim() || submitting) return;

    setSubmitting(true);
    setError(undefined);
    setRunId(undefined);

    try {
      const intentResponse = await fetch(`${API_URL}/api/agent/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim(), merchantId }),
      });
      const intent = (await intentResponse.json()) as ApiResponse;
      if (intent.runId) setRunId(intent.runId);
      if (!intentResponse.ok || !intent.runId) {
        throw new Error(intent.error ?? 'Unable to parse the intent');
      }

      const provisionResponse = await fetch(`${API_URL}/api/agent/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: intent.runId,
          mode,
          renewalDemoSeconds,
          renewalDecisionSeconds,
        }),
      });
      const provision = (await provisionResponse.json()) as ApiResponse;
      if (!provisionResponse.ok) {
        throw new Error(provision.error ?? 'Unable to start provisioning');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b-4 border-ink">
        <div className="mx-auto flex max-w-[1500px] items-stretch justify-between px-4 sm:px-7">
          <div className="flex items-center border-x-4 border-ink px-4 py-4 sm:px-6">
            <span className="text-xl font-black uppercase tracking-[-0.06em] sm:text-2xl">Capsule</span>
            <span className="ml-3 bg-signal px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em]">Sandbox</span>
          </div>
          <div className="hidden items-center border-r-4 border-ink px-6 text-[10px] font-bold uppercase tracking-[0.18em] text-ink/60 sm:flex">
            Quote → approve → one-time pay
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-7 sm:py-7">
        <section className="border-4 border-ink bg-paper">
          <div className="grid border-b-2 border-ink lg:grid-cols-[11rem_1fr]">
            <div className="border-b-2 border-ink bg-ink px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-paper lg:border-b-0 lg:border-r-2 lg:border-paper">
              Purchase intent
            </div>
            <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink/55">
              Natural language becomes an exact, merchant-scoped checkout
            </div>
          </div>

          <form onSubmit={submitIntent}>
            <div className="border-b-2 border-ink p-4 sm:p-5">
              <div className="border-2 border-ink bg-paper transition-shadow focus-within:shadow-[6px_6px_0_#11120f]">
                <label className="sr-only" htmlFor="intent">Command Capsule agent</label>
                <textarea
                  autoFocus
                  className="min-h-32 w-full resize-none bg-transparent px-5 py-5 text-base font-bold leading-7 outline-none placeholder:text-ink/30 sm:text-lg"
                  id="intent"
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  value={input}
                  placeholder="Ask Capsule to provision software for your team…"
                />
                <div className="flex items-center justify-between border-t-2 border-ink px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 bg-signal" aria-hidden="true" />
                    <span className="text-[10px] font-black uppercase tracking-[0.16em]">Capsule agent</span>
                    <span className="hidden text-[9px] font-bold uppercase tracking-[0.1em] text-ink/45 sm:inline">Ctrl + Enter to send</span>
                  </div>
                  <button
                    aria-label="Send command to Capsule"
                    className="flex h-12 w-12 items-center justify-center border-2 border-ink bg-signal text-2xl font-black transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink/40"
                    disabled={submitting || !input.trim()}
                    type="submit"
                  >
                    {submitting ? <span className="text-sm">…</span> : <span aria-hidden="true">↑</span>}
                  </button>
                </div>
              </div>
            </div>
            <div className="grid border-b-2 border-ink sm:grid-cols-2">
              <label className="grid grid-cols-[1fr_auto] items-center gap-4 border-b-2 border-ink px-4 py-3 sm:border-b-0 sm:border-r-2">
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.16em]">Billing-cycle simulation</span>
                  <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.08em] text-ink/50">30 days compressed to 5–600 seconds</span>
                </span>
                <input
                  className="w-20 border-2 border-ink bg-paper px-2 py-2 text-right text-sm font-black outline-none focus:bg-signal"
                  min={5}
                  max={600}
                  onChange={(event) => setRenewalDemoSeconds(Number(event.target.value))}
                  type="number"
                  value={renewalDemoSeconds}
                />
              </label>
              <label className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3">
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.16em]">Silence proof window</span>
                  <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.08em] text-ink/50">Resolve unanswered after 3–120 seconds</span>
                </span>
                <input
                  className="w-20 border-2 border-ink bg-paper px-2 py-2 text-right text-sm font-black outline-none focus:bg-signal"
                  min={3}
                  max={120}
                  onChange={(event) => setRenewalDecisionSeconds(Number(event.target.value))}
                  type="number"
                  value={renewalDecisionSeconds}
                />
              </label>
            </div>
            
            <div className="grid border-b-2 border-ink sm:grid-cols-2">
              <label className="grid grid-cols-[1fr_auto] items-center gap-4 border-b-2 border-ink px-4 py-3 sm:border-b-0 sm:border-r-2">
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-[0.16em]">Merchant</span>
                  <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.08em] text-ink/50">Simulated catalog</span>
                </span>
                <select
                  className="w-48 border-2 border-ink bg-paper px-2 py-2 text-right text-sm font-black outline-none focus:bg-signal"
                  onChange={(event) => setMerchantId(event.target.value)}
                  value={merchantId}
                >
                  <option value="capsule-demo-store">Capsule Store</option>
                  <option value="cloudops-hosting">CloudOps Hosting</option>
                </select>
              </label>
              <div className="hidden sm:block"></div>
            </div>

            <div className="grid sm:grid-cols-3">
              {MODES.map((item, index) => (
                <button
                  className={`min-h-20 border-b-2 border-ink px-4 py-3 text-left transition-colors last:border-b-0 sm:border-b-0 ${index < MODES.length - 1 ? 'sm:border-r-2' : ''} ${mode === item.value ? 'bg-ink text-paper' : 'bg-paper hover:bg-signal'}`}
                  key={item.value}
                  onClick={() => setMode(item.value)}
                  type="button"
                  aria-pressed={mode === item.value}
                >
                  <span className="block text-xs font-black tracking-[0.16em]">[{mode === item.value ? 'X' : ' '}] {item.label}</span>
                  <span className="mt-2 block text-[9px] font-bold uppercase tracking-[0.08em] opacity-55">{item.note}</span>
                </button>
              ))}
            </div>
          </form>
        </section>

        {error ? (
          <div className="mt-4 border-4 border-signal bg-ink px-5 py-4 text-sm font-bold text-signal" role="alert">
            ERROR / {error}
          </div>
        ) : null}

        <div className="mt-5">
          <AgentEventStream runId={runId} onRenewalRunStarted={setRunId} />
        </div>

        <footer className="grid border-x-4 border-b-4 border-ink text-[9px] font-black uppercase tracking-[0.14em] sm:grid-cols-3">
          <p className="border-b-2 border-ink px-4 py-3 sm:border-b-0 sm:border-r-2">01 / Actual total read before order</p>
          <p className="border-b-2 border-ink px-4 py-3 sm:border-b-0 sm:border-r-2">02 / Passkey stays human-controlled</p>
          <p className="px-4 py-3">03 / No persistent merchant card</p>
        </footer>
      </div>
    </main>
  );
}
