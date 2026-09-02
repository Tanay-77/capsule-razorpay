import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { AgentExecutionContext } from './context.js';
import type { PurchaseIntent } from './types.js';
import { CATALOG } from '../catalog/index.js';

const MODEL = 'gemini-3.5-flash-lite';
const MAX_ATTEMPTS = 2;

export class IntentParserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentParserValidationError';
  }
}

const IntentExtractionSchema = z
  .object({
    skuId: z.string().min(1).describe('The ID of the SKU to purchase from the catalog.'),
    quantity: z.number().int().positive().describe('The number of units to purchase.'),
    requestedDurationDays: z.number().int().positive().describe('REQUIRED. The duration requested in days. For monthly, assume 30 days. For one-time products, infer 1.'),
    resolvedAmountPaise: z.number().int().positive().describe('REQUIRED. The exact total amount to charge in paise.'),
    billingNote: z.string().describe('REQUIRED. An honest explanation of any constraints applied. Leave as an empty string "" if no constraints were violated.'),
  });

type IntentExtraction = z.infer<typeof IntentExtractionSchema>;

const SYSTEM_PROMPT = `You are a strict, honest purchasing agent resolving user intents against the Capsule Store catalog.

Return only a valid JSON object matching the requested schema.

CATALOG GROUND TRUTH:
${JSON.stringify(CATALOG, null, 2)}

INSTRUCTIONS:
1. Identify the SKU that best matches the request. Map the catalog's "id" field to the output's "skuId" field.
2. Determine the requested quantity. If it violates a 'min_quantity' constraint, adjust the quantity to the minimum required and note this in the billingNote. Ensure this is output in the "quantity" field.
3. Determine the EXACT requested duration in days and output it in "requestedDurationDays" (e.g. 10). Do not alter this even if it violates constraints.
4. Calculate the exact resolvedAmountPaise. If the requested duration violates a 'monthly_only' or 'no_proration' constraint, you MUST charge them for the full billing cycle (e.g. 30 days) by multiplying the price by the adjusted quantity. Output this in "resolvedAmountPaise" and explain the constraint in "billingNote".
5. You MUST include all 5 fields exactly as named in the schema. If billingNote is not needed, set it to "".
6. If the request is ambiguous (e.g. "get me some seats" without specifying a tier), you must fail validation by returning an empty JSON object {} so the system knows to prompt the user.`;

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
        
        const intent: PurchaseIntent = {
          skuId: extraction.skuId,
          quantity: extraction.quantity,
          requestedDurationDays: extraction.requestedDurationDays,
          resolvedAmountPaise: extraction.resolvedAmountPaise,
          billingNote: extraction.billingNote,
        };

        context.events.publish(context.runId, 'agent:intent_parsed', {
          intent: 'purchase',
          skuId: intent.skuId,
          quantity: intent.quantity,
          requestedDurationDays: intent.requestedDurationDays,
          resolvedAmountPaise: intent.resolvedAmountPaise,
          billingNote: intent.billingNote,
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
