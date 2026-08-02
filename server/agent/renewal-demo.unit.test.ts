import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentRun } from '../src/agent/runs.js';
import { scheduleRenewalDemo } from '../src/agent/renewal-demo.js';

test('silence at renewal creates no session, token, or charge attempt', async () => {
  const run = createAgentRun();
  run.intent = {
    platform: 'Linear',
    seatCount: 1,
    requestedDurationDays: 10,
    billingCadence: 'monthly',
    billingPeriodDays: 30,
    billablePeriodCount: 1,
    pricingNotice: 'Linear has a one-month minimum. This 10-day sprint requires one monthly billing cycle, estimated at $12.00 before tax and fees.',
    exactAmount: '12.00',
    tierName: 'Basic',
  };

  run.state.transition('intent_parsed');
  run.state.transition('quoting_checkout');
  run.state.transition('checkout_quoted');
  run.state.transition('session_created');
  run.state.transition('awaiting_card_entry');
  run.state.transition('token_issued');
  run.state.transition('automating_checkout');
  run.state.transition('complete');

  const before = run.context.events.recent(run.context.runId).length;
  scheduleRenewalDemo(run, { delayMs: 5, decisionWindowMs: 5 });
  await new Promise((resolve) => setTimeout(resolve, 30));

  const renewalEvents = run.context.events.recent(run.context.runId).slice(before);
  assert.deepEqual(
    renewalEvents.filter((event) => event.type === 'agent:session_created'),
    [],
  );
  assert.deepEqual(
    renewalEvents.filter((event) => event.type === 'agent:token_issued'),
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
