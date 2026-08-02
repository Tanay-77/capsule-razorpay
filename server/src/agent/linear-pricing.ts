import { z } from 'zod';
import type { PurchaseIntent } from './types.js';

export const LINEAR_PRICING = {
  Free: { monthlyPerSeatCents: 0 },
  // Monthly checkout previews. Linear's public $10/$16 rates are billed yearly;
  // the disposable workspace's monthly checkout currently shows $12/$20.
  Basic: { monthlyPerSeatCents: 1_200 },
  Business: { monthlyPerSeatCents: 2_000 },
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
    requestedDurationDays: z.number().int().positive().max(366),
    billingCadence: z.literal('monthly'),
    billingPeriodDays: z.literal(30),
    billablePeriodCount: z.literal(1),
    pricingNotice: z.string().min(1),
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
  const estimatedCents = monthlyCents * extraction.seatCount;

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
    requestedDurationDays: extraction.durationDays,
    billingCadence: 'monthly',
    billingPeriodDays: 30,
    billablePeriodCount: 1,
    pricingNotice: buildPricingNotice(
      extraction.durationDays,
      formatCents(estimatedCents),
    ),
    exactAmount: formatCents(estimatedCents),
    tierName,
  });
}

function buildPricingNotice(requestedDurationDays: number, estimate: string): string {
  if (requestedDurationDays < 30) {
    return `Linear has a one-month minimum. This ${requestedDurationDays}-day sprint requires one monthly billing cycle, estimated at $${estimate} before tax and fees.`;
  }
  if (requestedDurationDays === 30) {
    return `Linear bills monthly. This request maps to one monthly billing cycle, estimated at $${estimate} before tax and fees.`;
  }
  return `Linear bills monthly. Capsule will purchase the first monthly cycle, estimated at $${estimate} before tax and fees; continuing the ${requestedDurationDays}-day request requires fresh approval at each renewal.`;
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
