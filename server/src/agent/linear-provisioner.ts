import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium, type BrowserContext, type Frame, type Locator, type Page } from 'playwright';
import type { AgentRun } from './runs.js';
import type { AutomationMode, PurchaseIntent } from './types.js';
import { RazorpayApiClient } from '../razorpay/api-client.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DEFAULT_BILLING_URL = 'https://linear.app/settings/billing';
const DEFAULT_MANUAL_TIMEOUT_MS = 10 * 60 * 1_000;
const TOTAL_STABILITY_DELAY_MS = 1_250;
const PAYMENT_LINK_EXPIRY_SECONDS = 15 * 60; // 15 minutes

export interface DisplayedMoney {
  amount: string;
  currency: string;
}

export type ProvisioningResult =
  | { mode: 'mock'; amount: string; currency: 'INR' }
  | { mode: 'dry-run'; amount: string; currency: string; orderId: string }
  | { mode: 'real'; amount: string; currency: string; orderId: string; paymentLinkUrl: string };

export interface LinearProvisionerOptions {
  billingUrl?: string;
  browserDataDir?: string;
  artifactsDir?: string;
  headless?: boolean;
  devMode?: boolean;
  manualTimeoutMs?: number;
}

export class LinearProvisioner {
  private readonly billingUrl: string;
  private readonly browserDataDir: string;
  private readonly artifactsDir: string;
  private readonly headless: boolean;
  private readonly devMode: boolean;
  private readonly manualTimeoutMs: number;
  private activeBrowserRunId?: string;

  constructor(options: LinearProvisionerOptions = {}) {
    this.billingUrl = options.billingUrl ?? process.env.LINEAR_BILLING_URL ?? DEFAULT_BILLING_URL;
    this.browserDataDir = path.resolve(
      REPOSITORY_ROOT,
      options.browserDataDir ?? process.env.LINEAR_BROWSER_DATA_DIR ?? '.browser-data',
    );
    this.artifactsDir = path.resolve(
      REPOSITORY_ROOT,
      options.artifactsDir ?? process.env.LINEAR_ARTIFACTS_DIR ?? 'artifacts/linear',
    );
    this.headless = options.headless ?? process.env.LINEAR_HEADLESS === 'true';
    this.devMode = options.devMode ?? process.env.NODE_ENV !== 'production';
    this.manualTimeoutMs = options.manualTimeoutMs ?? envPositiveInteger(
      'LINEAR_MANUAL_TIMEOUT_MS',
      DEFAULT_MANUAL_TIMEOUT_MS,
    );
  }

  async provision(
    run: AgentRun,
    intent: PurchaseIntent,
    requestedMode: AutomationMode,
  ): Promise<ProvisioningResult> {
    const mode: AutomationMode = process.env.ENABLE_MOCK_AGENT === 'true'
      ? 'mock'
      : requestedMode;
    run.context.events.publish(run.context.runId, 'agent:automation_mode', { mode });

    if (mode === 'mock') return this.runMock(run, intent);
    if (this.activeBrowserRunId) {
      const message = `The persistent Linear profile is already in use by run ${this.activeBrowserRunId}.`;
      run.context.events.publish(run.context.runId, 'agent:error', {
        phase: 'linear_browser_lock',
        message,
        retryable: true,
      });
      throw new Error(message);
    }
    this.activeBrowserRunId = run.context.runId;
    try {
      return await this.runBrowserFlow(run, intent, mode);
    } finally {
      this.activeBrowserRunId = undefined;
    }
  }

