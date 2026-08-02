'use client';

import { FormEvent, useState } from 'react';
import { AgentEventStream } from '@/components/AgentEventStream';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
type AutomationMode = 'mock' | 'dry-run' | 'real';

interface ApiResponse {
  runId?: string;
  error?: string;
}

const MODES: Array<{ value: AutomationMode; label: string; note: string }> = [
  { value: 'mock', label: 'MOCK', note: 'No browser or payment network' },
  { value: 'dry-run', label: 'DRY', note: 'Real quote + Prava session' },
  { value: 'real', label: 'REAL', note: 'Can submit a sandbox purchase' },
];

export default function HomePage() {
  const [input, setInput] = useState('Provision 3 seats on Linear Basic for a 10-day QA sprint, budget capped at $45');
  const [mode, setMode] = useState<AutomationMode>('mock');
  const [runId, setRunId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

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
        body: JSON.stringify({ input: input.trim() }),
      });
      const intent = (await intentResponse.json()) as ApiResponse;
      if (intent.runId) setRunId(intent.runId);
      if (!intentResponse.ok || !intent.runId) {
        throw new Error(intent.error ?? 'Unable to parse the intent');
      }

      const provisionResponse = await fetch(`${API_URL}/api/agent/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: intent.runId, mode }),
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
            <div className="flex items-start border-b-2 border-ink">
              <label className="border-r-2 border-ink bg-signal px-4 py-5 text-2xl font-black" htmlFor="intent" aria-label="Purchase command">
                &gt;
              </label>
              <textarea
                autoFocus
                className="min-h-28 w-full resize-none bg-transparent px-5 py-5 text-base font-bold leading-7 outline-none placeholder:text-ink/30 sm:text-lg"
                id="intent"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                value={input}
                placeholder="Tell Capsule what to provision…"
              />
            </div>

            <div className="grid lg:grid-cols-[1fr_auto]">
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
              <button
                className="min-h-20 border-t-2 border-ink bg-signal px-8 text-sm font-black uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink/40 lg:min-w-64 lg:border-l-2 lg:border-t-0"
                disabled={submitting || !input.trim()}
                type="submit"
              >
                {submitting ? 'Parsing…' : 'Execute ↵'}
              </button>
            </div>
          </form>
        </section>

        {error ? (
          <div className="mt-4 border-4 border-signal bg-ink px-5 py-4 text-sm font-bold text-signal" role="alert">
            ERROR / {error}
          </div>
        ) : null}

        <div className="mt-5">
          <AgentEventStream runId={runId} />
        </div>

        <footer className="grid border-x-4 border-b-4 border-ink text-[9px] font-black uppercase tracking-[0.14em] sm:grid-cols-3">
          <p className="border-b-2 border-ink px-4 py-3 sm:border-b-0 sm:border-r-2">01 / Actual total read before session</p>
          <p className="border-b-2 border-ink px-4 py-3 sm:border-b-0 sm:border-r-2">02 / Passkey stays human-controlled</p>
          <p className="px-4 py-3">03 / No persistent merchant card</p>
        </footer>
      </div>
    </main>
  );
}
