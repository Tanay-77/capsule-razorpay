'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentEventStream } from './AgentEventStream';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const CAPSULE_RETURN_URL = process.env.NEXT_PUBLIC_CAPSULE_RETURN_URL ?? 'http://localhost:3000';

type CallbackPhase = 'acknowledging' | 'polling' | 'ready' | 'failed';

interface PaymentStatusResponse {
  status?: string;
  credentialAvailable?: boolean;
  error?: string;
}

export function PravaCallbackStatus({ runId }: { runId: string }) {
  const [phase, setPhase] = useState<CallbackPhase>('acknowledging');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [error, setError] = useState<string>();
  const pollTimer = useRef<ReturnType<typeof setInterval>>();

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = undefined;
  }, []);

  useEffect(() => {
    if (window.location.origin !== new URL(CAPSULE_RETURN_URL).origin) {
      window.location.replace(
        `${CAPSULE_RETURN_URL}/prava/callback?runId=${encodeURIComponent(runId)}`,
      );
      return;
    }

    let active = true;

    const poll = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/prava/payment-result/by-run/${encodeURIComponent(runId)}`,
          { cache: 'no-store' },
        );
        const result = (await response.json()) as PaymentStatusResponse;
        if (!response.ok) throw new Error(result.error ?? 'Payment polling failed');
        if (!active) return;

        setPaymentStatus(result.status ?? 'pending');
        if (result.credentialAvailable) {
          setPhase('ready');
          stopPolling();
        } else if (result.status === 'failed') {
          setPhase('failed');
          setError('Prava reported that the hosted payment flow failed.');
          stopPolling();
        }
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Payment polling failed');
      }
    };

    const begin = async () => {
      try {
        const response = await fetch(`${API_URL}/api/prava/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId }),
        });
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error ?? 'Callback acknowledgement failed');
        }
        if (!active) return;

        setPhase('polling');
        await poll();
        pollTimer.current = setInterval(() => void poll(), 3_000);
      } catch (caught) {
        if (!active) return;
        setPhase('failed');
        setError(caught instanceof Error ? caught.message : 'Callback failed');
      }
    };

    void begin();
    return () => {
      active = false;
      stopPolling();
    };
  }, [runId, stopPolling]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = setTimeout(() => {
      window.location.replace(
        `${CAPSULE_RETURN_URL}/?runId=${encodeURIComponent(runId)}&paymentReturn=1`,
      );
    }, 700);
    return () => clearTimeout(timer);
  }, [phase, runId]);
  const copy: Record<CallbackPhase, { title: string; detail: string }> = {
    acknowledging: {
      title: 'Returning to Capsule…',
      detail: 'Acknowledging the hosted checkout callback.',
    },
    polling: {
      title: 'Waiting for the one-time credential',
      detail: `Prava status: ${paymentStatus}. Capsule polls every three seconds.`,
    },
    ready: {
      title: 'One-time credential received',
      detail: 'The credential remains server-side and is ready for checkout automation.',
    },
    failed: {
      title: 'The hosted flow needs attention',
      detail: error ?? 'An unknown callback error occurred.',
    },
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-10 sm:px-8 lg:py-16">
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[2.5rem] border border-white/70 bg-white/80 p-8 shadow-card backdrop-blur sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-signal">Prava callback</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">{copy[phase].title}</h1>
          <p className="mt-5 leading-7 text-ink/60">{copy[phase].detail}</p>
          <p className="mt-8 rounded-2xl bg-paper p-4 text-xs leading-5 text-ink/55">
            Run {runId}. No card number, network token, or dynamic CVV is rendered in the browser.
          </p>
          <a className="mt-6 inline-block text-sm font-semibold underline underline-offset-4" href="/">
            Return to Capsule
          </a>
        </section>
        <AgentEventStream runId={runId} />
      </div>
    </main>
  );
}
