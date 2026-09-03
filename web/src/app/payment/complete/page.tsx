'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function PaymentCompletePage() {
  const searchParams = useSearchParams();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const runId = searchParams.get('runId');
    const paymentId = searchParams.get('razorpay_payment_id');
    const status = searchParams.get('razorpay_payment_link_status');

    if (!runId || !paymentId || status !== 'paid') return;

    // Notify the backend that payment completed — acts as a webhook fallback
    fetch(`${API_URL}/api/agent/${runId}/confirm_payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_payment_id: paymentId,
        razorpay_payment_link_id: searchParams.get('razorpay_payment_link_id'),
        razorpay_signature: searchParams.get('razorpay_signature'),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.processed) setConfirmed(true);
        else setError(data.reason ?? 'Payment not yet confirmed');
      })
      .catch((err) => setError(err.message));
  }, [searchParams]);

  return (
    <main className="grid min-h-screen place-items-center bg-paper text-ink">
      <div className="border-4 border-ink p-8 sm:p-12 text-center max-w-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-4 border-ink bg-signal">
          <svg className="h-8 w-8 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
            <path strokeLinecap="square" strokeLinejoin="miter" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-black uppercase tracking-widest sm:text-3xl">Payment Complete</h1>
        <p className="mt-4 text-sm font-bold uppercase tracking-wider text-ink/60">
          {confirmed
            ? 'Payment confirmed! Return to the main Capsule window to continue.'
            : error
              ? `Note: ${error}. The webhook may still process — return to the main window.`
              : 'Confirming payment with server…'}
        </p>
        <button
          onClick={() => window.close()}
          className="mt-8 border-2 border-ink bg-ink px-6 py-3 text-xs font-black uppercase tracking-widest text-paper hover:bg-signal hover:text-ink transition-colors"
        >
          Close window
        </button>
      </div>
    </main>
  );
}
