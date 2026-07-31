'use client';

import { FormEvent, useState } from 'react';
import { AgentEventStream } from '@/components/AgentEventStream';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface IntentResponse {
  runId?: string;
  error?: string;
}

interface SessionResponse {
  hostedUrl?: string;
  error?: string;
}

export default function HomePage() {
  const [input, setInput] = useState(
    'Buy one month of the Linear Business plan for my test account.',
  );
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
      const intent = (await intentResponse.json()) as IntentResponse;
      if (!intentResponse.ok || !intent.runId) {
        throw new Error(intent.error ?? 'Unable to start the agent run');
      }
      setRunId(intent.runId);

      const sessionResponse = await fetch(`${API_URL}/api/prava/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: intent.runId,
          callbackUrl: `${window.location.origin}/prava/callback`,
          merchantName: 'Linear',
          merchantUrl: 'https://linear.app',
          description: 'Linear Business plan sandbox checkout',
          totalAmount: '9.99',
          currency: 'USD',
        }),
      });
      const session = (await sessionResponse.json()) as SessionResponse;
      if (!sessionResponse.ok || !session.hostedUrl) {
        throw new Error(session.error ?? 'Unable to create the Prava session');
      }

      window.location.assign(session.hostedUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
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
        <span className="rounded-full border border-ink/10 bg-white/60 px-4 py-2 text-xs font-semibold text-ink/60">
          Hosted Prava checkout
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[2.5rem] border border-white/70 bg-white/75 p-7 shadow-card backdrop-blur sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-signal">Intent to execution</p>
          <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.04] tracking-[-0.04em] sm:text-6xl">
            Approve the purchase on Prava’s hosted page.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-ink/60">
            Capsule creates one server-side session, redirects you to Prava for card entry and network verification, then resumes from the HTTPS callback without storing your card.
          </p>

          <form className="mt-10" onSubmit={submitIntent}>
            <label className="text-sm font-semibold" htmlFor="intent">What should Capsule buy?</label>
            <div className="mt-3 rounded-3xl border border-ink/10 bg-paper/60 p-2 focus-within:border-ink/30">
              <input
                className="w-full bg-transparent px-4 py-3 text-base outline-none"
                id="intent"
                onChange={(event) => setInput(event.target.value)}
                placeholder="Describe a purchase…"
                value={input}
              />
              <button
                className="w-full rounded-2xl bg-signal px-5 py-3.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={submitting || !input.trim()}
                type="submit"
              >
                {submitting ? 'Creating hosted session…' : 'Continue securely with Prava'}
              </button>
            </div>
          </form>

          {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
          <p className="mt-5 text-xs leading-5 text-ink/45">
            Prava requires an HTTPS callback. For sandbox testing, open this app through an HTTPS deployment or tunnel before starting.
          </p>
        </section>

        <AgentEventStream runId={runId} />
      </div>
    </main>
  );
}
