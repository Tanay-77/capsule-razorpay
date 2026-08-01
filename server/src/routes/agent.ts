import { Router } from 'express';
import { agentEvents, type AgentEvent } from '../events/AgentEventEmitter.js';
import { createAgentRun } from '../agent/runs.js';
import { parseIntent } from '../agent/intent-parser.js';
import { IntentParserValidationError } from '../agent/linear-pricing.js';

export const agentRouter = Router();

agentRouter.get('/stream', (req, res) => {
  const runId =
    typeof req.query.runId === 'string' ? req.query.runId : undefined;

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

  for (const event of agentEvents.recent(runId)) {
    writeEvent(event);
  }

  const unsubscribe = agentEvents.subscribe(writeEvent);
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

agentRouter.post('/intent', async (req, res) => {
  const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  if (!input) {
    return res.status(400).json({ error: 'input is required' });
  }

  const run = createAgentRun();
  try {
    const intent = await parseIntent(run.context, input);
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
