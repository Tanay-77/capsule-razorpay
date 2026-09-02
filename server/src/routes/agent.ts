import { Router } from 'express';
import { agentEvents, type AgentEvent } from '../events/AgentEventEmitter.js';
import { createAgentRun, getAgentRun, type AgentRun } from '../agent/runs.js';
import { parseIntent } from '../agent/intent-parser.js';
import { IntentParserValidationError } from '../agent/intent-parser.js';
import { StoreProvisioner } from '../agent/store-provisioner.js';
import { clearRenewalTimers, scheduleRenewalDemo } from '../agent/renewal-demo.js';
import type { AutomationMode } from '../agent/types.js';

export const agentRouter = Router();
const DEFAULT_RENEWAL_DEMO_SECONDS = 90;
const DEFAULT_RENEWAL_DECISION_SECONDS = 12;

agentRouter.get('/stream', (req, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : undefined;

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const writeEvent = (event: AgentEvent) => {
    if (runId && event.runId !== runId) return;
    res.write(`id: ${event.id}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  for (const event of agentEvents.recent(runId)) writeEvent(event);

  const unsubscribe = agentEvents.subscribe(writeEvent);
  const heartbeat = setInterval(() => res.write(`: heartbeat ${Date.now()}\n\n`), 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

agentRouter.post('/intent', async (req, res) => {
  const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  if (!input) return res.status(400).json({ error: 'input is required' });

  const run = createAgentRun();
  try {
    const intent = await parseIntent(run.context, input);
    run.intent = intent;
    run.state.transition('intent_parsed');
    return res.status(201).json({ runId: run.context.runId, intent });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Intent parsing failed';
    run.context.events.publish(run.context.runId, 'agent:error', {
      phase: 'intent_parsing',
      message,
      retryable: !(error instanceof IntentParserValidationError),
    });
    return res
      .status(error instanceof IntentParserValidationError ? 422 : 500)
      .json({ runId: run.context.runId, error: message });
  }
});

agentRouter.post('/provision', (req, res) => {
  const runId = typeof req.body?.runId === 'string' ? req.body.runId : '';
  const requestedMode = parseAutomationMode(req.body?.mode);
  const renewalDemoSeconds = parseBoundedInteger(
    req.body?.renewalDemoSeconds,
    DEFAULT_RENEWAL_DEMO_SECONDS,
    5,
    600,
  );
  const renewalDecisionSeconds = parseBoundedInteger(
    req.body?.renewalDecisionSeconds,
    DEFAULT_RENEWAL_DECISION_SECONDS,
    3,
    120,
  );

  if (!runId) return res.status(400).json({ error: 'runId is required' });
  if (!requestedMode) return res.status(400).json({ error: 'mode must be mock, dry-run, or real' });
  if (!renewalDemoSeconds) return res.status(400).json({ error: 'renewalDemoSeconds must be an integer from 5 to 600' });
  if (!renewalDecisionSeconds) return res.status(400).json({ error: 'renewalDecisionSeconds must be an integer from 3 to 120' });

  const run = getAgentRun(runId);
  if (!run) return res.status(404).json({ error: 'Agent run not found' });
  if (!run.intent) return res.status(409).json({ error: 'Parse an intent before provisioning' });
  if (run.automationStarted) return res.status(409).json({ error: 'Provisioning already started for this run' });

  const effectiveMode = process.env.ENABLE_MOCK_AGENT === 'true' ? 'mock' : requestedMode;
  configureRun(run, effectiveMode, renewalDemoSeconds * 1_000, renewalDecisionSeconds * 1_000);
  run.automationStarted = true;
  startProvisioning(run, effectiveMode);

  return res.status(202).json({
    runId,
    mode: effectiveMode,
    renewalDemoSeconds,
    renewalDecisionSeconds,
    streamUrl: `/api/agent/stream?runId=${encodeURIComponent(runId)}`,
  });
});

agentRouter.post('/renewal/approve', (req, res) => {
  const runId = typeof req.body?.runId === 'string' ? req.body.runId : '';
  if (!runId) return res.status(400).json({ error: 'runId is required' });

  const originalRun = getAgentRun(runId);
  if (!originalRun?.intent) return res.status(404).json({ error: 'Renewal run not found' });
  if (originalRun.state.current !== 'renewal_required' || originalRun.renewalResolved) {
    return res.status(409).json({ error: 'This renewal is not awaiting approval' });
  }

  clearRenewalTimers(originalRun);
  originalRun.renewalResolved = 'approved';
  originalRun.state.transition('renewal_approved');

  const renewalRun = createAgentRun();
  renewalRun.intent = {
    ...originalRun.intent,
    billingNote: `Renewal is for an additional cycle, estimated at ₹${originalRun.intent.resolvedAmountPaise / 100}.`,
  };
  renewalRun.context.events.publish(renewalRun.context.runId, 'agent:intent_parsed', {
    intent: 'purchase',
    skuId: renewalRun.intent.skuId,
    quantity: renewalRun.intent.quantity,
    requestedDurationDays: renewalRun.intent.requestedDurationDays,
    resolvedAmountPaise: renewalRun.intent.resolvedAmountPaise,
    billingNote: renewalRun.intent.billingNote,
  });
  renewalRun.state.transition('intent_parsed');

  const mode = originalRun.automationMode ?? 'real';
  configureRun(
    renewalRun,
    mode,
    originalRun.renewalDemoMs ?? DEFAULT_RENEWAL_DEMO_SECONDS * 1_000,
    originalRun.renewalDecisionMs ?? DEFAULT_RENEWAL_DECISION_SECONDS * 1_000,
  );
  renewalRun.automationStarted = true;

  originalRun.context.events.publish(originalRun.context.runId, 'agent:renewal_approved', {
    approvedAt: new Date().toISOString(),
    renewalRunId: renewalRun.context.runId,
    freshSessionRequired: true,
    freshPasskeyRequired: true,
  });
  startProvisioning(renewalRun, mode);

  return res.status(202).json({
    runId: renewalRun.context.runId,
    mode,
    streamUrl: `/api/agent/stream?runId=${encodeURIComponent(renewalRun.context.runId)}`,
  });
});

function configureRun(run: AgentRun, mode: AutomationMode, demoMs: number, decisionMs: number): void {
  run.automationMode = mode;
  run.renewalDemoMs = demoMs;
  run.renewalDecisionMs = decisionMs;
}

async function startProvisioning(run: AgentRun, mode: AutomationMode) {
  try {
    const provisioner = new StoreProvisioner();
    const result = await provisioner.provision(run, run.intent!, mode);
    if (result.mode === 'dry-run' || run.state.current !== 'complete') return;
    scheduleRenewalDemo(run, {
      delayMs: run.renewalDemoMs ?? DEFAULT_RENEWAL_DEMO_SECONDS * 1_000,
      decisionWindowMs: run.renewalDecisionMs ?? DEFAULT_RENEWAL_DECISION_SECONDS * 1_000,
    });
  } catch (error) {
    // The provisioner publishes its typed failure event; never duplicate it with console logging.
  }
}

function parseAutomationMode(value: unknown): AutomationMode | undefined {
  if (value === 'mock' || value === 'dry-run' || value === 'real') return value;
  return undefined;
}

function parseBoundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return undefined;
  return parsed;
}

agentRouter.post('/:runId/approve', (req, res) => {
  const { runId } = req.params;
  const { wasRegistration, credentialId } = req.body;
  const run = getAgentRun(runId);
  if (!run) {
    return res.status(404).json({ error: 'Run not found' });
  }

  // The provisioner is blocking on this resolve function
  if (run.approvalResolve) {
    if (wasRegistration && credentialId) {
      run.context.events.publish(run.context.runId, 'agent:passkey_registered', {
        credentialId,
      });
    }
    
    run.context.events.publish(run.context.runId, 'agent:passkey_approved', {} as any);
    run.approvalResolve();
    run.approvalResolve = undefined;
    return res.json({ success: true });
  }

  return res.status(400).json({ error: 'Run is not awaiting approval' });
});