  private async runMock(run: AgentRun, intent: PurchaseIntent): Promise<ProvisioningResult> {
    const amount = intent.exactAmount;
    const amountPaise = dollarsToPaise(amount);
    run.state.transition('quoting_checkout');
    await this.mockStep(run, 'open_linear_billing');
    await this.mockStep(run, 'configure_seats_and_tier');
    await this.mockStep(run, 'read_checkout_total');
    run.context.events.publish(run.context.runId, 'agent:checkout_total_read', {
      amount,
      currency: 'INR',
      source: 'mock',
    });
    run.state.transition('checkout_quoted');

    // Create mock Razorpay Order
    await delay(90);
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
    await delay(600);
    run.state.transition('passkey_approved');

    // Create mock Payment Link
    const mockPaymentLinkUrl = 'https://rzp.io/mock-payment-link';
    run.paymentLinkUrl = mockPaymentLinkUrl;
    run.context.events.publish(run.context.runId, 'agent:payment_link_created', {
      paymentLinkId: `plink_mock_${run.context.runId.slice(0, 8)}`,
      shortUrl: mockPaymentLinkUrl,
      expireBy: Math.floor(Date.now() / 1000) + PAYMENT_LINK_EXPIRY_SECONDS,
    });
    run.context.events.publish(run.context.runId, 'agent:awaiting_payment', {
      orderId: mockOrderId,
      paymentLinkUrl: mockPaymentLinkUrl,
    });
    run.state.transition('awaiting_payment');

    // Simulate webhook confirmation
    await delay(900);
    run.context.events.publish(run.context.runId, 'agent:webhook_confirmed', {
      orderId: mockOrderId,
      paymentId: `pay_mock_${run.context.runId.slice(0, 8)}`,
      amountPaidPaise: amountPaise,
    });
    run.state.transition('webhook_confirmed');
    run.state.transition('complete');
    run.context.events.publish(run.context.runId, 'agent:complete', {
      outcome: 'Mock Linear purchase completed; no browser or Razorpay network call was made.',
    });
    return { mode: 'mock', amount, currency: 'INR' };
  }

