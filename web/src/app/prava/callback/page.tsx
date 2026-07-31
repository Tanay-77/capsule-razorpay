import { PravaCallbackStatus } from '@/components/PravaCallbackStatus';

export default function PravaCallbackPage({
  searchParams,
}: {
  searchParams: { runId?: string };
}) {
  if (!searchParams.runId) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="text-3xl font-semibold">Missing payment run</h1>
        <p className="mt-4 text-ink/60">The callback URL does not contain a Capsule run ID.</p>
      </main>
    );
  }

  return <PravaCallbackStatus runId={searchParams.runId} />;
}
