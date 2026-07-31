import { Router } from 'express';
import { getAgentRun } from '../agent/runs.js';
import { PravaApiClient } from '../prava/api-client.js';
import type {
  CreateSessionRequest,
  ProductExecutionStatus,
} from '../prava/types.js';

interface CreateHostedSessionBody {
  runId?: string;
  userId?: string;
  userEmail?: string;
  totalAmount?: string;
  currency?: string;
  description?: string;
  callbackUrl?: string;
  merchantName?: string;
  merchantUrl?: string;
  merchantCountry?: string;
}

interface ReportStatusBody {
  runId?: string;
  txnStatus?: 'APPROVED' | 'DECLINED';
  authorizationCode?: string;
  responseCode?: string;
  amountPaid?: string;
  productStatuses?: Array<{
    status: ProductExecutionStatus;
    productId?: string;
    productRefId?: string;
    amountPaid?: string;
  }>;
}

function parseHttpsUrl(value: unknown, field: string): URL {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error(`${field} must use https for Prava hosted checkout`);
  }
  return url;
}

export function createPravaRouter(client: PravaApiClient): Router {
  const router = Router();

  router.post('/create-session', async (req, res) => {
    const body = (req.body ?? {}) as CreateHostedSessionBody;
    const run = body.runId ? getAgentRun(body.runId) : undefined;
    if (!run) return res.status(404).json({ error: 'Create an intent run first' });
    if (run.state.current !== 'intent_parsed') {
      return res.status(409).json({ error: 'This run already started a payment session' });
    }

    try {
      const callbackUrl = parseHttpsUrl(body.callbackUrl, 'callbackUrl');
      callbackUrl.searchParams.set('runId', run.context.runId);
      const merchantUrl = parseHttpsUrl(
        body.merchantUrl ?? 'https://linear.app',
        'merchantUrl',
      );
      const userEmail = body.userEmail ?? process.env.LINEAR_TEST_EMAIL;
      if (!userEmail) throw new Error('userEmail or LINEAR_TEST_EMAIL is required');

      const totalAmount = body.totalAmount ?? '9.99';
      const description = body.description ?? 'Capsule sandbox checkout';
      const request: CreateSessionRequest = {
        user_id: body.userId ?? 'capsule_sandbox_user',
        user_email: userEmail,
        total_amount: totalAmount,
        currency: (body.currency ?? 'USD').toUpperCase(),
        description,
        integration_type: 'full_checkout',
        callback_url: callbackUrl.toString(),
        purchase_context: [
          {
            merchant_details: {
              name: body.merchantName ?? 'Linear',
              url: merchantUrl.toString(),
              country_code_iso2: (body.merchantCountry ?? 'US').toUpperCase(),
              category_code: '5734',
              category: 'Software Services',
            },
            product_details: [
              { description, unit_price: totalAmount, quantity: 1 },
            ],
            effective_until_minutes: 15,
          },
        ],
      };

      const session = await client.createSession(run.context, request);
      run.sessionId = session.session_id;
      run.callbackUrl = request.callback_url;
      run.state.transition('session_created');
      run.state.transition('awaiting_card_entry');

      return res.status(201).json({
        runId: run.context.runId,
        sessionId: session.session_id,
        hostedUrl: session.iframe_url,
        expiresAt: session.expires_at,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session creation failed';
      return res.status(400).json({ runId: run.context.runId, error: message });
    }
  });

  router.post('/callback', (req, res) => {
    const runId = typeof req.body?.runId === 'string' ? req.body.runId : '';
    const run = getAgentRun(runId);
    if (!run?.sessionId) return res.status(404).json({ error: 'Payment run not found' });

    if (run.state.current === 'awaiting_card_entry') {
      run.context.events.publish(runId, 'agent:callback_received', {
        sessionId: run.sessionId,
      });
      run.state.transition('callback_received');
    }

    return res.json({ runId, sessionId: run.sessionId, acknowledged: true });
  });

  router.get('/payment-result/by-run/:runId', async (req, res) => {
    const run = getAgentRun(req.params.runId);
    if (!run?.sessionId) return res.status(404).json({ error: 'Payment run not found' });

    try {
      const result = await client.getPaymentResult(run.context, run.sessionId);
      const lineItem = result.transactions[0]?.line_items[0];
      const credentialReady = Boolean(
        lineItem?.token &&
          lineItem.dynamic_cvv &&
          lineItem.expiry_month &&
          lineItem.expiry_year,
      );

      if (credentialReady && lineItem && !run.tokenEventEmitted) {
        run.credential = {
          token: lineItem.token!,
          dynamicCvv: lineItem.dynamic_cvv!,
          expiryMonth: lineItem.expiry_month!,
          expiryYear: lineItem.expiry_year!,
          transactionReferenceId: lineItem.txn_ref_id,
        };
        run.tokenEventEmitted = true;
        run.context.events.publish(run.context.runId, 'agent:token_issued', {
          sessionId: run.sessionId,
          transactionReferenceId: lineItem.txn_ref_id,
          credentialAvailable: true,
        });
        if (
          run.state.current === 'callback_received' ||
          run.state.current === 'awaiting_card_entry'
        ) {
          run.state.transition('token_issued');
        }
      }

      return res.json({
        runId: run.context.runId,
        status: result.status,
        credentialAvailable: Boolean(run.credential),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment polling failed';
      return res.status(502).json({ runId: run.context.runId, error: message });
    }
  });

  router.post('/report-status', async (req, res) => {
    const body = (req.body ?? {}) as ReportStatusBody;
    const run = body.runId ? getAgentRun(body.runId) : undefined;
    if (!run?.sessionId || !run.credential) {
      return res.status(409).json({ error: 'No one-time credential is awaiting execution' });
    }
    if (!body.txnStatus) {
      return res.status(400).json({ error: 'txnStatus is required' });
    }

    try {
      const transactionReferenceId = run.credential.transactionReferenceId;
      const result = await client.reportStatus(run.context, run.sessionId, {
        txn_ref_id: transactionReferenceId,
        txn_status: body.txnStatus,
        authorization_code: body.authorizationCode,
        response_code: body.responseCode,
        amount_paid: body.amountPaid,
        product_statuses: body.productStatuses?.map((product) => ({
          status: product.status,
          product_id: product.productId,
          product_ref_id: product.productRefId,
          amount_paid: product.amountPaid,
        })),
      });

      run.credential = undefined;
      if (run.state.current === 'token_issued') {
        run.state.transition('automating_checkout');
      }
      if (run.state.current === 'automating_checkout') {
        run.state.transition('complete');
      }
      run.context.events.publish(run.context.runId, 'agent:complete', {
        outcome: `Checkout ${body.txnStatus.toLowerCase()} and reported to Prava`,
      });

      return res.json({
        status: result.status,
        transactionStatus: result.txn_status,
        networkConfirmation: result.visa_confirmation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Status reporting failed';
      return res.status(502).json({ error: message });
    }
  });

  return router;
}

