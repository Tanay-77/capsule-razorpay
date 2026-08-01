import type { AgentExecutionContext } from '../agent/context.js';
import { PravaApiClient } from './api-client.js';
import type {
  PaymentLineItem,
  PaymentResultResponse,
  ReportStatusResponse,
  SessionResponse,
} from './types.js';

const DECIMAL_AMOUNT = /^\d+(\.\d{1,2})?$/;
const DEFAULT_INITIAL_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 8_000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1_000;

export interface PravaHostedClientConfig {
  secretKey: string;
  userId: string;
  userEmail: string;
  callbackUrl: string;
  context: AgentExecutionContext;
  currency?: string;
  merchantCountryCode?: string;
  baseUrl?: string;
}

export interface PollPaymentResultOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onResponse?: (
    response: PaymentResultResponse,
    attempt: number,
  ) => void | Promise<void>;
}

export class PravaHostedClient {
  private readonly api: PravaApiClient;
  private readonly currency: string;
  private readonly merchantCountryCode: string;

  constructor(private readonly config: PravaHostedClientConfig) {
    this.api = new PravaApiClient(
      config.baseUrl ?? 'https://sandbox.api.prava.space',
      config.secretKey,
    );
    this.currency = (config.currency ?? 'USD').toUpperCase();
    this.merchantCountryCode = (
      config.merchantCountryCode ?? 'US'
    ).toUpperCase();

    assertHttpsUrl(config.callbackUrl, 'callbackUrl');
    assertEmail(config.userEmail);
    if (!config.userId.trim()) throw new Error('userId is required');
    if (!/^[A-Z]{3}$/.test(this.currency)) {
      throw new Error('currency must be a 3-letter uppercase ISO 4217 code');
    }
    if (!/^[A-Z]{2}$/.test(this.merchantCountryCode)) {
      throw new Error('merchantCountryCode must be a 2-letter uppercase ISO code');
    }
  }

  createSession(
    merchantName: string,
    merchantUrl: string,
    amountDecimalString: string,
    description: string,
  ): Promise<SessionResponse> {
    if (!merchantName.trim()) throw new Error('merchantName is required');
    if (!description.trim()) throw new Error('description is required');
    assertHttpsUrl(merchantUrl, 'merchantUrl');
    if (!DECIMAL_AMOUNT.test(amountDecimalString)) {
      throw new Error(
        'amountDecimalString must be a decimal string with at most 2 decimals',
      );
    }

    return this.api.createSession(this.config.context, {
      user_id: this.config.userId,
      user_email: this.config.userEmail,
      total_amount: amountDecimalString,
      currency: this.currency,
      description,
      integration_type: 'full_checkout',
      callback_url: this.config.callbackUrl,
      purchase_context: [
        {
          merchant_details: {
            name: merchantName,
            url: merchantUrl,
            country_code_iso2: this.merchantCountryCode,
          },
          product_details: [
            {
              description,
              unit_price: amountDecimalString,
              quantity: 1,
            },
          ],
        },
      ],
    });
  }

  async pollPaymentResult(
    sessionId: string,
    options: PollPaymentResultOptions = {},
  ): Promise<PaymentResultResponse> {
    if (!sessionId.trim()) throw new Error('sessionId is required');

    const initialDelayMs = positiveNumber(
      options.initialDelayMs,
      DEFAULT_INITIAL_DELAY_MS,
      'initialDelayMs',
    );
    const maxDelayMs = positiveNumber(
      options.maxDelayMs,
      DEFAULT_MAX_DELAY_MS,
      'maxDelayMs',
    );
    const timeoutMs = positiveNumber(
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      'timeoutMs',
    );
    const startedAt = Date.now();
    let delayMs = Math.min(initialDelayMs, maxDelayMs);
    let attempt = 0;

    while (Date.now() - startedAt < timeoutMs) {
      throwIfAborted(options.signal);
      attempt += 1;

      const response = await this.api.getPaymentResult(
        this.config.context,
        sessionId,
      );
      await options.onResponse?.(response, attempt);

      if (response.status === 'awaiting_result') {
        const lineItems = response.transactions.flatMap(
          (transaction) => transaction.line_items,
        );
        assertCredentialsAvailable(lineItems);
        for (const lineItem of lineItems) {
          this.config.context.events.publish(
            this.config.context.runId,
            'agent:token_issued',
            {
              sessionId,
              transactionReferenceId: lineItem.txn_ref_id,
              credentialAvailable: true,
            },
          );
        }
        this.publishPoll(sessionId, attempt, response.status);
        return response;
      }

      if (response.status === 'failed' || response.status === 'completed') {
        this.publishPoll(sessionId, attempt, response.status);
        const failure = response.transactions.find(
          (transaction) => transaction.error,
        )?.error;
        throw new Error(
          failure?.message ??
            `Prava session reached terminal status "${response.status}" before credentials were available`,
        );
      }

      this.publishPoll(sessionId, attempt, response.status, delayMs);
      await abortableDelay(delayMs, options.signal);
      delayMs = Math.min(Math.ceil(delayMs * 1.5), maxDelayMs);
    }

    throw new Error(`Payment-result polling timed out after ${timeoutMs}ms`);
  }

  reportStatus(
    sessionId: string,
    txnRefId: string,
    outcome: 'APPROVED' | 'DECLINED',
  ): Promise<ReportStatusResponse> {
    if (!sessionId.trim()) throw new Error('sessionId is required');
    if (!txnRefId.trim()) throw new Error('txnRefId is required');
    return this.api.reportStatus(this.config.context, sessionId, {
      txn_ref_id: txnRefId,
      txn_status: outcome,
    });
  }

  private publishPoll(
    sessionId: string,
    attempt: number,
    status: PaymentResultResponse['status'],
    nextPollInMs?: number,
  ): void {
    this.config.context.events.publish(
      this.config.context.runId,
      'agent:payment_result_polled',
      {
        sessionId,
        attempt,
        status,
        ...(nextPollInMs === undefined ? {} : { nextPollInMs }),
      },
    );
  }
}

function assertCredentialsAvailable(lineItems: PaymentLineItem[]): void {
  if (lineItems.length === 0) {
    throw new Error('Prava returned awaiting_result without any line items');
  }
  const incomplete = lineItems.find(
    (lineItem) =>
      !lineItem.token ||
      !lineItem.dynamic_cvv ||
      !lineItem.expiry_month ||
      !lineItem.expiry_year,
  );
  if (incomplete) {
    throw new Error(
      `Prava returned awaiting_result without complete credentials for ${incomplete.txn_ref_id}`,
    );
  }
}

function assertHttpsUrl(value: string, field: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${field} must use https`);
}

function assertEmail(value: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('userEmail must be a valid email address');
  }
}

function positiveNumber(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return result;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('Payment-result polling aborted');
  }
}

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error('Payment-result polling aborted'),
      );
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}