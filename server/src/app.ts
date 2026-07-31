import cors from 'cors';
import express from 'express';
import { agentRouter } from './routes/agent.js';
import { createPravaRouter } from './routes/prava.js';
import { PravaApiClient } from './prava/api-client.js';

export function createApp() {
  const app = express();
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const backendUrl = 'https://sandbox.api.prava.space';
  const secretKey = process.env.PRAVA_SECRET_KEY ?? '';
  const prava = new PravaApiClient(backendUrl, secretKey);

  app.disable('x-powered-by');
  app.use(cors({ origin: webOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'capsule-server' });
  });
  app.use('/api/agent', agentRouter);
  app.use('/api/prava', createPravaRouter(prava));

  return app;
}

