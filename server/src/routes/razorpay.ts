import { Router } from 'express';
import { verifyWebhookSignature } from '../razorpay/webhook.js';
import { getAgentRunByOrderId, getAgentRunByPaymentLinkId } from '../agent/runs.js';
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
    console.log('[WEBHOOK] ========== INCOMING WEBHOOK ==========');
    console.log('[WEBHOOK] Body type:', typeof req.body, Buffer.isBuffer(req.body) ? '(Buffer)' : '');

    // The raw body is provided by express.raw() middleware configured in app.ts
    const rawBody = typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : JSON.stringify(req.body);

    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string') {
      console.log('[WEBHOOK] ERROR: Missing X-Razorpay-Signature header');
      return res.status(400).json({ error: 'Missing X-Razorpay-Signature header' });
    }

    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.log('[WEBHOOK] ERROR: Signature verification FAILED');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    console.log('[WEBHOOK] Signature verification PASSED');

    let event: RazorpayWebhookEvent;
    try {
      event = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(rawBody)
        : req.body;
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    console.log('[WEBHOOK] Event type:', event.event);

    // Handle payment_link.paid and order.paid events
    if (event.event === 'payment_link.paid' || event.event === 'order.paid') {
      const payment = event.payload.payment?.entity;
      const order = event.payload.order?.entity;
      const paymentLinkEntity = event.payload.payment_link?.entity;

      if (!payment) {
        return res.json({ status: 'ok', processed: false, reason: 'missing payment entity' });
      }

      // Look up the agent run — try payment link ID first (since Payment Links
      // create their own internal orders that differ from our createOrder ID),
      // then fall back to order ID, then try the payment_link reference_id.
      let run = paymentLinkEntity
        ? getAgentRunByPaymentLinkId(paymentLinkEntity.id)
        : undefined;

      if (!run && order) {
        run = getAgentRunByOrderId(order.id);
      }

      // Also try reference_id (which we set to our order ID)
      if (!run && paymentLinkEntity?.reference_id) {
        run = getAgentRunByOrderId(paymentLinkEntity.reference_id);
      }

      if (!run) {
        console.log('[WEBHOOK] No matching run found. PL:', paymentLinkEntity?.id, 'Order:', order?.id, 'Ref:', paymentLinkEntity?.reference_id);
        return res.json({ status: 'ok', processed: false, reason: 'unknown order/payment_link' });
      }

      console.log('[WEBHOOK] Found run:', run.context.runId, 'State:', run.state.current);

      // Use order amount from the webhook, or payment amount as fallback
      const paidAmount = order?.amount_paid ?? payment.amount;
      const expectedAmount = order?.amount ?? payment.amount;

      if (paidAmount !== expectedAmount) {
        run.context.events.publish(run.context.runId, 'agent:payment_mismatch', {
          expectedPaise: expectedAmount,
          actualPaise: paidAmount,
        });
        return res.json({ status: 'ok', processed: false, reason: 'amount mismatch' });
      }

      // Transition the state machine if we're awaiting payment
      if (run.state.current === 'awaiting_payment') {
        run.state.transition('webhook_confirmed');
        run.context.events.publish(run.context.runId, 'agent:webhook_confirmed', {
          orderId: order?.id ?? paymentLinkEntity?.id ?? 'unknown',
          paymentId: payment.id,
          amountPaidPaise: paidAmount,
        });
        run.webhookResolve?.();
        console.log('[WEBHOOK] Resolved primary payment for run:', run.context.runId);
      } else if (run.state.current === 'upsell_awaiting_payment') {
        run.state.transition('upsell_webhook_confirmed');
        run.state.transition('complete');
        run.context.events.publish(run.context.runId, 'agent:upsell_webhook_confirmed', {
          orderId: order?.id ?? paymentLinkEntity?.id ?? 'unknown',
          paymentId: payment.id,
          amountPaidPaise: paidAmount,
        });
        run.context.events.publish(run.context.runId, 'agent:complete', {
          outcome: `Upsell payment confirmed via Razorpay webhook. Payment ${payment.id}, Amount ${paidAmount} paise.`,
        });
        run.upsellWebhookResolve?.();
        console.log('[WEBHOOK] Resolved upsell payment for run:', run.context.runId);
      } else {
        console.log('[WEBHOOK] Run state is', run.state.current, '— not awaiting payment, skipping');
      }

      return res.json({ status: 'ok', processed: true });
    }

    // Acknowledge any other event types we don't handle
    console.log('[WEBHOOK] Unhandled event type:', event.event);
    return res.json({ status: 'ok', processed: false, reason: `unhandled event: ${event.event}` });
  });

  return router;
}
