import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIntent } from '../src/agent/intent-parser.js';
import { createAgentRun } from '../src/agent/runs.js';

test('IntentParser resolves against Capsule Store Catalog', async (t) => {
  const timeout = 30000;

  await t.test(
    '1. Standard request (monthly constraint implicitly met)',
    { timeout },
    async () => {
      const run = createAgentRun();
      const intent = await parseIntent(run.context, 'Get me 3 Pro Plan seats for a month');
      
      assert.equal(intent.skuId, 'sku_pro_seat');
      assert.equal(intent.quantity, 5);
      assert.equal(intent.requestedDurationDays, 30);
      assert.equal(intent.resolvedAmountPaise, 600000); 
      assert.ok(
        intent.billingNote.toLowerCase().includes('minimum'),
        'billingNote should explain the min quantity adjustment',
      );
    }
  );

  await t.test(
    '2. Constraint violation (duration too short)',
    { timeout },
    async () => {
      const run = createAgentRun();
      const intent = await parseIntent(run.context, 'Get me 5 Basic Plan seats for a 10-day sprint');
      
      assert.equal(intent.skuId, 'sku_basic_seat');
      assert.equal(intent.quantity, 5);
      assert.equal(intent.requestedDurationDays, 10);
      assert.equal(intent.resolvedAmountPaise, 400000); 
      assert.ok(
        intent.billingNote.toLowerCase().includes('month') || intent.billingNote.toLowerCase().includes('30 days'),
        'billingNote should honestly disclose that a full month is charged',
      );
    }
  );

  await t.test(
    '3. One-time product',
    { timeout },
    async () => {
      const run = createAgentRun();
      const intent = await parseIntent(run.context, 'Need a 10k API pack');
      
      assert.equal(intent.skuId, 'sku_api_10k');
      assert.equal(intent.quantity, 1);
      assert.equal(intent.resolvedAmountPaise, 50000); 
      assert.ok(!intent.billingNote || intent.billingNote === '', 'billingNote should be empty for a clean request');
    }
  );

  await t.test(
    '4. Minimum quantity violation explicitly handled',
    { timeout },
    async () => {
      const run = createAgentRun();
      const intent = await parseIntent(run.context, '1 Pro Plan seat');
      
      assert.equal(intent.skuId, 'sku_pro_seat');
      assert.equal(intent.quantity, 5); 
      assert.equal(intent.resolvedAmountPaise, 600000);
      assert.ok(
        intent.billingNote.toLowerCase().includes('minimum'),
        'billingNote should explain the min quantity adjustment',
      );
    }
  );

  await t.test(
    '5. Ambiguous request',
    { timeout },
    async () => {
      const run = createAgentRun();
      await assert.rejects(
        parseIntent(run.context, 'Get me some seats'),
        /IntentParserValidationError/
      );
    }
  );
});
