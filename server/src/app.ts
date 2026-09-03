import cors from 'cors';
import express from 'express';
import { agentRouter } from './routes/agent.js';
import { createRazorpayRouter } from './routes/razorpay.js';
import { catalogRouter } from './routes/catalog.js';
import { webauthnRouter } from './routes/webauthn.js';

export function createApp() {
  const app = express();

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET must be set');
  }

  app.use(cors({ origin: 'http://localhost:3000' }));
  // Raw body for Razorpay webhook — must come BEFORE express.json()
  // so the original bytes are preserved for HMAC signature verification.
  app.use('/api/razorpay/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'capsule-server' });
  });
  
  app.use('/api/agent', agentRouter);
  app.use('/api/razorpay', createRazorpayRouter(webhookSecret));
  app.use('/api/catalog', catalogRouter);
  app.use('/api/webauthn', webauthnRouter);

  return app;
}