  private async runBrowserFlow(
    run: AgentRun,
    intent: PurchaseIntent,
    mode: 'dry-run' | 'real',
  ): Promise<ProvisioningResult> {
    await mkdir(this.browserDataDir, { recursive: true });
    await mkdir(this.artifactsDir, { recursive: true });

    let browser: BrowserContext;
    try {
      browser = await chromium.launchPersistentContext(this.browserDataDir, {
        channel: 'chrome',
        headless: this.headless,
        viewport: { width: 1440, height: 1000 },
        artifactsDir: this.artifactsDir,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const message = /profile is already in use|Opening in existing browser session/i.test(raw)
        ? 'The Capsule Chrome profile is already open. Close only the Chrome window opened by Capsule, then retry.'
        : raw;
      run.context.events.publish(run.context.runId, 'agent:error', {
        phase: 'linear_browser_launch',
        message,
        retryable: true,
      });
      throw new Error(message);
    }

    const page = browser.pages()[0] ?? await browser.newPage();
    try {
      run.state.transition('quoting_checkout');
      await this.domStep(run, 'open_linear_billing', async () => {
        await page.goto(this.billingUrl, { waitUntil: 'domcontentloaded' });
        await waitForLinearUi(page);
        await page.waitForTimeout(3_000);
        await this.ensureLinearAuthentication(run, page);
        await waitForLinearUi(page);
      });
      await this.domStep(run, 'configure_seats_and_tier', () =>
        this.configureCheckout(run, page, intent),
      );

      const quoted = await this.domStep(run, 'read_checkout_total', () =>
        this.readStableTotal(page),
      );
      run.context.events.publish(run.context.runId, 'agent:checkout_total_read', {
        amount: quoted.amount,
        currency: quoted.currency,
        source: 'linear_dom',
      });
      run.state.transition('checkout_quoted');

      // Create Razorpay Order with exact amount in paise
      const razorpay = this.createRazorpayClient();
      const amountPaise = dollarsToPaise(quoted.amount);
      const order = await razorpay.createOrder(run.context, {
        amount: amountPaise,
        currency: quoted.currency === 'USD' ? 'INR' : quoted.currency,
        receipt: `capsule_${run.context.runId.slice(0, 16)}`,
        notes: {
          capsule_run_id: run.context.runId,
          platform: 'Linear',
          seats: String(intent.seatCount),
          tier: intent.tierName,
        },
      });
      run.orderId = order.id;
      run.state.transition('order_created');

      if (mode === 'dry-run') {
        run.state.transition('dry_run_complete');
        run.context.events.publish(run.context.runId, 'agent:dry_run_complete', {
          orderId: order.id,
          amount: quoted.amount,
          currency: quoted.currency,
        });
        run.context.events.publish(run.context.runId, 'agent:complete', {
          outcome: 'Dry run stopped after reading Linear total and creating the Razorpay Order; no Payment Link was created and no payment was collected.',
        });
        return {
          mode,
          amount: quoted.amount,
          currency: quoted.currency,
          orderId: order.id,
        };
      }

      // Passkey approval (Capsule's own WebAuthn gate, not Razorpay)
      run.context.events.publish(run.context.runId, 'agent:passkey_required', {
        orderId: order.id,
        message: 'Approve this exact-amount purchase with your passkey before Capsule creates the Payment Link.',
      });
      // In a real implementation, the WebAuthn flow would happen here.
      // For the buildathon demo, we auto-approve after a brief delay.
      await delay(500);
      run.state.transition('passkey_approved');

      // Create Payment Link with tight expiry
      const expireBy = Math.floor(Date.now() / 1000) + PAYMENT_LINK_EXPIRY_SECONDS;
      const paymentLink = await razorpay.createPaymentLink(run.context, {
        amount: amountPaise,
        currency: quoted.currency === 'USD' ? 'INR' : quoted.currency,
        expire_by: expireBy,
        reference_id: run.context.runId,
        description: `${intent.seatCount} Linear ${intent.tierName} seat${intent.seatCount === 1 ? '' : 's'} – Capsule`,
        callback_url: `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/payment/complete?runId=${run.context.runId}`,
        callback_method: 'get',
        notes: {
          capsule_run_id: run.context.runId,
          razorpay_order_id: order.id,
        },
      });
      run.paymentLinkId = paymentLink.id;
      run.paymentLinkUrl = paymentLink.short_url;

      // Emit awaiting_payment — user opens this URL to pay
      run.context.events.publish(run.context.runId, 'agent:awaiting_payment', {
        orderId: order.id,
        paymentLinkUrl: paymentLink.short_url,
      });
      run.state.transition('awaiting_payment');

      // Set up a promise that the webhook handler will resolve
      run.webhookPromise = new Promise<void>((resolve) => {
        run.webhookResolve = resolve;
      });

      // Wait for webhook confirmation (with timeout)
      const webhookTimeout = PAYMENT_LINK_EXPIRY_SECONDS * 1000 + 30_000; // link expiry + 30s buffer
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Payment Link expired without payment confirmation.')), webhookTimeout);
      });
      await Promise.race([run.webhookPromise, timeoutPromise]);

      // Webhook handler already transitioned to complete and emitted events.
      // Take a final screenshot.
      const screenshotPath = path.join(this.artifactsDir, `${run.context.runId}-linear.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      run.context.events.publish(run.context.runId, 'agent:screenshot_saved', { path: screenshotPath });

      return {
        mode,
        amount: quoted.amount,
        currency: quoted.currency,
        orderId: order.id,
        paymentLinkUrl: paymentLink.short_url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Linear automation failed';
      const failureScreenshot = path.join(this.artifactsDir, `${run.context.runId}-failure.png`);
      const failureDetails = path.join(this.artifactsDir, `${run.context.runId}-failure.txt`);
      await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => undefined);
      await writeFile(failureDetails, `${message}\nURL: ${page.url()}\n`, 'utf8').catch(() => undefined);
      run.context.events.publish(run.context.runId, 'agent:screenshot_saved', { path: failureScreenshot });
      if (run.state.current !== 'failed') {
        try { run.state.transition('failed'); } catch { /* state may already be terminal */ }
      }
      run.context.events.publish(run.context.runId, 'agent:error', {
        phase: 'linear_provisioning',
        message,
        retryable: true,
      });
      throw error;
    } finally {
      await browser.close();
    }
  }

  private createRazorpayClient(): RazorpayApiClient {
    return new RazorpayApiClient(
      requiredEnv('RAZORPAY_KEY_ID'),
      requiredEnv('RAZORPAY_KEY_SECRET'),
    );
  }

  private async ensureLinearAuthentication(run: AgentRun, page: Page): Promise<void> {
    if (await isAuthenticatedLinearPage(page)) return;
    if (!this.devMode || this.headless) {
      throw new Error('Linear requires manual login/MFA. Run headed in development once to populate .browser-data.');
    }

    const action = await isMfaPage(page) ? 'linear_mfa' : 'linear_login';
    run.context.events.publish(run.context.runId, 'agent:manual_action_required', {
      action,
      message: action === 'linear_mfa'
        ? 'Complete Linear MFA in the opened Chrome window. The persistent profile will be reused.'
        : 'Finish every Linear login screen manually in this window. Use email magic link or passkey, not Google OAuth.',
      url: page.url(),
    });

    const deadline = Date.now() + this.manualTimeoutMs;
    while (Date.now() < deadline) {
      if (await isAuthenticatedLinearPage(page)) {
        await page.goto(this.billingUrl, { waitUntil: 'domcontentloaded' });
        await waitForLinearUi(page);
        await page.waitForTimeout(3_000);
        if (await isAuthenticatedLinearPage(page)) return;
      }
      await page.waitForTimeout(1_000);
    }
    throw new Error('Timed out waiting for manual Linear authentication. Keep email and magic-link steps in the Capsule Chrome window.');
  }

  private async configureCheckout(run: AgentRun, page: Page, intent: PurchaseIntent): Promise<void> {
    await this.pauseForMfaIfNeeded(run, page);
    if (intent.tierName === 'Free') {
      throw new Error('Linear Free has no payable checkout; a Razorpay Order must not be created for it.');
    }
    const billingText = await page.locator('body').innerText();
    const billingUserCount = parseUserCountFromVisibleText(billingText);

    if (intent.tierName === 'Basic') {
      await this.withUiRetry(page, 'open Basic checkout', async () => {
        await clickFirstVisible(page, [
          page.getByRole('button', { name: /upgrade now|upgrade to basic/i }),
          page.getByRole('link', { name: /upgrade now|upgrade to basic/i }),
        ]);
      });
    } else {
      await this.withUiRetry(page, 'open plan chooser', async () => {
        await clickFirstVisible(page, [
          page.getByRole('button', { name: /view all plans|all plans|change plan/i }),
          page.getByRole('link', { name: /view all plans|all plans|change plan/i }),
        ]);
      });
      await page.getByText(/Business/i).first().waitFor({ state: 'visible', timeout: 30_000 });
      await this.withUiRetry(page, 'select Business tier', async () => {
        await clickFirstVisible(page, [
          page.getByRole('button', { name: /Business/i }),
          page.getByRole('radio', { name: /Business/i }),
          page.getByText(/^Business(?:\s|$)/i, { exact: false }),
        ]);
      });
    }

    await page.waitForTimeout(4_000);
    const monthly = page.getByRole('button', { name: /monthly/i });
    if (await monthly.first().isVisible().catch(() => false)) {
      await monthly.first().click();
      await page.waitForTimeout(2_000);
    }

    await this.withUiRetry(page, 'validate seat count', async () => {
      const seats = await firstVisible([
        page.getByLabel(/seats|users|members/i),
        page.getByRole('spinbutton'),
        page.locator('input[name*="seat" i], input[name*="quantity" i]'),
      ]);
      if (seats) {
        await seats.fill(String(intent.seatCount));
        await seats.blur();
        return;
      }

      const visibleText = await page.locator('body').innerText();
      const currentUsers = parseUserCountFromVisibleText(visibleText) ?? billingUserCount;
      if (currentUsers === undefined) {
        throw new Error('Linear exposes no seat input and its current workspace user count could not be read.');
      }
      if (currentUsers !== intent.seatCount) {
        throw new Error(
          `Linear checkout uses the workspace user count (${currentUsers}), but the intent requests ${intent.seatCount}. Adjust workspace members before checkout.`,
        );
      }
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (await hasDisplayedTotal(page)) return;
      await this.withUiRetry(page, 'continue to checkout', async () => {
        await clickFirstVisible(page, [
          page.getByRole('button', { name: /continue|review|next|select plan|upgrade now|proceed|checkout/i }),
          page.getByRole('link', { name: /continue|review|next|upgrade now|proceed|checkout/i }),
        ]);
      });
      await page.waitForTimeout(3_000);
    }
    throw new Error('Linear checkout total did not appear before the payment step.');
  }

  private async readStableTotal(page: Page): Promise<DisplayedMoney> {
    const first = await readDisplayedTotal(page);
    await page.waitForTimeout(TOTAL_STABILITY_DELAY_MS);
    const second = await readDisplayedTotal(page);
    if (first.amount !== second.amount || first.currency !== second.currency) {
      throw new Error(`Linear checkout total was still changing (${formatMoney(first)} -> ${formatMoney(second)}).`);
    }
    return second;
  }

  private async pauseForMfaIfNeeded(run: AgentRun, page: Page): Promise<void> {
    if (!await isMfaPage(page)) return;
    if (!this.devMode || this.headless) throw new Error('Unexpected Linear MFA prompt.');
    run.context.events.publish(run.context.runId, 'agent:manual_action_required', {
      action: 'linear_mfa',
      message: 'Complete the unexpected Linear MFA prompt in the opened Chrome window; automation is paused.',
      url: page.url(),
    });
    const deadline = Date.now() + this.manualTimeoutMs;
    while (Date.now() < deadline && await isMfaPage(page)) await page.waitForTimeout(1_000);
    if (await isMfaPage(page)) throw new Error('Timed out waiting for manual Linear MFA.');
  }

  private async withUiRetry(page: Page, label: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (firstError) {
      await dismissUnexpectedModal(page);
      await page.waitForTimeout(2_000);
      try { await action(); } catch {
        const message = firstError instanceof Error ? firstError.message : String(firstError);
        throw new Error(`${label} failed after one modal-dismiss retry: ${message}`);
      }
    }
  }

  private async domStep<T>(run: AgentRun, step: string, action: () => Promise<T>): Promise<T> {
    run.context.events.publish(run.context.runId, 'agent:dom_step', { step, status: 'started' });
    try {
      const result = await action();
      run.context.events.publish(run.context.runId, 'agent:dom_step', { step, status: 'completed' });
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      run.context.events.publish(run.context.runId, 'agent:dom_step', {
        step,
        status: 'failed',
        detail,
      });
      throw error;
    }
  }

  private async mockStep(run: AgentRun, step: string): Promise<void> {
    await this.domStep(run, step, () => delay(70));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Convert a dollar decimal string like "12.00" to integer paise.
 * For the buildathon demo, we treat 1 USD ≈ 1 INR unit
 * (i.e. $12.00 → 1200 paise = ₹12.00).
 * In production this would use a real exchange rate.
 */
function dollarsToPaise(dollarString: string): number {
  const [whole, fraction = ''] = dollarString.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents; // cents === paise for demo purposes
}

async function waitForLinearUi(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (document.body?.innerText.trim().length ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  ).catch(() => {
    throw new Error('Linear did not finish loading its interactive UI within 30 seconds.');
  });
}

async function isLoginOrMfa(page: Page): Promise<boolean> {
  if (/login|signin|oauth|accounts\.google/i.test(page.url())) return true;
  if (await isMfaPage(page)) return true;
  return Boolean(await firstVisible([
    page.locator('input[type="email"], input[autocomplete="email"], input[name*="email" i]'),
    page.getByRole('link', { name: /log in|sign in/i }),
    page.getByRole('button', { name: /log in|sign in|continue with (google|email|saml)|passkey|send.*link/i }),
    page.getByText(/log in to linear|sign in to linear|enter your email|magic link|check your inbox|couldn.t sign you in|browser or app may not be secure/i),
  ]));
}

async function isAuthenticatedLinearPage(page: Page): Promise<boolean> {
  let url: URL;
  try { url = new URL(page.url()); } catch { return false; }
  if (url.hostname !== 'linear.app' || await isLoginOrMfa(page)) return false;
  return Boolean(await firstVisible([
    page.getByRole('heading', { name: /billing|settings/i }),
    page.getByRole('link', { name: /inbox|my issues|settings/i }),
    page.getByRole('button', { name: /search|workspace|settings/i }),
    page.getByText(/billing history|payment method|current plan|my issues/i),
  ]));
}

async function isMfaPage(page: Page): Promise<boolean> {
  return page.getByText(/two-factor|verification code|check your email|check your inbox|security key|authenticator|magic link|verify your email/i)
    .first().isVisible().catch(() => false);
}

async function dismissUnexpectedModal(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').last();
  if (!await dialog.isVisible().catch(() => false)) return;
  const dismiss = await firstVisible([
    dialog.getByRole('button', { name: /close|cancel|dismiss|not now/i }),
  ]);
  if (dismiss) await dismiss.click();
  else await page.keyboard.press('Escape');
}

async function clickFirstVisible(page: Page, candidates: Locator[]): Promise<void> {
  const target = await firstVisible(candidates);
  if (!target) throw new Error(`No matching visible control found at ${page.url()}`);
  await target.click();
}

async function firstVisible(candidates: Locator[]): Promise<Locator | undefined> {
  for (const candidate of candidates) {
    const first = candidate.first();
    if (await first.isVisible().catch(() => false)) return first;
  }
  return undefined;
}

async function hasDisplayedTotal(page: Page): Promise<boolean> {
  try { await readDisplayedTotal(page); return true; } catch { return false; }
}

async function readDisplayedTotal(page: Page): Promise<DisplayedMoney> {
  for (const frame of page.frames()) {
    const text = await frame.locator('body').innerText().catch(() => '');
    const money = parseDisplayedMoneyFromVisibleText(text);
    if (money) return money;
  }
  throw new Error('A displayed checkout total with an identifiable currency was not found in the Linear DOM.');
}

export function parseUserCountFromVisibleText(text: string): number | undefined {
  const labeled = text.match(/\bUsers?\s*[:\n]?\s*(\d+)\b/i);
  const suffixed = text.match(/\b(\d+)\s+users?\b/i);
  const raw = labeled?.[1] ?? suffixed?.[1];
  if (!raw) return undefined;
  const count = Number(raw);
  return Number.isSafeInteger(count) && count > 0 ? count : undefined;
}

export function parseDisplayedMoneyFromVisibleText(text: string): DisplayedMoney | undefined {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labels = [/total due today/i, /amount due(?: today)?/i, /^total\b/i];
  const symbolCurrencies: Record<string, string> = { '$': 'USD', '\u20B9': 'INR', '\u20AC': 'EUR', '\u00A3': 'GBP' };
  for (const label of labels) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!label.test(lines[index] ?? '')) continue;
      const sample = `${lines[index] ?? ''} ${lines[index + 1] ?? ''}`;
      const match = sample.match(/(?:(USD|INR|EUR|GBP|CAD|AUD)\s*|([$\u20B9\u20AC\u00A3])\s*)([0-9][0-9,]*(?:\.\d{1,2})?)/i);
      if (!match?.[3]) continue;
      const currency = match[1]?.toUpperCase() ?? symbolCurrencies[match[2] ?? ''];
      if (!currency) continue;
      return { amount: Number(match[3].replaceAll(',', '')).toFixed(2), currency };
    }
  }
  return undefined;
}

export function parseTotalFromVisibleText(text: string): string | undefined {
  return parseDisplayedMoneyFromVisibleText(text)?.amount;
}

function formatMoney(money: DisplayedMoney): string {
  return `${money.currency} ${money.amount}`;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for real/dry-run automation.`);
  return value;
}

function envPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
