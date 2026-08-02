# Capsule

Capsule is an AI purchasing agent that provisions software without giving the agent permanent access to a company card.

A user can type:

> Provision one Linear Basic seat for a 10-day QA sprint.

Capsule explains that Linear has a monthly billing minimum, reads the real checkout total, asks the user to approve through Prava, and completes the purchase with a single-use payment credential.

## What it demonstrates

- Natural language to a validated purchase intent
- Honest handling of merchant billing constraints
- Real amount and currency read from Linear checkout
- Human passkey approval through Prava
- Single-use, merchant-scoped payment credentials
- Automated Linear checkout with Playwright
- Live agent logs through Server-Sent Events (SSE)
- A renewal demo where no approval creates no new payment

## Flow

```text
User request
  -> Parse intent
  -> Open Linear and read the real total
  -> Create an exact-amount Prava session
  -> User approves with a passkey
  -> Receive a single-use token
  -> Recheck the Linear total
  -> Complete checkout
  -> Stream the result to the Capsule UI
```

Capsule never receives the user's raw card number. The Prava secret key stays on the Express server.

## Billing behavior

Linear does not sell a 10-day subscription. Capsule keeps the original 10-day sprint request but explains that the purchase requires one monthly billing cycle.

The parser's amount is only a preview. The amount and currency shown on Linear's real checkout page are what Capsule sends to Prava.

## Stack

- Next.js 14, TypeScript, and Tailwind CSS
- Express and TypeScript
- OpenAI Responses API and Zod
- Playwright with a persistent Linear login
- Prava hosted checkout REST API
- Server-Sent Events

## Project structure

```text
web/                 Next.js frontend
server/src/agent/    Intent parser and provisioning flow
server/src/prava/    Prava REST client
server/src/events/   Typed event emitter
server/agent/        Tests and standalone runners
```

## Setup

Requirements: Node.js 20+, npm, Chrome, OpenAI and Prava sandbox keys, and a disposable Linear workspace.

Install dependencies:

```powershell
npm install
```

Create the server environment file:

```powershell
Copy-Item .env.example server/.env
```

Add your keys to `server/.env`:

```env
PRAVA_SECRET_KEY=sk_test_YOUR_KEY
PRAVA_PUBLISHABLE_KEY=pk_test_YOUR_KEY
PRAVA_CALLBACK_URL=https://YOUR_PUBLIC_WEB_ORIGIN/prava/callback
PRAVA_TEST_USER_ID=capsule_sandbox_user
PRAVA_TEST_USER_EMAIL=you@example.com
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
ENABLE_MOCK_AGENT=true
```

Never expose `PRAVA_SECRET_KEY` in the frontend or commit `.env` files.

Start Capsule:

```powershell
npm run dev
```

Open `http://localhost:3000`. Express runs on port `3001`.

## Modes

| Mode | Behavior |
|---|---|
| Mock | Simulates the full event flow without Playwright or Prava calls. |
| Dry | Reads the real Linear total and creates a Prava session, but does not purchase. |
| Real | Runs the complete sandbox approval and checkout flow. |

Set `ENABLE_MOCK_AGENT=false` and restart the backend before using Dry or Real mode.

## First Linear login

Capsule saves a separate Playwright browser profile so it does not automate login, MFA, or SSO.

```powershell
npm run linear:login
```

Log in manually, confirm Linear is open, and close the browser. Later runs reuse the saved session.

## HTTPS callback

Prava requires a public HTTPS callback URL. For local testing, expose port `3000` with a tunnel and update:

```env
PRAVA_CALLBACK_URL=https://YOUR_ACTIVE_HTTPS_URL/prava/callback
```

Quick-tunnel URLs are temporary. Restart the backend and create a fresh purchase run after changing this URL.

## Useful commands

```powershell
npm run typecheck        # Check TypeScript
npm run build            # Production build
npm run agent:unit       # Unit tests without OpenAI spend
npm run prava:health     # Check Prava sandbox access
npm run prava:test       # Standalone Prava lifecycle
npm run linear:login     # Save Linear login
npm run linear:dry-run   # Quote without purchase
npm run linear:real      # Real sandbox checkout
```

## Renewal demo

After a completed Mock or Real purchase, Capsule compresses one monthly billing cycle into a short timer and asks:

> Approve the next monthly cycle?

Approval starts a fresh quote, Prava session, and passkey flow. Silence creates no new session, token, or charge attempt.

For a short demo, use 8 seconds for the billing-cycle timer and 8 seconds for the silence window.

## Security

- Raw card details are entered only on Prava's hosted page.
- Payment credentials are not sent through SSE or rendered in the browser.
- Capsule verifies the checkout total again before confirmation.
- Secrets remain on the Express server.

## Current limitations

- Linear automation can require updates when its UI changes.
- Runs, SSE history, and demo timers are stored in memory.
- Automatic "cancel at end of billing period" is not implemented yet.
- Production would require authentication, a database, durable jobs, and audit logs.

## Hackathon demo

Run Mock mode live for reliability, show the recorded successful Real checkout, and finish with the unanswered renewal screen: **NO APPROVAL / NO CHARGE**.