import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { AgentExecutionContext } from './context.js';
import {
  IntentParserValidationError,
  resolveLinearEstimate,
} from './linear-pricing.js';
import type { PurchaseIntent } from './types.js';

const MODEL = 'gemini-3.5-flash-lite';
const MAX_ATTEMPTS = 2;

const IntentExtractionSchema = z
  .object({
    platform: z.string().min(1),
    seatCount: z.number().int().positive().nullable().optional(),
    durationDays: z.number().int().positive().nullable().optional(),
    requestedTier: z.enum(['Free', 'Basic', 'Business', 'Enterprise']).nullable().optional(),
    budgetCap: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .nullable().optional(),
    ambiguityReason: z.string().min(1).nullable().optional(),
  })
  .strict()
  .transform(val => ({
    platform: val.platform,
    seatCount: val.seatCount ?? null,
    durationDays: val.durationDays ?? null,
    requestedTier: val.requestedTier ?? null,
    budgetCap: val.budgetCap ?? null,
    ambiguityReason: val.ambiguityReason ?? null,
  }));

type IntentExtraction = z.infer<typeof IntentExtractionSchema>;

const SYSTEM_PROMPT = `Extract a Linear subscription purchase request.

Return only a valid JSON object with the following fields. Do not calculate prices.
- "platform": the named software platform (string).
- "seatCount": explicit number of human seats, or null when absent.
- "durationDays": explicit duration normalized to days (1 week = 7 days, 1 month = 30 days), or null when absent.
- "requestedTier": an explicitly named Linear tier ("Free", "Basic", "Business", "Enterprise"). If no tier is named, return null. Do not infer a tier from a budget.
- "budgetCap": an explicitly stated USD cap as a decimal string without a currency symbol, or null.
- "ambiguityReason": explain any missing seat count, duration, or unclear request; otherwise null.

Never turn a budget cap into a purchase amount. Never invent missing quantities.`;

export interface IntentParserOptions {
  client?: GoogleGenAI;
  model?: string;
}

export class IntentParser {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: IntentParserOptions = {}) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!options.client && !apiKey) {
      throw new Error('GEMINI_API_KEY is required for intent parsing');
    }
    this.client = options.client ?? new GoogleGenAI({ apiKey });
    this.model =
      options.model ?? process.env.GEMINI_INTENT_MODEL?.trim() ?? MODEL;
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
          requestedDurationDays: intent.requestedDurationDays,
          billingCadence: intent.billingCadence,
          billingPeriodDays: intent.billingPeriodDays,
          billablePeriodCount: intent.billablePeriodCount,
          pricingNotice: intent.pricingNotice,
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
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        { role: 'user', parts: [{ text: input }] }
      ],
      config: {
        systemInstruction: validationFeedback
          ? `${SYSTEM_PROMPT}\n\nThe previous output failed validation: ${validationFeedback}. Correct only that issue without guessing.`
          : SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      }
    });

    const outputText = response.text;
    if (!outputText) {
      throw new IntentParserValidationError('Empty response from Gemini');
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(outputText);
    } catch (e) {
      throw new IntentParserValidationError('Response was not valid JSON');
    }

    const parsed = IntentExtractionSchema.safeParse(parsedJson);
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
