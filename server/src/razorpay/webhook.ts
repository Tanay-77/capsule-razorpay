import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs webhooks by computing:
 *   HMAC-SHA256(raw_request_body, webhook_secret)
 * and sending the hex digest in the `X-Razorpay-Signature` header.
 *
 * We use `timingSafeEqual` to prevent timing-based attacks.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
): boolean {
  if (!rawBody || !signatureHeader || !webhookSecret) return false;

  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  const expected = Buffer.from(expectedSignature, 'hex');
  const received = Buffer.from(signatureHeader, 'hex');

  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}
