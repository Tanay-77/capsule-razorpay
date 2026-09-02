import cors from 'cors';
import express from 'express';
import { agentRouter } from './routes/agent.js';
import { createRazorpayRouter } from './routes/razorpay.js';
import { catalogRouter } from './routes/catalog.js';

export function createApp() {
  const app = express();
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

  app.disable('x-powered-by');
  app.use(cors({ origin: webOrigin, credentials: true }));

  // The Razorpay webhook needs the raw body for HMAC verification.
  // Mount it BEFORE the global JSON parser so express.raw() captures it.
  app.use(
    '/api/razorpay/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
  );

  // Global JSON parser for all other routes
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'capsule-server' });
  });
  app.use('/api/agent', agentRouter);
  app.use('/api/razorpay', createRazorpayRouter(webhookSecret));
  app.use('/api/catalog', catalogRouter);

  return app;
}
