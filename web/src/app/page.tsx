'use client';

import { FormEvent, useEffect, useState, useRef } from 'react';
import { AgentEventStream } from '@/components/AgentEventStream';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
type AutomationMode = 'mock' | 'dry-run' | 'real';

interface ApiResponse {
  runId?: string;
  error?: string;
}

export default function HomePage() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<AutomationMode>('mock');
  const [merchantId, setMerchantId] = useState('capsule-demo-store');
  const [runId, setRunId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [renewalDemoSeconds, setRenewalDemoSeconds] = useState(90);
  const [renewalDecisionSeconds, setRenewalDecisionSeconds] = useState(12);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedRunId = params.get('runId');
    if (returnedRunId) setRunId(returnedRunId);

    const intentParam = params.get('intent');
    if (intentParam) {
      setInput(intentParam);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
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
    <main className="min-h-screen bg-[#050508] text-white font-sans flex flex-col relative overflow-hidden">
      <div
        className="flex flex-col min-h-[100vh] w-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/landing.png')" }}
      >
        {/* Top Navigation matches reference */}
        <header className="w-full max-w-[1400px] mx-auto grid grid-cols-3 items-center px-8 py-8 z-10 relative">
          <div className="flex items-center gap-3 justify-start">
            <img src="/capsule-logo.png" alt="Capsule Logo" className="h-8 w-auto object-contain" />
            <span className="text-xl font-bold tracking-tight text-white/90">Capsule</span>
          </div>
          <nav className="hidden md:flex items-center justify-center gap-10 text-sm font-medium text-white/70">
            <a href="/store" className="hover:text-white transition-colors">Store</a>
            <a href={`${API_URL}/api/catalog`} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Catalog</a>
            <a href="#" className="hover:text-white transition-colors">Security</a>
            <a href="#dashboard" className="hover:text-white transition-colors">Audit Trail</a>
          </nav>
          <div className="flex justify-end">
            <a href="#" className="text-sm font-medium text-white/70 hover:text-white transition-colors">Dashboard</a>
          </div>
        </header>

        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-20 relative">
          <h1 className="text-[3rem] md:text-[4.5rem] font-medium tracking-tight mb-6 text-center leading-tight text-white">
            The AI Purchasing Agent
          </h1>
          <p className="text-center text-white/70 max-w-2xl text-lg md:text-[1.1rem] mb-14 leading-relaxed font-light">
          Capsule transforms natural language into secure, verifiable checkout flows.<br />
          Streamlined agentic purchasing with cryptographic passkey approvals.
        </p>

          {/* Glassmorphism Input Container */}
          <form
            onSubmit={submitIntent}
            className="w-full max-w-[52rem] bg-[#f0f4ff]/20 backdrop-blur-2xl border border-white/20 rounded-[2rem] p-6 pt-8 pb-5 shadow-2xl relative"
          >
            <textarea
              ref={textareaRef}
              autoFocus
              className="w-full bg-transparent resize-none text-white placeholder:text-white/50 text-xl outline-none min-h-[140px] leading-relaxed font-light"
              placeholder="e.g., Get me 3 Pro Plan seats and check if I need more API credits"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.currentTarget.form?.requestSubmit();
              }}
            />

            <div className="flex items-end justify-between mt-6">
              <div className="flex flex-wrap items-start gap-4">
                {/* Pill Selectors replacing the Android/iOS tags in the reference */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider pl-2">Merchant</label>
                  <div className="relative">
                    <select
                      value={merchantId}
                      title="Merchant Catalog"
                      onChange={(e) => setMerchantId(e.target.value)}
                      className="bg-white/10 hover:bg-white/20 text-white/90 border border-transparent hover:border-white/20 rounded-full pl-5 pr-10 py-2.5 text-sm outline-none transition-all appearance-none cursor-pointer font-medium"
                    >
                      <option value="capsule-demo-store" className="bg-slate-900 text-white">Capsule Store</option>
                      <option value="cloudops-hosting" className="bg-slate-900 text-white">CloudOps Hosting</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 pl-2 text-white/50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider pl-2">Mode</label>
                  <div className="relative">
                    <select
                      value={mode}
                      title="Automation Mode"
                      onChange={(e) => setMode(e.target.value as AutomationMode)}
                      className="bg-white/10 hover:bg-white/20 text-white/90 border border-transparent hover:border-white/20 rounded-full pl-5 pr-10 py-2.5 text-sm outline-none transition-all appearance-none cursor-pointer font-medium capitalize"
                    >
                      <option value="mock" className="bg-slate-900 text-white">Mock</option>
                      <option value="dry-run" className="bg-slate-900 text-white">Dry Run</option>
                      <option value="real" className="bg-slate-900 text-white">Real Mode</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 pl-2 text-white/50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider pl-2">Renewal window (s)</label>
                  <input
                    type="number"
                    title="Billing Cycle Demo (sec)"
                    className="bg-white/10 hover:bg-white/20 text-white/90 border border-transparent hover:border-white/20 rounded-full px-4 py-2.5 text-sm outline-none transition-all w-full text-center font-medium"
                    value={renewalDemoSeconds}
                    onChange={(e) => setRenewalDemoSeconds(Number(e.target.value))}
                    min={5}
                    max={600}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !input.trim()}
                className="bg-white hover:bg-white/90 text-black w-12 h-12 rounded-full transition-colors disabled:opacity-50 flex items-center justify-center shrink-0 ml-4 shadow-lg group"
                title="Generate"
              >
                {submitting ? (
                  <span className="w-2 h-2 bg-black rounded-full animate-ping"></span>
                ) : (
                  <svg className="w-5 h-5 opacity-90 group-hover:opacity-100 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"></path>
                  </svg>
                )}
              </button>
            </div>
          </form>

          <p className="mt-16 text-white/50 text-sm font-medium tracking-wide">
            <span className="inline-block w-1 h-1 rounded-full bg-white/50 mr-2 align-middle"></span>
            Launch app 10x faster
          </p>

          {error && (
            <div className="mt-8 bg-red-500/10 border border-red-500/20 text-red-200 px-6 py-3 rounded-2xl backdrop-blur-md font-medium text-sm">
              {error}
            </div>
          )}
        </div>

      </div>

      {/* Sleek Agent Dashboard rendered inline */}
      {runId && (
        <div id="dashboard" className="w-full max-w-[1400px] mx-auto px-4 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-700 relative z-20 scroll-mt-8">
          <header className="w-full flex items-center justify-between px-8 py-4 border border-white/20 border-b-0 bg-[#0f111a] rounded-t-3xl shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="font-medium text-white/90 tracking-wide">Capsule Live Dashboard</span>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
                className="text-white/50 hover:text-white transition-colors text-sm font-medium flex items-center gap-1"
              >
                &larr; Back to agent
              </button>
              <a href="/store" className="text-white/50 hover:text-white transition-colors text-sm font-medium flex items-center gap-1">
                Browse store &rarr;
              </a>
              <button
                onClick={() => setRunId(undefined)}
                className="text-white/50 hover:text-white transition-colors text-sm font-medium ml-4 border-l border-white/10 pl-4"
                title="Close Dashboard"
              >
                Close
              </button>
            </div>
          </header>
          <div className="w-full bg-[#0a0a0f] border border-white/20 rounded-b-3xl overflow-hidden shadow-2xl relative">
            <AgentEventStream runId={runId} onRenewalRunStarted={setRunId} />
          </div>
        </div>
      )}
    </main>
  );
}
