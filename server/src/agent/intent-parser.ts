import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { AgentExecutionContext } from './context.js';
import {
  IntentParserValidationError,
  resolveLinearEstimate,
} from './linear-pricing.js';
import type { PurchaseIntent } from './types.js';

const MODEL = 'gpt-5.6-terra';
const MAX_ATTEMPTS = 2;

const IntentExtractionSchema = z
  .object({
    platform: z.string().min(1),
    seatCount: z.number().int().positive().nullable(),
    durationDays: z.number().int().positive().nullable(),
    requestedTier: z.enum(['Free', 'Basic', 'Business', 'Enterprise']).nullable(),
    budgetCap: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .nullable(),
    ambiguityReason: z.string().min(1).nullable(),
  })
  .strict();

type IntentExtraction = z.infer<typeof IntentExtractionSchema>;

const SYSTEM_PROMPT = `Extract a Linear subscription purchase request.

Return only the structured fields. Do not calculate prices.
- platform: the named software platform.
- seatCount: explicit number of human seats, or null when absent.
- durationDays: explicit duration normalized to days (1 week = 7 days, 1 month = 30 days), or null when absent.
- requestedTier: an explicitly named Linear tier. If no tier is named, return null. Do not infer a tier from a budget.
- budgetCap: an explicitly stated USD cap as a decimal string without a currency symbol, or null.
- ambiguityReason: explain any missing seat count, duration, or unclear request; otherwise null.

Never turn a budget cap into a purchase amount. Never invent missing quantities.`;

export interface IntentParserOptions {
  client?: OpenAI;
  model?: string;
}

export class IntentParser {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: IntentParserOptions = {}) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!options.client && !apiKey) {
      throw new Error('OPENAI_API_KEY is required for intent parsing');
    }
    this.client = options.client ?? new OpenAI({ apiKey });
    this.model =
      options.model ?? process.env.OPENAI_INTENT_MODEL?.trim() ?? MODEL;
  }

  async parse(
    context: AgentExecutionContext,
    input: string,
  ): Promise<PurchaseIntent> {
    const normalizedInput = input.trim();
    if (!normalizedInput) throw new IntentParserValidationError('input is required');

    let validationFeedback: string | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        context.events.publish(context.runId, 'agent:intent_parse_attempt', {
          attempt,
          model: this.model,
          status: 'started',
        });
        const extraction = await this.extract(normalizedInput, validationFeedback);
        context.events.publish(context.runId, 'agent:intent_parse_attempt', {
          attempt,
          model: this.model,
          status: 'succeeded',
        });
        const intent = resolveLinearEstimate(extraction);
        context.events.publish(context.runId, 'agent:intent_parsed', {
          intent: 'purchase',
          platform: intent.platform,
          seatCount: intent.seatCount,
          durationDays: intent.durationDays,
          exactAmount: intent.exactAmount,
          tierName: intent.tierName,
        });
        return intent;
      } catch (error) {
        const validationError = asValidationError(error);
        context.events.publish(context.runId, 'agent:intent_parse_attempt', {
          attempt,
          model: this.model,
          status: validationError ? 'validation_failed' : 'failed',
        });
        if (!validationError || attempt === MAX_ATTEMPTS) throw error;
        validationFeedback = validationError.message;
      }
    }

    throw new IntentParserValidationError('intent validation failed');
  }

  private async extract(
    input: string,
    validationFeedback?: string,
  ): Promise<IntentExtraction> {
    const response = await this.client.responses.parse({
      model: this.model,
      reasoning: { effort: 'low' },
      max_output_tokens: 350,
      store: false,
      input: [
        {
          role: 'system',
          content: validationFeedback
            ? `${SYSTEM_PROMPT}\n\nThe previous output failed validation: ${validationFeedback}. Correct only that issue without guessing.`
            : SYSTEM_PROMPT,
        },
        { role: 'user', content: input },
      ],
      text: {
        format: zodTextFormat(IntentExtractionSchema, 'linear_purchase_intent'),
      },
    });

    const parsed = IntentExtractionSchema.safeParse(response.output_parsed);
    if (!parsed.success) {
      throw new IntentParserValidationError(z.prettifyError(parsed.error));
    }
    return parsed.data;
  }
}

export async function parseIntent(
  context: AgentExecutionContext,
  input: string,
): Promise<PurchaseIntent> {
  return new IntentParser().parse(context, input);
}
function asValidationError(error: unknown): IntentParserValidationError | undefined {
  if (error instanceof IntentParserValidationError) return error;
  if (error instanceof z.ZodError) {
    return new IntentParserValidationError(z.prettifyError(error));
  }
  if (error instanceof SyntaxError) {
    return new IntentParserValidationError(error.message);
  }
  return undefined;
}
