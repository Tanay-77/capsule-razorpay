import type { AgentExecutionContext } from '../agent/context.js';
import type {
  CreateOrderRequest,
  CreatePaymentLinkRequest,
  RazorpayOrder,
  RazorpayPaymentLink,
} from './types.js';

type RazorpayOperation = 'create_order' | 'create_payment_link';

interface RazorpayErrorBody {
  error?: {
    code?: string;
    description?: string;
    field?: string;
  };
}

/**
 * Minimal Razorpay REST client.
 *
 * - Auth: HTTP Basic (`key_id:key_secret`), NOT Bearer.
 * - Amounts: integer in the smallest currency subunit (paise for INR).
 * - Base URL: `https://api.razorpay.com` (no sandbox subdomain — test mode
 *   is determined by whether the key starts with `rzp_test_`).
 */
export class RazorpayApiClient {
  private readonly authHeader: string;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly baseUrl: string = 'https://api.razorpay.com',
  ) {
    // HTTP Basic auth: base64(key_id:key_secret)
    this.authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  }

  /**
   * Create a Razorpay Order.
   * POST /v1/orders
   */
  async createOrder(
    context: AgentExecutionContext,
    request: CreateOrderRequest,
  ): Promise<RazorpayOrder> {
    const order = await this.request<RazorpayOrder>(
      context,
      'create_order',
      '/v1/orders',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );

    context.events.publish(context.runId, 'agent:order_created', {
      orderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
    });

    return order;
  }

  /**
   * Create a Razorpay Payment Link.
   * POST /v1/payment_links/
   */
  async createPaymentLink(
    context: AgentExecutionContext,
    request: CreatePaymentLinkRequest,
  ): Promise<RazorpayPaymentLink> {
    const link = await this.request<RazorpayPaymentLink>(
      context,
      'create_payment_link',
      '/v1/payment_links/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );

    context.events.publish(context.runId, 'agent:payment_link_created', {
      paymentLinkId: link.id,
      shortUrl: link.short_url,
      expireBy: link.expire_by,
    });

    return link;
  }

  private async request<T>(
    context: AgentExecutionContext,
    operation: RazorpayOperation,
    path: string,
    init: RequestInit,
  ): Promise<T> {
    context.events.publish(context.runId, 'agent:razorpay_request', {
      operation,
      status: 'started',
    });

    try {
      if (!this.keyId || !this.keySecret) {
        throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required.');
      }

      const headers = new Headers(init.headers);
      headers.set('Authorization', this.authHeader);

      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as RazorpayErrorBody;
        throw new Error(
          error.error?.description ??
            `Razorpay ${operation} failed with HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as T;
      context.events.publish(context.runId, 'agent:razorpay_request', {
        operation,
        status: 'succeeded',
      });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Razorpay error';
      context.events.publish(context.runId, 'agent:razorpay_request', {
        operation,
        status: 'failed',
      });
      context.events.publish(context.runId, 'agent:error', {
        phase: `razorpay:${operation}`,
        message,
        retryable: false,
      });
      throw error;
    }
  }
}
