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

    const periodEndedAt = new Date().toISOString();
    const decisionDeadline = new Date(Date.now() + options.decisionWindowMs).toISOString();
    run.state.transition('renewal_required');
    run.context.events.publish(run.context.runId, 'agent:renewal_required', {
      periodEndedAt,
      decisionDeadline,
      seatCount: run.intent.seatCount,
      durationDays: run.intent.durationDays,
      prompt: `Sprint ending — renew seats for ${run.intent.durationDays} more days?`,
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
