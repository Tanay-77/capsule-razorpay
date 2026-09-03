import type { AgentRun } from './runs.js';

export interface RenewalDemoOptions {
  delayMs: number;
  decisionWindowMs: number;
}

export function scheduleRenewalDemo(run: AgentRun, options: RenewalDemoOptions): void {
  clearRenewalTimers(run);
  run.renewalDemoMs = options.delayMs;
  run.renewalDecisionMs = options.decisionWindowMs;
  run.renewalResolved = undefined;

  run.renewalTimer = setTimeout(() => {
    if (!run.intent || run.state.current !== 'complete') return;

    const end = new Date();
    const deadline = new Date(Date.now() + options.decisionWindowMs);
    run.state.transition('renewal_required');
    run.campaign = 'renewal-incentive-10pct';
    const seconds = Math.floor(options.decisionWindowMs / 1000);

    run.context.events.publish(run.context.runId, 'agent:renewal_required', {
      periodEndedAt: end.toISOString(),
      decisionDeadline: deadline.toISOString(),
      seatCount: run.intent.quantity,
      billingCadence: 'monthly',
      billingPeriodDays: 30,
      prompt: `Cycle ending — renew now and save 10% — offer expires in ${seconds} seconds`,
      freshApprovalRequired: true,
    });

    run.renewalDecisionTimer = setTimeout(() => resolveRenewalWithoutApproval(run), options.decisionWindowMs);
  }, options.delayMs);
}

export function resolveRenewalWithoutApproval(run: AgentRun): void {
  if (run.state.current !== 'renewal_required' || run.renewalResolved) return;
  run.renewalResolved = 'not_approved';
  run.state.transition('renewal_not_approved');
  run.context.events.publish(run.context.runId, 'agent:renewal_not_approved', {
    resolvedAt: new Date().toISOString(),
    reason: 'no_user_approval',
    sessionCreated: false,
    tokenIssued: false,
    merchantChargeAttempted: false,
    reusableCredentialStored: false,
  });
}

export function clearRenewalTimers(run: AgentRun): void {
  if (run.renewalTimer) clearTimeout(run.renewalTimer);
  if (run.renewalDecisionTimer) clearTimeout(run.renewalDecisionTimer);
  run.renewalTimer = undefined;
  run.renewalDecisionTimer = undefined;
}
