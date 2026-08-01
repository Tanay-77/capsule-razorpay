import 'dotenv/config';
import { createAgentRun } from '../src/agent/runs.js';
import { LinearProvisioner } from '../src/agent/linear-provisioner.js';
import type { AutomationMode, PurchaseIntent } from '../src/agent/types.js';

const requestedMode: AutomationMode = process.argv.includes('--real') ? 'real' : 'dry-run';
const tier = process.env.LINEAR_TEST_TIER ?? 'Basic';
if (tier !== 'Free' && tier !== 'Basic' && tier !== 'Business') {
  throw new Error('LINEAR_TEST_TIER must be Free, Basic, or Business.');
}

const intent: PurchaseIntent = {
  platform: 'Linear',
  seatCount: positiveInteger('LINEAR_TEST_SEAT_COUNT', 1),
  durationDays: positiveInteger('LINEAR_TEST_DURATION_DAYS', 30),
  exactAmount: process.env.LINEAR_TEST_ESTIMATED_AMOUNT ?? '10.00',
  tierName: tier,
};

const run = createAgentRun();
const unsubscribe = run.context.events.subscribe((event) => {
  if (event.runId === run.context.runId) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
});

try {
  run.intent = intent;
  run.state.transition('intent_parsed');
  const result = await new LinearProvisioner().provision(run, intent, requestedMode);
  process.stdout.write(`${JSON.stringify({ runId: run.context.runId, result })}\n`);
} finally {
  unsubscribe();
}

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}
