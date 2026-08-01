import assert from 'node:assert/strict';
import test from 'node:test';
import OpenAI from 'openai';
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

test('resolves the example with deterministic cent arithmetic', () => {
  assert.deepEqual(resolveLinearEstimate(baseExtraction), {
    platform: 'Linear',
    seatCount: 3,
    durationDays: 10,
    exactAmount: '10.00',
    tierName: 'Basic',
  });
});

test('uses current Business pricing', () => {
  assert.equal(
    resolveLinearEstimate({
      ...baseExtraction,
      seatCount: 5,
      durationDays: 30,
      requestedTier: 'Business',
      budgetCap: null,
    }).exactAmount,
    '80.00',
  );
});

test('rounds a two-week Basic estimate to cents', () => {
  assert.equal(
    resolveLinearEstimate({
      ...baseExtraction,
      seatCount: 1,
      durationDays: 14,
      requestedTier: 'Basic',
      budgetCap: null,
    }).exactAmount,
    '4.67',
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
    responses: {
      parse: async () => {
        calls += 1;
        return {
          output_parsed: calls === 1 ? null : baseExtraction,
        };
      },
    },
  } as unknown as OpenAI;
  const parser = new IntentParser({ client: fakeClient });
  const events = new AgentEventEmitter();
  const result = await parser.parse(
    { runId: 'retry_test', events },
    'Provision 3 seats on Linear for 10 days under $45',
  );

  assert.equal(calls, 2);
  assert.equal(result.exactAmount, '10.00');
  assert.equal(events.recent('retry_test').at(-1)?.type, 'agent:intent_parsed');
});
