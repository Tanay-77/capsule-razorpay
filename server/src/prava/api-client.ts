import type { AgentExecutionContext } from '../agent/context.js';
import type {
  CreateSessionRequest,
  PaymentResultResponse,
  ReportStatusRequest,
  ReportStatusResponse,
  SessionResponse,
} from './types.js';

type PravaOperation =
  | 'create_session'
  | 'get_payment_result'
  | 'report_status';

interface PravaErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class PravaApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secretKey: string,
  ) {}

  async createSession(
    context: AgentExecutionContext,
    request: CreateSessionRequest,
  ): Promise<SessionResponse> {
    const session = await this.request<SessionResponse>(
      context,
      'create_session',
      '/v1/sessions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );

    context.events.publish(context.runId, 'agent:session_created', {
      sessionId: session.session_id,
      orderId: session.order_id,
      expiresAt: session.expires_at,
      hostedUrl: session.iframe_url,
    });
    context.events.publish(context.runId, 'agent:awaiting_card_entry', {
      sessionId: session.session_id,
      hostedUrl: session.iframe_url,
      callbackUrl: request.callback_url,
    });
    return session;
  }

  getPaymentResult(
    context: AgentExecutionContext,
    sessionId: string,
  ): Promise<PaymentResultResponse> {
    return this.request<PaymentResultResponse>(
      context,
      'get_payment_result',
      `/v1/sessions/${encodeURIComponent(sessionId)}/payment-result?_t=${Date.now()}`,
      { method: 'GET', cache: 'no-store' },
    );
  }

  async reportStatus(
    context: AgentExecutionContext,
    sessionId: string,
    request: ReportStatusRequest,
  ): Promise<ReportStatusResponse> {
    const result = await this.request<ReportStatusResponse>(
      context,
      'report_status',
      `/v1/sessions/${encodeURIComponent(sessionId)}/report-status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      },
    );

    context.events.publish(context.runId, 'agent:status_reported', {
      sessionId,
      transactionReferenceId: request.txn_ref_id,
      transactionStatus: request.txn_status,
    });
    return result;
  }

  private async request<T>(
    context: AgentExecutionContext,
    operation: PravaOperation,
    path: string,
    init: RequestInit,
  ): Promise<T> {
    context.events.publish(context.runId, 'agent:prava_request', {
      operation,
      status: 'started',
    });

    try {
      if (!this.secretKey || !this.secretKey.startsWith('sk_')) {
        throw new Error('PRAVA_SECRET_KEY is not configured.');
      }

      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${this.secretKey}`);
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as PravaErrorBody;
        throw new Error(
          error.error?.message ??
            `Prava ${operation} failed with HTTP ${response.status}`,
        );
      }

      const data = (await response.json()) as T;
      context.events.publish(context.runId, 'agent:prava_request', {
        operation,
        status: 'succeeded',
      });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Prava error';
      context.events.publish(context.runId, 'agent:prava_request', {
        operation,
        status: 'failed',
      });
      context.events.publish(context.runId, 'agent:error', {
        phase: `prava:${operation}`,
        message,
        retryable: operation === 'get_payment_result',
      });
      throw error;
    }
  }
}
