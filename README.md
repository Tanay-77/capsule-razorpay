# Capsule

Capsule is an autonomous agent for B2B SaaS provisioning and payments. It turns any standard Razorpay merchant into a storefront that AI can understand and buy from.

A user can type a natural language request like:

> Get me 3 Pro Plan seats for CloudOps.

Capsule's LLM agent parses this request against the merchant's structured catalog, extracts the exact SKU, applies strict billing constraints (like minimum quantities or monthly pricing), and creates a secure Razorpay Payment Link. Once paid, a webhook triggers autonomous provisioning.

## Key Features (Hackathon Track 01)

- **Conversational Checkout**: Natural language to validated purchase intent.
- **Agent-Readable Catalog**: Exposes a structured JSON catalog that any AI agent can consume as ground truth (`/api/catalog`).
- **Autonomous Upsells**: The agent actively analyzes user intent and suggests higher-tier plans if applicable, regenerating the checkout dynamically.
- **Campaign Orchestrator (Renewals)**: Proactively handles expiring subscriptions with dynamic retention discounts.
- **Strict Audit Trail**: Every action is streamed live via Server-Sent Events (SSE) and is fully explainable.
- **Gated & Bounded**: Requires Passkey approval before creating payment links. Fails gracefully with mock fallbacks if the AI provider goes down.

## Flow

```text
User request (Natural Language)
  -> Parse intent via Gemini 
  -> Resolve against Merchant Catalog (JSON)
  -> Check constraints (Upsell suggested if applicable)
  -> Passkey approval (Capsule's WebAuthn gate)
  -> Create Razorpay Payment Link (tight expiry)
  -> User completes test-mode checkout on Razorpay
  -> Webhook confirms + amount rechecked
  -> Audit trail streams via SSE
  -> Renewal sequence at period end
```

## Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Express, TypeScript
- **AI**: Gemini 3.5 Flash Lite (`@google/genai`), Zod
- **Payments**: Razorpay Orders API + Payment Links API + Webhooks
- **Streaming**: Server-Sent Events (SSE)

## Setup

Requirements: Node.js 20+, npm, and Razorpay test-mode keys.

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Create `server/.env` and add your keys:
   ```env
   RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
   RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
   RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET
   GEMINI_API_KEY=YOUR_GEMINI_API_KEY
   ```
   *Note: Never expose `RAZORPAY_KEY_SECRET` in the frontend or commit `.env` files.*

3. **Start the app:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`. The Express server runs on port `3001`.

## Razorpay Webhook Setup

To test end-to-end payments:
1. Expose port `3001` with a tunnel (e.g., ngrok).
2. In the Razorpay Dashboard, create a webhook:
   - **Webhook URL**: `https://YOUR_PUBLIC_DOMAIN/api/razorpay/webhook`
   - **Secret**: Copy to `RAZORPAY_WEBHOOK_SECRET` in `server/.env`
   - **Active Events**: `payment_link.paid`, `order.paid`
3. Restart the backend.

## Security

- Payment happens entirely on Razorpay's hosted Payment Link page.
- Razorpay webhook signatures are strictly verified (HMAC SHA256).
- Webhook handler rechecks `amount_paid === order.amount` before confirming.
- Capsule never stores reusable payment credentials.