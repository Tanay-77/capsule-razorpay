export default function PravaManualCallbackPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-signal">
        Prava sandbox callback
      </p>
      <h1 className="mt-5 text-3xl font-semibold">Card verification completed</h1>
      <p className="mt-4 leading-7 text-ink/60">
        You can return to the terminal. The standalone Phase 1 runner is polling
        Prava for the one-time token and dynamic CVV.
      </p>
      <p className="mt-6 rounded-2xl bg-paper p-4 text-sm text-ink/55">
        Capsule does not receive or display your raw card number on this page.
      </p>
    </main>
  );
}