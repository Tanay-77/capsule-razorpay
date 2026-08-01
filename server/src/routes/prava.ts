import { Router } from 'express';
import { getAgentRun } from '../agent/runs.js';
import { PravaApiClient } from '../prava/api-client.js';
import type { ProductExecutionStatus } from '../prava/types.js';

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

export function createPravaRouter(client: PravaApiClient): Router {
  const router = Router();

  router.post('/create-session', (_req, res) => {
    return res.status(410).json({
      error: 'Direct session creation is disabled. Start /api/agent/provision so Linear is quoted before Prava receives the exact DOM total.',
    });
  });

  router.post('/callback', (req, res) => {
    const runId = typeof req.body?.runId === 'string' ? req.body.runId : '';
    const run = getAgentRun(runId);
    if (!run?.sessionId) return res.status(404).json({ error: 'Payment run not found' });

    if (run.state.current === 'awaiting_card_entry') {
      run.context.events.publish(runId, 'agent:callback_received', { sessionId: run.sessionId });
      run.state.transition('callback_received');
    }
    return res.json({ runId, sessionId: run.sessionId, acknowledged: true });
  });

  router.get('/payment-result/by-run/:runId', async (req, res) => {
    const run = getAgentRun(req.params.runId);
    if (!run?.sessionId) return res.status(404).json({ error: 'Payment run not found' });

    try {
      const result = await client.getPaymentResult(run.context, run.sessionId);
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
    if (!body.txnStatus) return res.status(400).json({ error: 'txnStatus is required' });

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
