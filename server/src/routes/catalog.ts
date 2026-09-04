import { Router } from 'express';
import { CATALOG } from '../catalog/index.js';
import { MERCHANTS } from '../catalog/merchants.js';

export const catalogRouter = Router();

/**
 * GET /api/catalog
 * Returns the Capsule Store catalog as structured JSON.
 * This is the ground truth for the IntentParser agent.
 */
catalogRouter.get('/', (req, res) => {
  const merchantId = typeof req.query.merchantId === 'string' ? req.query.merchantId : 'capsule-demo-store';
  const merchant = MERCHANTS[merchantId];
  if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
  res.json(merchant.catalog);
});
