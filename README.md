# Capsule

Capsule is a streaming-first purchasing-agent scaffold with a Next.js 14 web app and an Express TypeScript orchestration server.

## Phase 0 architecture

```text
intent parse
  -> POST /v1/sessions from Express (Bearer PRAVA_SECRET_KEY)
  -> redirect the user to Prava's hosted iframe_url verbatim
  -> card entry + passkey / issuer OTP on Prava and card-network pages
  -> Prava redirects to Capsule's HTTPS callback_url
  -> Express polls GET /v1/sessions/:id/payment-result
  -> one-time network token + dynamic CVV stay in server memory
  -> checkout automation uses the credential once
  -> POST /v1/sessions/:id/report-status with APPROVED or DECLINED
  -> renewal prompt at the end of the purchased period
```

Capsule does not mount the Prava SDK, collect card data, persist a card, or create an automatic expiry/renewal timer. Hosted mode is plain REST. The user explicitly completes card entry and card-network verification on Prava's secure page. Renewal requires another user-facing prompt.

## Hosted callback mechanics

The implementation follows the official [Create Session reference](https://docs.prava.space/api-reference/create-session.md) and [Integration Modes reference](https://docs.prava.space/sdk/integration-modes.md):

- Express sends `integration_type: "full_checkout"` and an HTTPS `callback_url` when creating the session.
- Capsule adds its non-sensitive `runId` to the callback URL before sending it to Prava. It does not assume Prava will append a session ID.
- The browser navigates to the returned `iframe_url` exactly as received. It does not rebuild the URL or append a session token.
- After card entry finishes, Prava redirects the user to `/prava/callback?runId=...`.
- The callback page acknowledges the redirect and asks Express to poll by the server-held session ID.
- One-time credentials are never returned to or rendered by the Next.js app.

Prava requires both `callback_url` and `purchase_context[0].merchant_details.url` to use HTTPS. The official sandbox API base URL is `https://sandbox.api.prava.space`.

## Project layout

- `web/` — Next.js 14 App Router, TypeScript, Tailwind, hosted redirect UI, callback page, and SSE event timeline.
- `server/src/agent/` — intent parser, run registry, and lifecycle state machine.
- `server/src/prava/` — thin REST client for create session, payment-result polling, and report-status.
- `server/src/events/` — centralized typed `AgentEventEmitter`.
- `server/src/automation/` — event-emitting boundary for later browser checkout steps.

## Streaming events

`GET /api/agent/stream?runId=<id>` streams typed events and replays recent events when the browser reconnects after hosted checkout:

- `agent:intent_parsed`
- `agent:session_created`
- `agent:awaiting_card_entry`
- `agent:callback_received`
- `agent:token_issued`
- `agent:dom_step`
- `agent:status_reported`
- `agent:complete`
- `agent:renewal_required`
- `agent:error`

Progress goes through this emitter rather than `console.log`.

## Environment

Copy the root example into `server/.env`:

```powershell
Copy-Item .env.example server/.env
```

Fill in the five values. `PRAVA_SECRET_KEY` is server-only. `PRAVA_PUBLISHABLE_KEY` is retained for account configuration/future embedded work but is not used by hosted mode.

If Express is not available at `http://localhost:3001` from the browser, create `web/.env.local` with its public HTTPS URL:

```env
NEXT_PUBLIC_API_URL=https://YOUR_PUBLIC_SERVER_URL
```

## Run locally

```powershell
npm install
npm run dev
```

Next.js runs on port 3000 and Express on port 3001. A real hosted sandbox flow cannot use `http://localhost:3000` as `callback_url`; expose/deploy the web app at HTTPS and start the flow from that HTTPS origin.

## Server endpoints

- `POST /api/agent/intent` — create a run and parse an intent.
- `GET /api/agent/stream` — SSE event stream.
- `POST /api/prava/create-session` — create one hosted Prava session for an intent run.
- `POST /api/prava/callback` — acknowledge the browser's return from Prava.
- `GET /api/prava/payment-result/by-run/:runId` — poll with the server-held session ID; returns only sanitized status.
- `POST /api/prava/report-status` — report the real checkout outcome and discard the in-memory one-time credential.

## Manual sandbox steps

1. Obtain sandbox keys and configure `server/.env`.
2. Use a public HTTPS deployment or tunnel for the web callback. If required, expose Express through HTTPS and configure `web/.env.local`.
3. Configure/allow the HTTPS domains in the Prava dashboard.
4. Start Capsule from its HTTPS origin and submit the purchase intent.
5. On Prava's hosted page, manually enter a card from the official [sandbox Test Cards](https://docs.prava.space/api-reference/test-cards.md) page.
6. Manually complete the real WebAuthn passkey/device prompt. If the sandbox issuer asks for an OTP, use the documented test OTP `456789`.
7. Return through the Prava callback and wait for `agent:token_issued`.
8. Later checkout automation must manually/actually determine whether the merchant charge was approved or declined, then call `report-status` accordingly.

Never paste card data into Capsule, environment files, logs, or source code. Enter it only on Prava's hosted card-entry page.

