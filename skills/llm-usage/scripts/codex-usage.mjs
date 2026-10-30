import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert } from '../../opencode-executor/scripts/routing-schema.mjs';

export function normalizeLimits(result, now = Date.now()) {
  const raw = result?.rateLimitsByLimitId ?? (result?.rateLimits ? { [result.rateLimits.limitId ?? 'codex']: result.rateLimits } : null);
  assert(raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length > 0, 'Rate limits unavailable');
  const buckets = Object.entries(raw).map(([id, value]) => {
    assert(/^[a-zA-Z0-9_.:-]{1,120}$/.test(id) && value && typeof value === 'object', 'Unknown quota bucket');
    const window = w => {
      if (w == null) return null;
      assert(typeof w.usedPercent === 'number' && Number.isFinite(w.usedPercent) && w.usedPercent >= 0 && w.usedPercent <= 100 &&
        Number.isSafeInteger(w.resetsAt) && w.resetsAt * 1000 > now && Number.isSafeInteger(w.windowDurationMins) && w.windowDurationMins > 0, 'Invalid or expired quota window');
      return { used_percent: w.usedPercent, remaining_percent: 100 - w.usedPercent, window_minutes: w.windowDurationMins, resets_at: new Date(w.resetsAt * 1000).toISOString() };
    };
    const primary = window(value.primary), secondary = window(value.secondary);
    let credits = null;
    if (value.credits != null) {
      const c = value.credits;
      assert(typeof c.hasCredits === 'boolean' && typeof c.unlimited === 'boolean' && (c.balance == null || (typeof c.balance === 'string' && /^\d+(?:\.\d+)?$/.test(c.balance))), 'Unknown credits format');
      credits = { has_credits: c.hasCredits, unlimited: c.unlimited, balance: c.balance ?? null };
    }
    assert(primary || secondary || credits, 'No account quota information');
    return { id, primary, secondary, credits };
  });
  return { status: 'ok', source: 'codex-app-server:account/rateLimits/read', scope: 'signed-in ChatGPT account; only returned quota buckets', observed_at: new Date(now).toISOString(), buckets };
}

export async function readCodexUsage({ timeoutMs = 10000, spawn: start = spawn } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'skills-codex-usage-'));
  return new Promise(resolve => {
    let child;
    try { child = start('codex', ['app-server'], { cwd, stdio: ['pipe', 'pipe', 'ignore'] }); }
    catch {
      rmSync(cwd, { recursive: true, force: true });
      resolve({ status: 'unavailable', source: 'codex-app-server:account/rateLimits/read', error: 'codex_account_limits_unavailable', buckets: null });
      return;
    }
    let done = false, buffer = '', size = 0, initialized = false;
    const finish = result => {
      if (done) return;
      done = true; clearTimeout(timer);
      child.stdin.end(); child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 1000);
      force.unref(); child.once('close', () => clearTimeout(force));
      resolve(result);
    };
    const unavailable = () => finish({ status: 'unavailable', source: 'codex-app-server:account/rateLimits/read', error: 'codex_account_limits_unavailable', buckets: null });
    const send = message => child.stdin.write(JSON.stringify(message) + '\n');
    const timer = setTimeout(unavailable, timeoutMs);
    child.on('error', unavailable);
    child.on('close', () => { rmSync(cwd, { recursive: true, force: true }); if (!done) unavailable(); });
    child.stdin.on('error', unavailable);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > 1024 * 1024) return unavailable();
      buffer += chunk;
      while (!done && buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try {
          const message = JSON.parse(line);
          if (message.id === 1 && !initialized) {
            if (!message.result || message.error) return unavailable();
            initialized = true;
            send({ method: 'initialized', params: {} });
            send({ method: 'account/rateLimits/read', id: 2 });
          } else if (message.id === 2 && initialized) {
            if (message.error) return unavailable();
            finish(normalizeLimits(message.result));
          }
          // Notifications are irrelevant; never print arbitrary account data.
        } catch { return unavailable(); }
      }
    });
    send({ method: 'initialize', id: 1, params: { clientInfo: { name: 'skills_quota_check', version: '1.0.0' } } });
  });
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    assert(process.argv.length === 2, 'Use codex-usage.mjs without arguments');
    const result = await readCodexUsage();
    writeSync(1, JSON.stringify(result, null, 2) + '\n');
    if (result.status !== 'ok') process.exitCode = 75;
  } catch {
    writeSync(1, JSON.stringify({ status: 'unavailable', error: 'codex_account_limits_unavailable', buckets: null }) + '\n');
    process.exitCode = 75;
  }
}
