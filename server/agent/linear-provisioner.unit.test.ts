import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentRun } from '../src/agent/runs.js';
import { LinearProvisioner, parseTotalFromVisibleText, parseUserCountFromVisibleText, parseDisplayedMoneyFromVisibleText } from '../src/agent/linear-provisioner.js';

test('reads the labeled total rather than subtotal or tax', () => {
  const text = `Subtotal\n$40.00\nTax\n$6.20\nTotal due today\n$46.20`;
  assert.equal(parseTotalFromVisibleText(text), '46.20');
});

test('normalizes comma-separated displayed USD amounts', () => {
  assert.equal(parseTotalFromVisibleText('Total\nUSD $1,234.5'), '1234.50');
});
test('detects INR from the real Linear checkout total', () => {
  assert.deepEqual(
    parseDisplayedMoneyFromVisibleText('Subtotal\n\u20B91,007.85\nTax\n\u20B9181.42\nTotal\n\u20B91,189.27'),
    { amount: '1189.27', currency: 'INR' },
  );
});


test('reads Linear workspace user count when checkout has no quantity input', () => {
  assert.equal(parseUserCountFromVisibleText('Free plan\nUsers\n1\nManage'), 1);
  assert.equal(parseUserCountFromVisibleText('Order summary\n3 users\nTotal\n$36.00'), 3);
});
test('mock mode emits the real event path without browser or Prava calls', async () => {
  const previous = process.env.ENABLE_MOCK_AGENT;
  process.env.ENABLE_MOCK_AGENT = 'true';
  try {
    const run = createAgentRun();
    run.state.transition('intent_parsed');
    const provisioner = new LinearProvisioner();
    const result = await provisioner.provision(run, {
      platform: 'Linear',
      seatCount: 3,
      requestedDurationDays: 10,
      billingCadence: 'monthly',
      billingPeriodDays: 30,
      billablePeriodCount: 1,
      pricingNotice: 'Linear has a one-month minimum. This 10-day sprint requires one monthly billing cycle, estimated at $12.00 before tax and fees.',
      exactAmount: '12.00',
      tierName: 'Basic',
    }, 'real');

    assert.equal(result.mode, 'mock');
    assert.equal(run.state.current, 'complete');
    const types = run.context.events.recent(run.context.runId).map((event) => event.type);
    assert.ok(types.includes('agent:checkout_total_read'));
    assert.ok(types.includes('agent:session_created'));
    assert.ok(types.includes('agent:passkey_required'));
    assert.ok(types.includes('agent:token_issued'));
    assert.ok(types.includes('agent:complete'));
  } finally {
    if (previous === undefined) delete process.env.ENABLE_MOCK_AGENT;
    else process.env.ENABLE_MOCK_AGENT = previous;
  }
});
