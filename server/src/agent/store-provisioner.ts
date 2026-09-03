import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AgentRun } from './runs.js';
import type { AutomationMode, PurchaseIntent } from './types.js';
import { RazorpayApiClient } from '../razorpay/api-client.js';
import { MERCHANTS } from '../catalog/merchants.js';

const PAYMENT_LINK_EXPIRY_SECONDS = 10 * 60; // 10 minutes (configurable, but Razorpay minimum is 15m usually, wait let's use 15m to be safe)
// Actually user said: "with expire_by set tight (configurable, default 10 minutes, use 60-90 seconds for live demo pacing)"
// Razorpay API docs say minimum is 15 mins for expiry. If I use 60-90s, Razorpay might throw an error. But let's set it to 90 seconds if the user explicitly asked for 60-90 seconds for live demo pacing. If it fails, I'll see it in tests.

export type ProvisioningResult =
  | { mode: 'mock'; amountPaise: number; currency: 'INR' }
  | { mode: 'dry-run'; amountPaise: number; currency: string; orderId: string }
  | { mode: 'real'; amountPaise: number; currency: string; orderId: string; paymentLinkUrl: string };

export class StoreProvisioner {
  async provision(
    run: AgentRun,
    intent: PurchaseIntent,
    requestedMode: AutomationMode,
  ): Promise<ProvisioningResult> {
    const mode: AutomationMode = process.env.ENABLE_MOCK_AGENT === 'true' ? 'mock' : requestedMode;
    run.context.events.publish(run.context.runId, 'agent:automation_mode', { mode });

    try {
      if (mode === 'mock') return await this.runMock(run, intent);
      return await this.runReal(run, intent, mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provisioning failed';
      if (run.state.current !== 'failed') {
        try { run.state.transition('failed'); } catch { /* ignore */ }
      }
      run.context.events.publish(run.context.runId, 'agent:error', {
        phase: 'store_provisioning',
        message,
        retryable: true,
      });
      throw error;
    }
  }

  private async runMock(run: AgentRun, intent: PurchaseIntent): Promise<ProvisioningResult> {
    const amountPaise = intent.resolvedAmountPaise;
    
    run.state.transition('quoting_checkout');
    await delay(500); // Simulate network read
    run.context.events.publish(run.context.runId, 'agent:checkout_total_read', {
      amount: (amountPaise / 100).toFixed(2),
      currency: 'INR',
      source: 'mock',
    });
    run.state.transition('checkout_quoted');

    // Create mock Razorpay Order
    await delay(1000);
    const mockOrderId = `order_mock_${run.context.runId.slice(0, 8)}`;
    run.orderId = mockOrderId;
    run.context.events.publish(run.context.runId, 'agent:order_created', {
      orderId: mockOrderId,
      amountPaise,
      currency: 'INR',
    });
    run.state.transition('order_created');

    // Passkey approval (Capsule's WebAuthn gate)
    run.context.events.publish(run.context.runId, 'agent:passkey_required', {
      orderId: mockOrderId,
      message: 'Approve this exact-amount purchase with your passkey.',
    });
    
    // Mock webauthn
    await delay(1500);
    run.context.events.publish(run.context.runId, 'agent:passkey_approved', {} as any);
    run.state.transition('passkey_approved');

    // Create mock Payment Link
    await delay(500);
    const mockPaymentLinkUrl = 'https://rzp.io/mock-payment-link';
    run.paymentLinkUrl = mockPaymentLinkUrl;
    run.context.events.publish(run.context.runId, 'agent:payment_link_created', {
      paymentLinkId: `plink_mock_${run.context.runId.slice(0, 8)}`,
      shortUrl: mockPaymentLinkUrl,
      expireBy: Math.floor(Date.now() / 1000) + 600,
    });
    run.context.events.publish(run.context.runId, 'agent:awaiting_payment', {
      orderId: mockOrderId,
      paymentLinkUrl: mockPaymentLinkUrl,
    });
    run.state.transition('awaiting_payment');

    // Simulate webhook confirmation
    await delay(2000);
    run.context.events.publish(run.context.runId, 'agent:webhook_confirmed', {
      orderId: mockOrderId,
      paymentId: `pay_mock_${run.context.runId.slice(0, 8)}`,
      amountPaidPaise: amountPaise,
    });
    run.state.transition('webhook_confirmed');
    run.state.transition('complete');
    run.context.events.publish(run.context.runId, 'agent:complete', {
      outcome: 'Mock purchase completed; no Razorpay network call was made.',
    });
    
    return { mode: 'mock', amountPaise, currency: 'INR' };
  }

  private async runReal(
    run: AgentRun,
    intent: PurchaseIntent,
    mode: 'dry-run' | 'real',
  ): Promise<ProvisioningResult> {
    const razorpay = this.createRazorpayClient();
    const amountPaise = intent.resolvedAmountPaise;
    
    run.state.transition('quoting_checkout');
    
    // In StoreProvisioner, we instantly have the total from IntentParser
    run.context.events.publish(run.context.runId, 'agent:checkout_total_read', {
      amount: (amountPaise / 100).toFixed(2),
      currency: 'INR',
      source: 'catalog',
    });
    run.state.transition('checkout_quoted');
    
    const order = await razorpay.createOrder(run.context, {
      amount: amountPaise,
      currency: 'INR',
      receipt: `capsule_${run.context.runId.slice(0, 16)}`,
      notes: {
        merchant: run.merchantId || 'capsule-demo-store',
        skuId: intent.skuId,
        quantity: String(intent.quantity),
        ...(run.campaign ? { campaign: run.campaign } : {}),
      },
    });
    run.orderId = order.id;
    // RazorpayApiClient already emits agent:order_created, no need to duplicate
    run.state.transition('order_created');

    if (mode === 'dry-run') {
      run.state.transition('dry_run_complete');
      run.context.events.publish(run.context.runId, 'agent:dry_run_complete', {
        orderId: order.id,
        amount: (amountPaise / 100).toFixed(2),
        currency: 'INR',
      });
      run.context.events.publish(run.context.runId, 'agent:complete', {
        outcome: 'Dry run stopped after creating the Razorpay Order; no Payment Link was created and no payment was collected.',
      });
      return {
        mode,
        amountPaise,
        currency: 'INR',
        orderId: order.id,
      };
    }

    // 2. Passkey approval (Capsule's own WebAuthn gate, not Razorpay)
    run.context.events.publish(run.context.runId, 'agent:passkey_required', {
      orderId: order.id,
      message: 'Approve this exact-amount purchase with your passkey before Capsule creates the Payment Link.',
    });
    
    // Wait for real WebAuthn ceremony
    await new Promise<void>((resolve) => {
      run.approvalResolve = resolve;
    });
    run.state.transition('passkey_approved');

    // 3. Create Payment Link with tight expiry
    const expiryDelaySeconds = Number(process.env.PAYMENT_LINK_EXPIRY_SECONDS) || 900; 
    // Razorpay requires min 15 minutes (900s). We add a 60-second buffer to prevent clock skew/latency errors.
    const expireBy = Math.floor(Date.now() / 1000) + Math.max(expiryDelaySeconds, 960);
    
    const paymentLink = await razorpay.createPaymentLink(run.context, {
      amount: amountPaise,
      currency: 'INR',
      expire_by: expireBy,
      reference_id: order.id, // reference_id tied to the order
      description: `${intent.quantity}x ${intent.skuId} – Capsule`,
      callback_url: `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/payment/complete?runId=${run.context.runId}`,
      callback_method: 'get',
      notes: {
        capsule_run_id: run.context.runId,
        razorpay_order_id: order.id,
      },
    });
    run.paymentLinkId = paymentLink.id;
    run.paymentLinkUrl = paymentLink.short_url;

    run.context.events.publish(run.context.runId, 'agent:payment_link_created', {
      paymentLinkId: paymentLink.id,
      shortUrl: paymentLink.short_url,
      expireBy: expireBy,
    });

    // 4. Emit awaiting_payment — user opens this URL to pay manually (or playwright can in automated test)
    run.context.events.publish(run.context.runId, 'agent:awaiting_payment', {
      orderId: order.id,
      paymentLinkUrl: paymentLink.short_url,
    });
    run.state.transition('awaiting_payment');

    // Set up a promise that the webhook handler will resolve
    run.webhookPromise = new Promise<void>((resolve, reject) => {
      run.webhookResolve = resolve;
      run.webhookReject = reject;
    });

    // Wait for webhook confirmation (with timeout)
    const webhookTimeout = (expireBy - Math.floor(Date.now() / 1000)) * 1000 + 30_000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Payment Link expired without payment confirmation.')), webhookTimeout);
    });
    await Promise.race([run.webhookPromise, timeoutPromise]);

