# Capsule

Capsule is a streaming-first purchasing-agent scaffold with a Next.js 14 web app and an Express TypeScript orchestration server.

## Phase 0 architecture

```text
intent parse (provisional estimate only)
  -> persistent Playwright profile opens Linear billing (manual login once)
  -> configure seats/tier and read the stable displayed checkout total
  -> POST /v1/sessions with that exact decimal total (Bearer PRAVA_SECRET_KEY)
  -> user completes hosted card entry + card-network OTP/passkey
  -> callback, then poll until one-time token + dynamic CVV are available
  -> re-read Linear total; abort if it changed
  -> fill the one-time credentials and explicitly confirm checkout
  -> screenshot proof and POST report-status with APPROVED or DECLINED
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
- `server/src/agent/linear-provisioner.ts` — persistent Playwright quote/payment state machine; all steps emit typed events.

## Streaming events

`GET /api/agent/stream?runId=<id>` streams typed events and replays recent events when the browser reconnects after hosted checkout:

- `agent:intent_parsed`
- `agent:session_created`
- `agent:awaiting_card_entry`
- `agent:passkey_required`
- `agent:callback_received`
- `agent:token_issued`
- `agent:dom_step`
- `agent:status_reported`
- `agent:complete`
- `agent:renewal_required`
- `agent:error`

Progress goes through this emitter rather than `console.log`.

## Phase 4 terminal interface

The Next.js home screen is a Swiss-brutalist command terminal backed by the existing Express lifecycle rather than a separate demo data source. It posts the intent, starts provisioning, then subscribes to `GET /api/agent/stream?runId=...`. Express replays early parse events if the SSE connection opens after parsing has finished.

The terminal gives intent, session, DOM, token, completion, and error events distinct treatments. `agent:passkey_required` also opens a persistent high-contrast human-checkpoint panel until `agent:token_issued` arrives. The panel never displays or receives card credentials. The status strip shows the Linear merchant scope and provisional estimate, then replaces the estimate with the actual DOM checkout currency and amount when available. It deliberately has no countdown or sprint-expiry timer.

For frontend development, set mock mode in `server/.env` and run both apps:

```env
ENABLE_MOCK_AGENT=true
```

```powershell
npm run dev
```

Open `http://localhost:3000`. Mock mode still exercises the typed event emitter and SSE transport, but does not launch Playwright or call Prava. Set `ENABLE_MOCK_AGENT=false` and restart the server before a recorded dry or real run.
## Phase 2 intent parser

The `IntentParser` in `server/src/agent/intent-parser.ts` performs one OpenAI Responses API structured-output call under normal operation. It retries at most once, and only when the parsed data fails schema or business validation. The default is `gpt-5.6-terra` with low reasoning and a 350-token output ceiling; override it with `OPENAI_INTENT_MODEL` only after evaluating the same prompts.

The API returns exactly:

```json
{
  "platform": "Linear",
  "seatCount": 3,
  "durationDays": 10,
  "exactAmount": "10.00",
  "tierName": "Basic"
}
```

Despite its required field name, `exactAmount` is a provisional preview estimate. It is calculated deterministically in integer cents from the currently published yearly-billed Linear rates: Free `$0`, Basic `$10/user/month`, and Business `$16/user/month`. For sprint previews, Capsule uses a synthetic 30-day proration (`monthly price × seats × durationDays ÷ 30`). Linear does not sell arbitrary day-length subscriptions, and its actual billing/proration rules depend on billing cadence and seat changes. The LinearProvisioner reads the final displayed amount, including tax and fees, before creating the locked Prava session. The Phase 2 estimate is never passed to Prava.

Precision and spend safeguards:

- The model extracts facts only; it never performs price arithmetic.
- Missing seat count or duration fails instead of being guessed.
- An unnamed tier defaults to Basic only when an explicit budget cap can be checked; otherwise the request is ambiguous.
- Enterprise is rejected because its price is custom.
- Budget caps are constraints, never interpreted as purchase amounts.
- A normal parse makes one model call; validation permits one retry maximum.

Run deterministic tests without API spend:

```powershell
npm run agent:unit
```

Run the five-prompt live evaluation (normally five calls; an ambiguous prompt can consume its one retry):

```powershell
npm run agent:test
```

## Phase 1 sandbox lifecycle check

The standalone runner uses the real hosted REST lifecycle without touching Linear:

