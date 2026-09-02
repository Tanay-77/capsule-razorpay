import 'dotenv/config';
import { parseIntent } from '../src/agent/intent-parser.js';
import { createAgentRun } from '../src/agent/runs.js';

const PROMPTS = [
  "Get me 3 Pro Plan seats for a month",
  "Get me 5 Basic Plan seats for a 10-day sprint",
  "Need a 10k API pack",
  "1 Pro Plan seat",
  "Get me some seats"
];

async function main() {
  const run = createAgentRun();
  
  for (const prompt of PROMPTS) {
    console.log(`\n=============================================`);
    console.log(`🗣️  PROMPT: "${prompt}"`);
    console.log(`=============================================`);
    try {
      const intent = await parseIntent(run.context, prompt);
      console.log(JSON.stringify(intent, null, 2));
    } catch (e: any) {
      console.log(`❌ ERROR: ${e.message}`);
    }
  }
}

main().catch(console.error);
