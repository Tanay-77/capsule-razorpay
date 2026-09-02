import { Router } from 'express';
import { CATALOG } from '../catalog/index.js';

export const catalogRouter = Router();

/**
 * GET /api/catalog
 * Returns the Capsule Store catalog as structured JSON.
 * This is the ground truth for the IntentParser agent.
 */
catalogRouter.get('/', (_req, res) => {
  res.json(CATALOG);
});
