import assert from 'node:assert/strict';
import test from 'node:test';
import { GoogleGenAI } from '@google/genai';
import { IntentParser } from '../src/agent/intent-parser.js';
import {
  IntentParserValidationError,
  resolveLinearEstimate,
} from '../src/agent/linear-pricing.js';
import { AgentEventEmitter } from '../src/events/AgentEventEmitter.js';

const baseExtraction = {
  platform: 'Linear',
  seatCount: 3,
  durationDays: 10,
  requestedTier: null,
  budgetCap: '45',
  ambiguityReason: null,
} as const;

test('surfaces the monthly minimum without fake daily proration', () => {
  assert.deepEqual(resolveLinearEstimate(baseExtraction), {
    platform: 'Linear',
    seatCount: 3,
    requestedDurationDays: 10,
    billingCadence: 'monthly',
    billingPeriodDays: 30,
    billablePeriodCount: 1,
    pricingNotice: 'Linear has a one-month minimum. This 10-day sprint requires one monthly billing cycle, estimated at $36.00 before tax and fees.',
    exactAmount: '36.00',
    tierName: 'Basic',
  });
});

test('uses the monthly Business checkout preview', () => {
  assert.equal(
    resolveLinearEstimate({
      ...baseExtraction,
      seatCount: 5,
      durationDays: 30,
      requestedTier: 'Business',
      budgetCap: null,
    }).exactAmount,
    '100.00',
  );
});

test('charges one full Basic billing cycle for a two-week request', () => {
  assert.equal(
    resolveLinearEstimate({
      ...baseExtraction,
      seatCount: 1,
      durationDays: 14,
      requestedTier: 'Basic',
      budgetCap: null,
    }).exactAmount,
    '12.00',
  );
});

test('rejects a missing duration instead of guessing', () => {
  assert.throws(
    () => resolveLinearEstimate({ ...baseExtraction, durationDays: null }),
    IntentParserValidationError,
  );
});

test('retries exactly once after validation failure', async () => {
  let calls = 0;
  const fakeClient = {
    models: {
      generateContent: async () => {
        calls += 1;
        return {
          text: calls === 1 ? null : JSON.stringify(baseExtraction),
        };
      },
    },
  } as unknown as GoogleGenAI;
  const parser = new IntentParser({ client: fakeClient });
  const events = new AgentEventEmitter();
  const result = await parser.parse(
    { runId: 'retry_test', events },
    'Provision 3 seats on Linear for 10 days under $45',
  );

  assert.equal(calls, 2);
  assert.equal(result.exactAmount, '36.00');
  assert.equal(events.recent('retry_test').at(-1)?.type, 'agent:intent_parsed');
});
