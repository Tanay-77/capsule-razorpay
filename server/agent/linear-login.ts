import 'dotenv/config';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const profileDir = path.resolve(
  repositoryRoot,
  process.env.LINEAR_BROWSER_DATA_DIR ?? '.browser-data',
);
const billingUrl = process.env.LINEAR_BILLING_URL ?? 'https://linear.app/settings/billing';
const chrome = await findChrome();

process.stdout.write([
  'Opening the Capsule profile in ordinary Chrome (no Playwright automation flags).',
  'Log into the disposable Linear workspace manually.',
  'When Linear is fully open, close this Chrome window so its session is saved.',
  '',
].join('\n'));

const child = spawn(chrome, [
  `--user-data-dir=${profileDir}`,
  '--new-window',
  billingUrl,
], { stdio: 'inherit' });

const exitCode = await new Promise<number>((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 0));
});
if (exitCode !== 0) process.exitCode = exitCode;

async function findChrome(): Promise<string> {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];

  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* try next known path */ }
  }
  throw new Error('Google Chrome was not found. Set up the Linear profile manually or install Chrome.');
}