1. `createSession(merchantName, merchantUrl, amountDecimalString, description)` sends a secret-key-authenticated `POST /v1/sessions`. The amount is a decimal string, never cents.
2. It prints the complete create-session response and the returned `iframe_url`.
3. You open that exact URL and manually complete hosted card entry plus the card network's OTP/passkey step.
4. Prava redirects the browser to the public HTTPS `PRAVA_CALLBACK_URL`. The dedicated `/prava/manual-callback` page tells you to return to the terminal.
5. `pollPaymentResult(sessionId)` prints every response while backing off from 2 seconds to at most 8 seconds. It returns only at `awaiting_result`, after checking every line item has `token`, `dynamic_cvv`, `expiry_month`, and `expiry_year`.
6. `reportStatus(sessionId, txnRefId, outcome)` is available for the later real merchant checkout. Call it with `APPROVED` or `DECLINED` only after an actual checkout attempt; the standalone token test deliberately does not fabricate an outcome.

All lifecycle functions publish typed events through the centralized emitter. Poll progress uses `agent:payment_result_polled`; credentials themselves are never placed in SSE events.

Run the connectivity check first:

```powershell
npm run prava:health
```

Then run the manual lifecycle check from the repository root:

```powershell
npm run prava:test
```

The terminal prints a real one-time credential, so treat that terminal output as sensitive and do not save or share it. The runner times out after 15 minutes; create a fresh session if it expires.

Use only the currently published sandbox values, entered manually on Prava's hosted page:

- Card: `4622 9431 2313 7789`
- CVV: `757`
- Expiry: `12/27`
- Test OTP when prompted: `456789`

Do not put the test card or OTP in source code or environment files.

## Environment

Copy the root example into `server/.env`:

```powershell
Copy-Item .env.example server/.env
```

Fill in the API/application values plus the Phase 1 callback and test-user values. `PRAVA_SECRET_KEY` is server-only. `PRAVA_PUBLISHABLE_KEY` is retained for account configuration/future embedded work but is not used by hosted mode.

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
- `POST /api/agent/provision` — start `mock`, `dry-run`, or `real` provisioning. Direct Prava session creation is disabled so the quote step cannot be bypassed.
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


## Phase 3 Linear automation

Authentication is deliberately manual once. Capsule launches installed Chrome with Playwright's launchPersistentContext() and stores its isolated profile at ./.browser-data. On the first dry run, log into the disposable Linear workspace in that Chrome window; later runs reuse its cookies/local storage. Capsule never reads LINEAR_TEST_PASSWORD, and that variable has been removed from .env.example. Do not point Playwright at your normal Chrome profile. Google may reject OAuth inside an automated browser; on Linear's login page use **Continue with email** (magic link) or **Log in with passkey** instead.

The order is enforced by the state machine: intent_parsed -> quoting_checkout -> checkout_quoted -> session_created. The old direct /api/prava/create-session endpoint returns HTTP 410. A stable DOM total is read twice before Prava creation and again after token issuance and immediately before confirmation. If it changes, Capsule emits gent:checkout_total_changed, leaves the stale credential unused, and requires a fresh run.

Modes:

- ENABLE_MOCK_AGENT=true forces mock mode. It starts no browser and makes no Prava request, but emits the same event progression with short delays.
- dry-run uses the real persistent Linear UI, reads the real total, and creates the real sandbox Prava session, then stops before hosted card entry/token issuance/payment.
-
eal continues through manual hosted approval, token polling, Linear confirmation, screenshot proof under rtifacts/linear, and Prava status reporting. Use only in the disposable workspace.

Bootstrap the persistent session once in ordinary Chrome. This avoids Google/email providers rejecting Playwright automation during authentication:

```powershell
npm run linear:login
```

Log in manually, confirm Linear is open, then close that Chrome window so the profile is flushed. Never run `linear:login` and a Playwright mode at the same time because Chrome permits only one process per user-data directory.

Run the safe standalone dry run from the repository root:

`powershell
npm run linear:dry-run
`

A Chrome window opens. Complete Linear login/MFA manually if requested. The terminal prints typed events but never prints card credentials. Only after the dry run selectors and exact total are verified should you use:

`powershell
npm run linear:real
`

Current Linear documentation places billing at **Settings > Administration > Billing**. LINEAR_BILLING_URL defaults to https://linear.app/settings/billing; override it with the exact disposable-workspace billing URL if Linear redirects elsewhere. Because Linear can change its private app DOM, the automation uses accessible labels plus one retry/modal dismissal, then fails closed before payment if required controls or explicit success confirmation cannot be found.
