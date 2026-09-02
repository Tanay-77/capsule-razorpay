import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentRun } from '../src/agent/runs.js';
import { StoreProvisioner } from '../src/agent/store-provisioner.js';

test('mock mode emits the real event path without browser or Razorpay calls', async () => {
  const previous = process.env.ENABLE_MOCK_AGENT;
  process.env.ENABLE_MOCK_AGENT = 'true';
  try {
    const run = createAgentRun();
    run.state.transition('intent_parsed');
    const provisioner = new StoreProvisioner();
    const result = await provisioner.provision(run, {
      skuId: 'sku_pro_seat',
      quantity: 5,
      requestedDurationDays: 30,
      resolvedAmountPaise: 600000,
      billingNote: '',
    }, 'real');

    assert.equal(result.mode, 'mock');
    assert.equal(run.state.current, 'complete');
    const types = run.context.events.recent(run.context.runId).map((event) => event.type);
    assert.ok(types.includes('agent:order_created'));
    assert.ok(types.includes('agent:passkey_required'));
    assert.ok(types.includes('agent:webhook_confirmed'));
    assert.ok(types.includes('agent:complete'));
  } finally {
    if (previous === undefined) delete process.env.ENABLE_MOCK_AGENT;
    else process.env.ENABLE_MOCK_AGENT = previous;
  }
});
