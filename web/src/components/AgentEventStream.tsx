'use client';

import { useEffect, useState } from 'react';
import {
  AGENT_EVENT_TYPES,
  type AgentEvent,
  type AgentEventType,
} from '@/lib/agent-events';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function AgentEventStream({ runId }: { runId?: string }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!runId) {
      setEvents([]);
      setConnected(false);
      return;
    }

    const stream = new EventSource(
      `${API_URL}/api/agent/stream?runId=${encodeURIComponent(runId)}`,
    );

    const handlers = new Map<
      AgentEventType,
      (event: MessageEvent<string>) => void
    >();

    for (const type of AGENT_EVENT_TYPES) {
      const handler = (message: MessageEvent<string>) => {
        const event = JSON.parse(message.data) as AgentEvent;
        setEvents((current) => {
          if (current.some((item) => item.id === event.id)) return current;
          return [...current, event].slice(-50);
        });
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

  return (
    <section className="rounded-[2rem] border border-ink/10 bg-ink p-6 text-paper shadow-card">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-paper/50">
            Live execution
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Agent event stream</h2>
        </div>
        <span className="flex items-center gap-2 text-xs text-paper/65">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-paper/25'
            }`}
          />
          {connected ? 'Streaming' : runId ? 'Connecting' : 'Waiting'}
        </span>
      </div>

      <ol className="space-y-3">
        {events.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-paper/15 p-5 text-sm text-paper/45">
            Submit an intent to begin a run. Events will replay here even if the
            stream connects after parsing starts.
          </li>
        ) : (
          events.map((event) => (
            <li
              key={event.id}
              className="rounded-2xl border border-paper/10 bg-paper/[0.04] p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-paper">
                  {event.type}
                </span>
                <time className="text-xs text-paper/40">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </time>
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-paper/60">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
