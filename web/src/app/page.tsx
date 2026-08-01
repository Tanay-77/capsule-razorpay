'use client';

import { FormEvent, useState } from 'react';
import { AgentEventStream } from '@/components/AgentEventStream';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
type AutomationMode = 'mock' | 'dry-run' | 'real';

interface ApiResponse {
  runId?: string;
  error?: string;
}

export default function HomePage() {
  const [input, setInput] = useState('Provision 3 seats on Linear Basic for a 10-day QA sprint, budget capped at $45');
  const [mode, setMode] = useState<AutomationMode>('mock');
  const [runId, setRunId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submitIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);

    try {
      const intentResponse = await fetch(`${API_URL}/api/agent/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const intent = (await intentResponse.json()) as ApiResponse;
      if (!intentResponse.ok || !intent.runId) throw new Error(intent.error ?? 'Unable to parse the intent');
      setRunId(intent.runId);

      const provisionResponse = await fetch(`${API_URL}/api/agent/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: intent.runId, mode }),
      });
      const provision = (await provisionResponse.json()) as ApiResponse;
      if (!provisionResponse.ok) throw new Error(provision.error ?? 'Unable to start provisioning');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 sm:px-8 lg:py-14">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-sm font-bold text-paper">C</span>
          <span className="font-semibold tracking-tight">Capsule</span>
        </div>
        <span className="rounded-full border border-ink/10 bg-white/60 px-4 py-2 text-xs font-semibold text-ink/60">Quote, then pay</span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2.5rem] border border-white/70 bg-white/75 p-7 shadow-card backdrop-blur sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-signal">Intent to execution</p>
          <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-6xl">Read Linear’s real total before creating Prava.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-ink/60">
            Capsule reuses a dedicated signed-in browser profile, reaches checkout without paying, reads the displayed total, and only then creates the exact-amount Prava session.
          </p>

          <form className="mt-10" onSubmit={submitIntent}>
            <label className="text-sm font-semibold" htmlFor="intent">What should Capsule buy?</label>
            <div className="mt-3 rounded-3xl border border-ink/10 bg-paper/60 p-2 focus-within:border-ink/30">
              <input className="w-full bg-transparent px-4 py-3 text-base outline-none" id="intent" onChange={(event) => setInput(event.target.value)} value={input} />
              <div className="grid grid-cols-3 gap-2 px-2 pb-2">
                {(['mock', 'dry-run', 'real'] as const).map((item) => (
                  <button
                    className={`rounded-xl px-3 py-2 text-xs font-semibold ${mode === item ? 'bg-ink text-paper' : 'border border-ink/10 bg-white text-ink/60'}`}
                    key={item}
                    onClick={() => setMode(item)}
                    type="button"
                  >
                    {item === 'dry-run' ? 'Dry run' : item[0].toUpperCase() + item.slice(1)}
                  </button>
                ))}
              </div>
              <button className="w-full rounded-2xl bg-signal px-5 py-3.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting || !input.trim()} type="submit">
                {submitting ? 'Starting…' : `Start ${mode === 'dry-run' ? 'dry run' : mode}`}
              </button>
            </div>
          </form>

          {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
          <p className="mt-5 text-xs leading-5 text-ink/45">
            Mock makes no browser or Prava calls. Dry run stops after the real DOM quote and Prava session creation. Real mode alone can submit payment.
          </p>
        </section>

        <AgentEventStream runId={runId} />
      </div>
    </main>
  );
}
