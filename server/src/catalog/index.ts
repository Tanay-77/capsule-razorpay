export type BillingType = 'one-time' | 'monthly';

export interface ProductConstraint {
  type: 'min_quantity' | 'monthly_only' | 'no_proration';
  message: string;
  value?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  priceInPaise: number;
  currency: string;
  billingType: BillingType;
  constraints: ProductConstraint[];
}

export const CATALOG: Product[] = [
  {
    id: 'sku_pro_seat',
    name: 'Pro Plan seat',
    description: 'Advanced features, unlimited projects, and priority support.',
    priceInPaise: 120000, // ₹1200
    currency: 'INR',
    billingType: 'monthly',
    constraints: [
      {
        type: 'min_quantity',
        message: 'Minimum 5 seats required for Pro Plan.',
        value: 5,
      },
      {
        type: 'no_proration',
        message: 'Billed strictly in full monthly cycles. No daily proration for partial months.',
      },
      {
        type: 'monthly_only',
        message: 'Only available as a monthly subscription.',
      },
    ],
  },
  {
    id: 'sku_basic_seat',
    name: 'Basic Plan seat',
    description: 'Core features for small teams getting started.',
    priceInPaise: 80000, // ₹800
    currency: 'INR',
    billingType: 'monthly',
    constraints: [
      {
        type: 'no_proration',
        message: 'Billed strictly in full monthly cycles. No daily proration for partial months.',
      },
      {
        type: 'monthly_only',
        message: 'Only available as a monthly subscription.',
      },
    ],
  },
  {
    id: 'sku_api_10k',
    name: 'API credits - 10k pack',
    description: '10,000 API requests. Valid for 1 year.',
    priceInPaise: 50000, // ₹500
    currency: 'INR',
    billingType: 'one-time',
    constraints: [],
  },
  {
    id: 'sku_api_100k',
    name: 'API credits - 100k pack',
    description: '100,000 API requests at a volume discount. Valid for 1 year.',
    priceInPaise: 400000, // ₹4000
    currency: 'INR',
    billingType: 'one-time',
    constraints: [],
  },
  {
    id: 'sku_support_priority',
    name: 'Priority support add-on',
    description: '24/7 priority email and chat support with 1-hour SLA.',
    priceInPaise: 250000, // ₹2500
    currency: 'INR',
    billingType: 'monthly',
    constraints: [
      {
        type: 'no_proration',
        message: 'Billed strictly in full monthly cycles. No daily proration.',
      },
      {
        type: 'monthly_only',
        message: 'Only available as a monthly subscription.',
      },
    ],
  },
];
