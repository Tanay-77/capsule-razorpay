import Link from 'next/link';

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-[#050508] text-white font-sans flex flex-col relative overflow-hidden pb-32">
      {/* Top Navigation */}
      <header className="w-full max-w-[1400px] mx-auto grid grid-cols-3 items-center px-8 py-8 z-10 relative">
        <div className="flex items-center gap-3 justify-start">
          <Link href="/">
            <span className="text-xl font-bold tracking-tight text-white/90 hover:text-white transition-colors">Capsule</span>
          </Link>
        </div>
        <nav className="hidden md:flex items-center justify-center gap-10 text-sm font-medium text-white/70">
          <a href="http://localhost:3001/api/catalog" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Catalog</a>
          <Link href="/how-it-works" className="text-white transition-colors">How it works</Link>
          <Link href="/#dashboard" className="hover:text-white transition-colors">Audit Trail</Link>
        </nav>
        <div className="flex justify-end">
          <Link href="/store" className="bg-white text-black px-5 py-2 rounded-full hover:bg-white/90 transition-colors text-sm font-semibold">Browse Store</Link>
        </div>
      </header>

      {/* Content */}
      <div className="w-full max-w-4xl mx-auto px-8 mt-16 relative z-10">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-br from-white to-white/40">
          How Capsule Works
        </h1>
        <p className="text-xl text-white/50 font-medium tracking-wide mb-20 max-w-2xl leading-relaxed">
          The autonomous agent for B2B SaaS provisioning and payments. From natural language to fully provisioned infrastructure in seconds.
        </p>

        <div className="space-y-12">
          {/* Step 1 */}
          <div className="group flex flex-col md:flex-row gap-6 md:gap-12 items-start p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all duration-500">
            <div className="flex-shrink-0 w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-2xl group-hover:scale-110 transition-transform duration-500">
              1
            </div>
            <div>
              <h3 className="text-2xl font-semibold mb-3 tracking-tight text-white/90">Intent Parsing</h3>
              <p className="text-white/50 leading-relaxed">
                The user describes what they want in natural language (e.g., "I need 3 Pro seats"). Capsule's LLM agent analyzes the request, maps it against the live merchant catalog, and extracts the exact SKU, quantity, and price, applying any strict billing constraints automatically.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="group flex flex-col md:flex-row gap-6 md:gap-12 items-start p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all duration-500">
            <div className="flex-shrink-0 w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-2xl group-hover:scale-110 transition-transform duration-500">
              2
            </div>
            <div>
              <h3 className="text-2xl font-semibold mb-3 tracking-tight text-white/90">Quotation & Passkey</h3>
              <p className="text-white/50 leading-relaxed">
                The agent quotes the exact final total. Once quoted, the user approves the purchase using a frictionless passkey check. No need to fill out endless credit card forms—identity and intent are verified instantly.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="group flex flex-col md:flex-row gap-6 md:gap-12 items-start p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all duration-500">
            <div className="flex-shrink-0 w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-2xl group-hover:scale-110 transition-transform duration-500">
              3
            </div>
            <div>
              <h3 className="text-2xl font-semibold mb-3 tracking-tight text-white/90">Razorpay Link Generation</h3>
              <p className="text-white/50 leading-relaxed">
                A secure Razorpay Payment Link is generated dynamically by the backend. It's configured with a tight expiry window to ensure security, and instantly popped open for the user to complete checkout.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="group flex flex-col md:flex-row gap-6 md:gap-12 items-start p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all duration-500">
            <div className="flex-shrink-0 w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-2xl group-hover:scale-110 transition-transform duration-500">
              4
            </div>
            <div>
              <h3 className="text-2xl font-semibold mb-3 tracking-tight text-white/90">Webhook & Fulfillment</h3>
              <p className="text-white/50 leading-relaxed">
                Once the payment is successful, Razorpay fires a webhook back to the server. The agent intercepts this confirmation, rechecks the amount paid, and completes the provisioning loop in the background. Fully autonomous.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
