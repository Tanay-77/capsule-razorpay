import { z } from 'zod';
import type { PurchaseIntent } from './types.js';

export const LINEAR_PRICING = {
  Free: { monthlyPerSeatCents: 0 },
  Basic: { monthlyPerSeatCents: 1_000 },
  Business: { monthlyPerSeatCents: 1_600 },
} as const;

export type LinearTierName = keyof typeof LINEAR_PRICING;

export interface LinearIntentExtraction {
  platform: string;
  seatCount: number | null;
  durationDays: number | null;
  requestedTier: LinearTierName | 'Enterprise' | null;
  budgetCap: string | null;
  ambiguityReason: string | null;
}

export class IntentParserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentParserValidationError';
  }
}

const ResolvedIntentSchema = z
  .object({
    platform: z.literal('Linear'),
    seatCount: z.number().int().positive().max(10_000),
    durationDays: z.number().int().positive().max(366),
    exactAmount: z.string().regex(/^\d+\.\d{2}$/),
    tierName: z.enum(['Free', 'Basic', 'Business']),
  })
  .strict();

export function resolveLinearEstimate(
  extraction: LinearIntentExtraction,
): PurchaseIntent {
  if (extraction.platform.trim().toLowerCase() !== 'linear') {
    throw new IntentParserValidationError(
      `unsupported platform "${extraction.platform}"; Phase 2 supports Linear only`,
    );
  }
  if (extraction.seatCount === null) {
    throw new IntentParserValidationError(
      extraction.ambiguityReason ?? 'seatCount is required and cannot be guessed',
    );
  }
  if (extraction.durationDays === null) {
    throw new IntentParserValidationError(
      extraction.ambiguityReason ?? 'durationDays is required and cannot be guessed',
    );
  }
  if (extraction.requestedTier === 'Enterprise') {
    throw new IntentParserValidationError(
      'Linear Enterprise uses custom pricing and cannot be estimated from public rates',
    );
  }

  const tierName = resolveTier(extraction);
  const monthlyCents = LINEAR_PRICING[tierName].monthlyPerSeatCents;
  const estimatedCents = Math.round(
    (monthlyCents * extraction.seatCount * extraction.durationDays) / 30,
  );

  if (extraction.budgetCap !== null) {
    const budgetCents = decimalToCents(extraction.budgetCap);
    if (estimatedCents > budgetCents) {
      throw new IntentParserValidationError(
        `${tierName} estimate ${formatCents(estimatedCents)} exceeds budget cap ${formatCents(budgetCents)}`,
      );
    }
  }

  return ResolvedIntentSchema.parse({
    platform: 'Linear',
    seatCount: extraction.seatCount,
    durationDays: extraction.durationDays,
    exactAmount: formatCents(estimatedCents),
    tierName,
  });
}

function resolveTier(extraction: LinearIntentExtraction): LinearTierName {
  if (
    extraction.requestedTier &&
    extraction.requestedTier !== 'Enterprise'
  ) {
    return extraction.requestedTier;
  }
  if (extraction.budgetCap === null) {
    throw new IntentParserValidationError(
      'tierName is ambiguous; name Free, Basic, or Business, or provide a budget cap to select the cheapest paid tier',
    );
  }
  return 'Basic';
}

function decimalToCents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new IntentParserValidationError(`invalid USD amount "${value}"`);
  }
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    throw new IntentParserValidationError('USD amount is outside the supported range');
  }
  return cents;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