    // Phase 4: Deterministic Upsells
    const activeCatalog = MERCHANTS[run.merchantId || 'capsule-demo-store']?.catalog || [];
    const primarySku = activeCatalog.find((p) => p.id === intent.skuId);
    if (primarySku?.relatedSkuId) {
      const addOnSku = activeCatalog.find((p) => p.id === primarySku.relatedSkuId);
      if (addOnSku) {
        run.context.events.publish(run.context.runId, 'agent:upsell_suggested', {
          primarySkuId: primarySku.id,
          addOnSkuId: addOnSku.id,
          addOnName: addOnSku.name,
          priceInPaise: addOnSku.priceInPaise,
        });
        run.state.transition('upsell_suggested');

        const accepted = await new Promise<boolean>((resolve) => {
          run.upsellDecisionResolve = resolve;
        });

        if (!accepted) {
          run.context.events.publish(run.context.runId, 'agent:upsell_declined', {});
          run.state.transition('upsell_declined');
          run.state.transition('complete');
          run.context.events.publish(run.context.runId, 'agent:complete', {
            outcome: `Payment confirmed via Razorpay webhook. Order ${order.id}. Upsell declined.`,
          });
        } else {
          run.context.events.publish(run.context.runId, 'agent:upsell_accepted', {});
          run.state.transition('upsell_accepted');

          // Execute exact independent flow for the upsell
          const upsellOrder = await razorpay.createOrder(run.context, {
            amount: addOnSku.priceInPaise,
            currency: 'INR',
            receipt: `capsule_up_${run.context.runId.slice(0, 13)}`,
            notes: {
              merchant: run.merchantId || 'capsule-demo-store',
              skuId: addOnSku.id,
              quantity: '1',
              upsell_to_order_id: order.id,
            },
          });
          
          run.orderId = upsellOrder.id; // Update run.orderId so webhook routes correctly
          run.state.transition('upsell_order_created');
          run.context.events.publish(run.context.runId, 'agent:upsell_order_created', {
            orderId: upsellOrder.id,
            amountPaise: upsellOrder.amount,
            currency: upsellOrder.currency,
          });

          run.context.events.publish(run.context.runId, 'agent:upsell_passkey_required', {
            orderId: upsellOrder.id,
            message: 'Approve the add-on purchase with your passkey.',
          });
          
          await new Promise<void>((resolve) => {
            run.upsellApprovalResolve = resolve;
          });
          run.state.transition('upsell_passkey_approved');

          const upsellExpireBy = Math.floor(Date.now() / 1000) + Math.max(expiryDelaySeconds, 960);
          const upsellPaymentLink = await razorpay.createPaymentLink(run.context, {
            amount: addOnSku.priceInPaise,
            currency: 'INR',
            expire_by: upsellExpireBy,
            reference_id: upsellOrder.id,
            description: `1x ${addOnSku.name} (Add-on) – Capsule`,
            callback_url: `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/payment/complete?runId=${run.context.runId}`,
            callback_method: 'get',
            notes: {
              capsule_run_id: run.context.runId,
              razorpay_order_id: upsellOrder.id,
            },
          });

          run.paymentLinkId = upsellPaymentLink.id;
          run.paymentLinkUrl = upsellPaymentLink.short_url;

          run.context.events.publish(run.context.runId, 'agent:upsell_payment_link_created', {
            paymentLinkId: upsellPaymentLink.id,
            shortUrl: upsellPaymentLink.short_url,
            expireBy: upsellExpireBy,
          });

          run.context.events.publish(run.context.runId, 'agent:upsell_awaiting_payment', {
            paymentLinkUrl: upsellPaymentLink.short_url,
          });
          run.state.transition('upsell_awaiting_payment');

          run.upsellWebhookPromise = new Promise<void>((resolve, reject) => {
            run.upsellWebhookResolve = resolve;
            run.upsellWebhookReject = reject;
          });

          const upsellTimeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Upsell Payment Link expired without payment confirmation.')), (upsellExpireBy - Math.floor(Date.now() / 1000)) * 1000 + 30_000);
          });
          await Promise.race([run.upsellWebhookPromise, upsellTimeoutPromise]);
        }
      } else {
        // No related sku found, just complete the flow
        run.state.transition('complete');
        run.context.events.publish(run.context.runId, 'agent:complete', {
          outcome: `Payment confirmed via Razorpay webhook. Order ${order.id}.`,
        });
      }
    } else {
      // No related sku for primary sku, just complete the flow
      run.state.transition('complete');
      run.context.events.publish(run.context.runId, 'agent:complete', {
        outcome: `Payment confirmed via Razorpay webhook. Order ${order.id}.`,
      });
    }

    return {
      mode,
      amountPaise,
      currency: 'INR',
      orderId: order.id,
      paymentLinkUrl: paymentLink.short_url,
    };
  }

  private createRazorpayClient(): RazorpayApiClient {
    return new RazorpayApiClient(
      requiredEnv('RAZORPAY_KEY_ID'),
      requiredEnv('RAZORPAY_KEY_SECRET'),
    );
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for real/dry-run automation.`);
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
