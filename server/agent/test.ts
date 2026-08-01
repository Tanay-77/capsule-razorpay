import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { IntentParser } from '../src/agent/intent-parser.js';
import { agentEvents } from '../src/events/AgentEventEmitter.js';

const prompts = [
  'Provision 3 seats on Linear for a 10-day QA sprint, budget capped at $45',
  'Buy Linear Business for 5 engineers for 30 days',
  'Set up one Basic seat on Linear for two weeks',
  'Give our 4-person team Linear for a month, with a $50 maximum',
  'Set up Linear for our QA sprint',
] as const;

async function main(): Promise<void> {
  const parser = new IntentParser();
  const firstPrompt = Math.max(Number(process.env.INTENT_TEST_FROM ?? '1'), 1);
  console.log('Model: gpt-5.6-terra (low reasoning)');
  console.log('Maximum spend shape: 5 normal calls + at most 1 retry per validation failure');

  for (const [index, prompt] of prompts.entries()) {
    if (index + 1 < firstPrompt) continue;
    if (firstPrompt === 1 && index === 3) {
      console.log('Pausing 21 seconds for the configured 3 RPM limit...');
      await new Promise((resolve) => setTimeout(resolve, 21_000));
    }
    const context = {
      runId: `intent_test_${index + 1}_${randomUUID()}`,
      events: agentEvents,
    };
    console.log(`\n[${index + 1}] ${prompt}`);
    try {
      const intent = await parser.parse(context, prompt);
      console.log(JSON.stringify(intent, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ error: message }, null, 2));
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Intent parser test failed: ${message}`);
  process.exitCode = 1;
});
