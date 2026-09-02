import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentRun } from '../src/agent/runs.js';
import { scheduleRenewalDemo } from '../src/agent/renewal-demo.js';

test('silence at renewal creates no order, payment link, or charge attempt', async () => {
  const run = createAgentRun();
  run.intent = {
    skuId: 'sku_pro_seat',
    quantity: 5,
    requestedDurationDays: 30,
    resolvedAmountPaise: 600000,
    billingNote: '',
  };

  run.state.transition('intent_parsed');
  run.state.transition('quoting_checkout');
  run.state.transition('checkout_quoted');
  run.state.transition('order_created');
  run.state.transition('passkey_approved');
  run.state.transition('awaiting_payment');
  run.state.transition('webhook_confirmed');
  run.state.transition('complete');

  const before = run.context.events.recent(run.context.runId).length;
  scheduleRenewalDemo(run, { delayMs: 5, decisionWindowMs: 5 });
  await new Promise((resolve) => setTimeout(resolve, 30));

  const renewalEvents = run.context.events.recent(run.context.runId).slice(before);
  assert.deepEqual(
    renewalEvents.filter((event) => event.type === 'agent:order_created'),
    [],
  );
  assert.deepEqual(
    renewalEvents.filter((event) => event.type === 'agent:webhook_confirmed'),
    [],
  );

  const result = renewalEvents.find((event) => event.type === 'agent:renewal_not_approved');
  assert.ok(result);
  assert.deepEqual(result.payload, {
    resolvedAt: result.payload.resolvedAt,
    reason: 'no_user_approval',
    sessionCreated: false,
    tokenIssued: false,
    merchantChargeAttempted: false,
    reusableCredentialStored: false,
  });
  assert.equal(run.state.current, 'renewal_not_approved');
});
