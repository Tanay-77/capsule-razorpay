import { Router } from 'express';
import { verifyWebhookSignature } from '../razorpay/webhook.js';
import { getAgentRunByOrderId } from '../agent/runs.js';
import type { RazorpayWebhookEvent } from '../razorpay/types.js';

/**
 * Razorpay webhook route.
 *
 * The webhook receives POST requests from Razorpay with:
 * - Body: JSON payload describing the event
 * - Header `X-Razorpay-Signature`: HMAC SHA256 of the raw body using the webhook secret
 *
 * The raw body MUST be preserved for signature verification — the Express app
 * must pass `express.raw()` for this route before the JSON parser.
 */
export function createRazorpayRouter(webhookSecret: string): Router {
  const router = Router();

  router.post('/webhook', (req, res) => {
    // The raw body is provided by express.raw() middleware configured in app.ts
    const rawBody = typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : JSON.stringify(req.body);

    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing X-Razorpay-Signature header' });
    }

    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    let event: RazorpayWebhookEvent;
    try {
      event = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(rawBody)
        : req.body;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    // Handle payment_link.paid and order.paid events
    if (event.event === 'payment_link.paid' || event.event === 'order.paid') {
      const payment = event.payload.payment?.entity;
      const order = event.payload.order?.entity;

      if (!payment || !order) {
        // Acknowledge but don't process incomplete payloads
        return res.json({ status: 'ok', processed: false, reason: 'missing payment or order entity' });
      }

      // Look up the agent run by the Razorpay Order ID
      const run = getAgentRunByOrderId(order.id);
      if (!run) {
        // Not our order — acknowledge anyway (Razorpay will retry on non-2xx)
        return res.json({ status: 'ok', processed: false, reason: 'unknown order' });
      }

      // Recheck: paid amount must match the original order amount
      if (order.amount_paid !== order.amount) {
        run.context.events.publish(run.context.runId, 'agent:error', {
          phase: 'razorpay:webhook_amount_check',
          message: `Amount mismatch: order.amount=${order.amount}, order.amount_paid=${order.amount_paid}`,
          retryable: false,
        });
        return res.json({ status: 'ok', processed: false, reason: 'amount mismatch' });
      }

      // Emit webhook_confirmed event
      run.context.events.publish(run.context.runId, 'agent:webhook_confirmed', {
        orderId: order.id,
        paymentId: payment.id,
        amountPaidPaise: order.amount_paid,
      });

      // Transition the state machine if we're awaiting payment
      if (run.state.current === 'awaiting_payment') {
        run.state.transition('webhook_confirmed');
        run.state.transition('complete');
        run.context.events.publish(run.context.runId, 'agent:complete', {
          outcome: `Payment confirmed via Razorpay webhook. Order ${order.id}, Payment ${payment.id}, Amount ${order.amount_paid} paise.`,
        });
      }

      // Resolve the webhook promise so the provisioner can continue
      run.webhookResolve?.();

      return res.json({ status: 'ok', processed: true, orderId: order.id });
    }

    // Acknowledge any other event types we don't handle
    return res.json({ status: 'ok', processed: false, reason: `unhandled event: ${event.event}` });
  });

  return router;
}
