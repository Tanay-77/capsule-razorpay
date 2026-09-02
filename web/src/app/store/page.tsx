import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Capsule Store Catalog',
};

interface ProductConstraint {
  type: 'min_quantity' | 'monthly_only' | 'no_proration';
  message: string;
  value?: number;
}

interface Product {
  id: string;
  name: string;
  description: string;
  priceInPaise: number;
  currency: string;
  billingType: 'one-time' | 'monthly';
  constraints: ProductConstraint[];
}

async function getCatalog(): Promise<Product[]> {
  // Try fetching from the backend server
  const res = await fetch('http://localhost:3001/api/catalog', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to fetch catalog from backend');
  }
  return res.json();
}

export default async function StorePage() {
  const products = await getCatalog().catch(() => [] as Product[]);

  return (
    <main className="min-h-screen bg-paper p-8 text-ink sm:p-12 md:p-24">
      <div className="mx-auto max-w-5xl">
        <header className="mb-12 border-b-4 border-ink pb-8">
          <h1 className="text-4xl font-black uppercase tracking-widest sm:text-6xl">
            Capsule Store
          </h1>
          <p className="mt-4 max-w-2xl text-lg font-bold uppercase tracking-wider text-ink/70">
            Demo Merchant Catalog. Ground truth for the IntentParser agent.
          </p>
        </header>

        {products.length === 0 ? (
          <div className="border-4 border-ink bg-signal p-8 text-center text-ink font-black uppercase tracking-widest">
            Failed to load catalog. Is the backend running?
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex flex-col border-4 border-ink bg-paper p-6 transition-transform hover:-translate-y-1 hover:translate-x-1 hover:shadow-[4px_4px_0_0_#1a1a1a]"
              >
                <div className="mb-4">
                  <span className="inline-block bg-ink px-2 py-1 text-xs font-black uppercase tracking-widest text-paper">
                    {product.id}
                  </span>
                </div>
                <h2 className="mb-2 text-2xl font-black uppercase leading-tight">
                  {product.name}
                </h2>
                <p className="mb-6 flex-grow text-sm font-bold uppercase tracking-wider text-ink/70">
                  {product.description}
                </p>
                <div className="mb-6 flex items-baseline gap-2">
                  <span className="text-3xl font-black">
                    {product.currency === 'INR' ? '₹' : product.currency}
                    {(product.priceInPaise / 100).toLocaleString('en-IN')}
                  </span>
                  <span className="text-xs font-black uppercase tracking-widest text-ink/60">
                    / {product.billingType}
                  </span>
                </div>

                {product.constraints.length > 0 && (
                  <div className="mt-auto border-t-2 border-dashed border-ink/30 pt-4">
                    <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-ink/50">
                      Agent Constraints
                    </h3>
                    <ul className="space-y-2">
                      {product.constraints.map((c, i) => (
                        <li
                          key={i}
                          className="flex items-start text-xs font-bold uppercase tracking-wider text-alert"
                        >
                          <span className="mr-2 mt-0.5 shrink-0 bg-alert text-paper px-1 leading-none">!</span>
                          <span className="leading-tight">{c.message}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
