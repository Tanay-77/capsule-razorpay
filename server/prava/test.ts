import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { agentEvents } from '../src/events/AgentEventEmitter.js';
import { PravaHostedClient } from '../src/prava/hosted-client.js';
import type { PaymentResultResponse } from '../src/prava/types.js';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in server/.env`);
  return value;
}

function printResponse(
  label: string,
  response: unknown,
  attempt?: number,
): void {
  const suffix = attempt === undefined ? '' : ` (attempt ${attempt})`;
  console.log(`\n${label}${suffix}`);
  console.log(JSON.stringify(response, null, 2));
}

async function main(): Promise<void> {
  const runId = `prava_manual_${randomUUID()}`;
  const client = new PravaHostedClient({
    secretKey: requiredEnvironment('PRAVA_SECRET_KEY'),
    userId: process.env.PRAVA_TEST_USER_ID?.trim() || 'capsule_sandbox_user',
    userEmail: requiredEnvironment('PRAVA_TEST_USER_EMAIL'),
    callbackUrl: requiredEnvironment('PRAVA_CALLBACK_URL'),
    context: { runId, events: agentEvents },
  });

  console.log(`Manual sandbox run: ${runId}`);
  console.log('Creating a real Prava sandbox session...');

  const session = await client.createSession(
    'Capsule Sandbox Store',
    'https://example.com',
    '9.99',
    'Capsule Phase 1 lifecycle test',
  );
  printResponse('Create-session response', session);

  console.log('\nOpen this exact hosted URL in a browser:');
  console.log(session.iframe_url);
  console.log('\nComplete card entry, OTP/passkey, and the redirect.');
  console.log('Polling payment-result with backoff for up to 15 minutes...');

  const result = await client.pollPaymentResult(session.session_id, {
    onResponse: (response: PaymentResultResponse, attempt: number) => {
      printResponse('Payment-result response', response, attempt);
    },
  });

  const credentials = result.transactions.flatMap((transaction) =>
    transaction.line_items.map((lineItem) => ({
      txn_ref_id: lineItem.txn_ref_id,
      token: lineItem.token,
      dynamic_cvv: lineItem.dynamic_cvv,
      expiry_month: lineItem.expiry_month,
      expiry_year: lineItem.expiry_year,
    })),
  );
  printResponse('Real one-time credentials', credentials);
  console.log(
    '\nDo not call reportStatus until the real merchant checkout has approved or declined.',
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nPrava sandbox lifecycle check failed: ${message}`);
  process.exitCode = 1;
});