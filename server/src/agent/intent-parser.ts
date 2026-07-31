import OpenAI from 'openai';
import type { AgentExecutionContext } from './context.js';
import type { PurchaseIntent } from './types.js';

const INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['purchase', 'renewal', 'unknown'] },
    merchant: { type: 'string' },
    product: { type: 'string' },
    amount: { type: 'string' },
    currency: { type: 'string' },
  },
  required: ['kind'],
} as const;

export async function parseIntent(
  context: AgentExecutionContext,
  input: string,
): Promise<PurchaseIntent> {
  let parsed: Omit<PurchaseIntent, 'raw'>;

  if (!process.env.OPENAI_API_KEY) {
    parsed = { kind: 'unknown' };
  } else {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'Extract a purchase or renewal intent. Never infer missing payment amounts or merchant details.',
        },
        { role: 'user', content: input },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'purchase_intent',
          strict: true,
          schema: INTENT_SCHEMA,
        },
      },
    });
    parsed = JSON.parse(response.output_text) as Omit<PurchaseIntent, 'raw'>;
  }

  const intent = { ...parsed, raw: input };
  context.events.publish(context.runId, 'agent:intent_parsed', {
    intent: intent.kind,
    merchant: intent.merchant,
    product: intent.product,
    amount: intent.amount,
    currency: intent.currency,
  });
  return intent;
}
