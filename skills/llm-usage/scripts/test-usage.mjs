import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { claimPrompt } from './daily-prompt.mjs';
import { normalizeLimits, readCodexUsage } from './codex-usage.mjs';

const base = mkdtempSync(join(tmpdir(), 'skills-quota-test-'));
after(() => rmSync(base, { recursive: true, force: true }));
const now = new Date('2026-10-30T22:55:00Z');
const bucket = { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: Math.floor(now.getTime() / 1000) + 3600 }, secondary: null };

test('daily reminder is shared/atomic, skips unanswered same-day claims, and becomes due at local midnight', async () => {
  const file = join(base, 'prompt.json'), options = { now, timezone: 'Europe/Berlin' };
  const results = await Promise.all([claimPrompt(file, options), claimPrompt(file, options), claimPrompt(file, options)]);
  assert.equal(results.filter(r => r.ask).length, 1); assert.equal(results[0].day, '2026-10-30');
  const before = readFileSync(file, 'utf8'); assert.equal((await claimPrompt(file, { ...options, now: new Date('2026-10-30T22:59:59Z') })).ask, false);
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal((await claimPrompt(file, { ...options, now: new Date('2026-10-30T23:00:00Z') })).ask, true);
  const state = JSON.parse(readFileSync(file, 'utf8')); assert.deepEqual(Object.keys(state).sort(), ['day', 'prompted_at', 'schema_version', 'timezone']);
});

test('timezone changes and backward clocks do not manufacture another same-day reminder; invalid states remain untouched', async () => {
  const file = join(base, 'timezone.json');
  await claimPrompt(file, { now, timezone: 'UTC' });
  assert.equal((await claimPrompt(file, { now, timezone: 'Pacific/Kiritimati' })).ask, false);
  assert.equal((await claimPrompt(file, { now: new Date('2026-10-29T00:00:00Z'), timezone: 'UTC' })).ask, false);
  await assert.rejects(claimPrompt(file, { now, timezone: 'Invalid/Zone' }));
  const linked = join(base, 'linked.json'); symlinkSync(file, linked); await assert.rejects(claimPrompt(linked));
  const broken = join(base, 'broken.json'); writeFileSync(broken, '{}'); await assert.rejects(claimPrompt(broken)); assert.equal(readFileSync(broken, 'utf8'), '{}');
});

test('Codex normalization keeps distinct buckets and credit units, rejects absent/expired/invalid data', () => {
  const result = normalizeLimits({ rateLimitsByLimitId: { codex: bucket, other: { ...bucket, credits: { hasCredits: true, unlimited: false, balance: '12.5' } } }, private: 'PRIVATE_ACCOUNT' }, now.getTime());
  assert.equal(result.buckets.length, 2); assert.equal(result.buckets[0].primary.remaining_percent, 75);
  assert.equal(result.buckets[1].credits.balance, '12.5'); assert(!JSON.stringify(result).includes('PRIVATE_ACCOUNT'));
  assert.equal(normalizeLimits({ rateLimits: bucket }, now.getTime()).buckets.length, 1);
  for (const value of [null, {}, { rateLimitsByLimitId: {} }, { rateLimits: { ...bucket, primary: { ...bucket.primary, usedPercent: -1 } } }, { rateLimits: { ...bucket, primary: { ...bucket.primary, resetsAt: 1 } } }]) assert.throws(() => normalizeLimits(value, now.getTime()));
});

test('fake Codex RPC queries only account limits after handshake and bounds protocol/auth/exit/timeout failures', async () => {
  for (const mode of ['ok', 'auth', 'protocol', 'exit', 'timeout']) {
    const methods = []; let directory, killed = false;
    const result = await readCodexUsage({ timeoutMs: 30, spawn(command, args, options) {
      assert.equal(command, 'codex'); assert.deepEqual(args, ['app-server']);
      assert.deepEqual(options.stdio, ['pipe', 'pipe', 'ignore']); directory = options.cwd;
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
      child.stdin = new EventEmitter(); child.stdin.end = () => {};
      child.kill = () => { killed = true; queueMicrotask(() => child.emit('close', 0)); };
      const emit = value => queueMicrotask(() => child.stdout.emit('data', JSON.stringify(value) + '\n'));
      child.stdin.write = line => {
        const m = JSON.parse(line); methods.push(m.method);
        if (m.method === 'initialize') emit({ id: m.id, result: {} });
        else if (m.method === 'initialized') {}
        else if (m.method === 'account/rateLimits/read') {
          if (mode === 'auth') emit({ id: m.id, error: { message: 'PRIVATE_ERROR_TOKEN' } });
          else if (mode === 'protocol') queueMicrotask(() => child.stdout.emit('data', 'PRIVATE_NOT_JSON\n'));
          else if (mode === 'exit') queueMicrotask(() => child.emit('close', 1));
          else if (mode === 'ok') emit({ id: m.id, result: { rateLimits: { primary: { usedPercent: 40, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 3600 } }, private: 'PRIVATE_ACCOUNT_TOKEN' } });
        } else assert.fail('Unexpected RPC: ' + m.method);
      };
      return child;
    } });
    assert.deepEqual(methods, ['initialize', 'initialized', 'account/rateLimits/read']);
    assert.equal(result.status, mode === 'ok' ? 'ok' : 'unavailable');
    if (mode === 'ok') assert.equal(result.buckets[0].primary.remaining_percent, 60);
    assert(!JSON.stringify(result).includes('PRIVATE_')); assert(killed); assert(!existsSync(directory));
  }
});

test('Codex CLI entrypoint returns sanitized JSON when no CLI is installed', () => {
  const helper = fileURLToPath(new URL('codex-usage.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [helper], { env: { PATH: base }, encoding: 'utf8', timeout: 3000 });
  assert.equal(result.status, 75, result.stderr); assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).status, 'unavailable');
});
