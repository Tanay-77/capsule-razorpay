'use client';

export default function PaymentCompletePage() {
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
          Razorpay has processed the test payment. You can safely close this tab and return to the main Capsule window to view the results.
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
