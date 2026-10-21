import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { catalog, digest, axes, phases, configuration, taskClass, scoreFromReview } from './routing-schema.mjs';
import { select, contextHash, admit, claim, finish } from './route-plan.mjs';
import { readState, checkBudget, totals, transaction } from './budget.mjs';
import { collectUsage } from './collect-usage.mjs';
import { parseModels, buildCatalog, cliBilling } from './refresh-model-catalog.mjs';
import { globalCatalogDirectory, globalCatalogPath } from './catalog-store.mjs';
import { withCredits, normalizeUsage, validateCredits, usageURL } from './credits.mjs';

const scripts = fileURLToPath(new URL('.', import.meta.url));
const scratch = resolve(scripts, '../../../artifacts/opencode/tmp');
mkdirSync(scratch, { recursive: true });
const base = mkdtempSync(join(scratch, 'routing-test.'));
after(() => rmSync(base, { recursive: true, force: true }));
const bin = join(base, 'bin'); mkdirSync(bin);
const fake = join(bin, 'opencode');
writeFileSync(fake, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const line = value => fs.writeSync(1, value + '\\n');
const put = value => line(JSON.stringify(value));
const captureRoot = process.env.ROUTING_TEST_CAPTURE_ROOT || process.cwd();
fs.mkdirSync(path.join(captureRoot, 'artifacts/opencode'), { recursive: true });
const call = { command: args.slice(0, 3) };
if (args[0] === 'run') {
  call.model = args[args.indexOf('--model') + 1];
  call.variant = args.includes('--variant') ? args[args.indexOf('--variant') + 1] : null;
  call.overlay = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT || '{}');
  call.config_disabled = process.env.OPENCODE_DISABLE_PROJECT_CONFIG;
}
fs.appendFileSync(path.join(captureRoot, 'artifacts/opencode/calls.jsonl'), JSON.stringify(call) + '\\n');
if (args[0] === '--version') line('1.18.31');
else if (args[0] === 'debug') put({ local: true, apiKey: 'PRIVATE_CONFIG_SENTINEL' });
else if (args[0] === 'models') {
  const models = JSON.parse(fs.readFileSync(process.env.ROUTING_TEST_MODELS, 'utf8'));
  for (const [id, metadata] of Object.entries(models)) { line(id); line(JSON.stringify(metadata, null, 2)); }
} else if (args[0] === 'run') {
  const scenario = process.env.ROUTING_TEST_SCENARIO || 'success';
  const fail = call.model === 'fixture/free' && !['success', 'missing-usage'].includes(scenario) || scenario === 'both-fail';
  const error = { type: 'error', error: { name: 'APIError', data: { statusCode: 503, isRetryable: true, message: 'PRIVATE_ERROR_SENTINEL' } } };
  if (fail) {
    if (scenario === 'changed') fs.appendFileSync('user.txt', 'executor change');
    if (scenario === 'tool') put({ type: 'tool_use', part: { type: 'tool', tool: 'shell', state: { status: 'completed' } } });
    if (scenario === 'step') put({ type: 'step_start', part: { type: 'step-start', id: 'start' } });
    if (scenario === 'unknown') error.error.name = 'UnknownError';
    if (scenario === 'truncated') process.stdout.write(JSON.stringify(error));
    else put(error);
    process.exitCode = 42;
  } else {
    const report = '# Status\\n\\nSUCCESS\\n\\n# Implemented\\n\\n- Fixture.\\n\\n# Changed Files\\n\\n- none\\n\\n# Verification\\n\\n- Fixture check passed.\\n\\n# Plan Deviations\\n\\n- none\\n\\n# Blockers\\n\\n- none\\n';
    fs.writeFileSync('.agents/IMPLEMENTATION_REPORT.md', report);
    if (scenario !== 'missing-usage') put({ type: 'step_finish', part: { type: 'step-finish', id: 'finish', tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 0 } } } });
  }
} else { console.error('Unexpected fake command'); process.exitCode = 99; }
`, { mode: 0o755 });
// Never inherit real OpenCode profiles/inline secrets into script fixtures.
for (const k of Object.keys(process.env)) if (k.startsWith('OPENCODE_')) delete process.env[k];
process.env.PATH = `${bin}:${process.env.PATH}`;
process.env.XDG_CONFIG_HOME = join(base, 'config');
process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ permission: { shell: 'deny' }, agent: { build: { permission: { edit: 'ask' } } } });
const assessment = score => Object.fromEntries(axes.map(k => [k, { score, basis: score === null ? 'unknown' : 'observed', evidence: 'Fixture native acceptance evidence' }]));
const entry = (model, variant, billing, score = 3) => ({ model, variant, variant_hash: digest(variant), context: 10000, output: 1000, tool_use: true,
  billing, rates: Object.fromEntries(['input', 'output', 'cache_read', 'cache_write'].map(k => [k, billing === 'free' ? 0 : 1_000_000])),
  assessment: assessment(score), evidence: 'Fixture locally verified billing and task qualification', requires_xhigh: false, outcomes: [] });
const save = (root, path, value) => writeFileSync(join(root, path), JSON.stringify(value));
let serial = 0;
function fixture() {
  const root = join(base, `consumer ${serial++}`); mkdirSync(join(root, '.agents/skills'), { recursive: true });
  symlinkSync(resolve(scripts, '..'), join(root, '.agents/skills/opencode-executor'));
  writeFileSync(join(root, '.gitignore'), 'artifacts/\n');
  writeFileSync(join(root, 'user.txt'), 'preserved user work\n');
  writeFileSync(join(root, 'AGENTS.md'), '# Local constraints\nUse native checks.\n');
  writeFileSync(join(root, '.agents/PLAN.md'), '# Goal\n\nReady: fixture implementation.\n\n# Relevant Instructions\n\nnone\n');
  save(root, '.agents/executor.json', { model: 'legacy/model', effort: 'high', instructions: ['AGENTS.md'] });
  execFileSync('git', ['init', '-q', root], { stdio: ['ignore', 'pipe', 'pipe'] });
  const entries = [entry('fixture/free', 'custom-careful', 'free'), entry('fixture/go', null, 'go')];
  save(root, '.agents/model-catalog.json', { schema_version: 1, revision: 'fixture-r1', credit_unit: 'microUSD',
    source: { kind: 'opencode-cli', cli_version: '1.18.31', captured_at: '2026-10-21T00:00:00Z', context_hash: contextHash(root), metadata_hash: 'fixture' }, entries });
  save(root, '.agents/routing-policy.json', { schema_version: 1, enabled: true, minimum_score: 1, default_go: [{ model: 'fixture/go', variant: null }],
    specialists: [], allow_provisional: false, auto_fallback: true, reserve_multiplier: 1 });
  const cap = { tokens: 10000, credits: 10000 };
  save(root, '.agents/budget.json', { schema_version: 1, period: 'fixture-period', credit_unit: 'microUSD', enforcement: 'estimated', project: cap,
    per_run: { tokens: 1000, credits: 1000 }, phases: Object.fromEntries(phases.map(k => [k, cap])), reserves: { repair: { tokens: 100, credits: 100 }, validation: { tokens: 100, credits: 100 } } });
  save(root, '.agents/executor-task.json', { schema_version: 1, task_id: 'task-fixture', operations: ['implementation'], complexity: 1, risk: 1, validation: 3,
    context_tokens: 500, output_tokens: 100, estimated_tokens: { input: 100, output: 100, cache_read: 0, cache_write: 0 }, phase: 'implementation' });
  return root;
}
function run(root, scenario = 'success', extra = []) {
  return spawnSync('bash', [join(scripts, 'execute-plan.sh'), '--project', root, ...extra], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, ROUTING_TEST_SCENARIO: scenario }, timeout: 20000 });
}
function calls(root) { const f = join(root, 'artifacts/opencode/calls.jsonl'); return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse) : []; }
function state(root) { return readState(root, configuration(root).b); }
function successful(result) { assert.equal(result.status, 0, JSON.stringify({ stdout: result.stdout, stderr: result.stderr, error: result.error?.code })); }

const usagePayload = (percent = 0, reset = Date.now() + 3600000) => ({ usage: Object.fromEntries(['rolling', 'weekly', 'monthly'].map(w => [w, { status: 'ok', percent, resetsAt: new Date(reset).toISOString() }])) });
function sharedFixture() {
  const directory = mkdtempSync(join(base, 'shared-credits.')), file = join(directory, 'credits.json');
  const day = new Date().toISOString().slice(0, 10);
  const value = { schema_version: 1, extra_credit_budget_micro_usd: 0,
    billing: { enabled: false, period: 'fixture', limit_micro_usd: 300, per_run_limit_micro_usd: 300, reserves_micro_usd: { repair: 0, validation: 0 } },
    volume: { enabled: true, max_percent: { rolling: 60, weekly: 100, monthly: 100 }, reserves_percent: { repair: 15, validation: 15 }, rounding_margin_percent: 1, timeout_ms: 100,
      allowances: { 'opencode-go/fixture': { limits_micro_usd: { rolling: 1000, weekly: 2000, monthly: 4000 }, cost_multiplier: 1, source: 'https://example.invalid/fixture-evidence', verified_at: day, valid_until: new Date(Date.now() + 32 * 86400000).toISOString().slice(0, 10) } } },
    state: { period: 'fixture', account_hash: null, snapshot: null, runs: {} } };
  writeFileSync(file, JSON.stringify(value, null, 2));
  writeFileSync(join(directory, '.env'), 'OPENCODE_GO_API_KEY="PRIVATE_USAGE_KEY"\n', { mode: 0o600 });
  return { directory, file, value, put: () => writeFileSync(file, JSON.stringify(value, null, 2)), get: () => JSON.parse(readFileSync(file, 'utf8')) };
}
const fakeUsage = payload => async (url, options) => {
  assert.equal(url, usageURL); assert.equal(options.headers.Authorization, 'Bearer PRIVATE_USAGE_KEY'); assert.equal(options.redirect, 'error');
  return { ok: true, text: async () => JSON.stringify(payload ?? usagePayload()) };
};
function attachShared(root, f, goOnly = true) {
  const cfg = configuration(root); cfg.c.entries[1].model = 'opencode-go/fixture';
  cfg.p.default_go[0].model = 'opencode-go/fixture'; cfg.p.credits = f.file;
  // Keep the Free candidate qualified, but below the task's actual threshold.
  if (goOnly) { cfg.c.entries[0].assessment = assessment(1); cfg.t.risk = 3; }
  save(root, '.agents/model-catalog.json', cfg.c); save(root, '.agents/routing-policy.json', cfg.p); save(root, '.agents/executor-task.json', cfg.t);
}

test('usage adapter accepts only complete verified windows and never invents reset or billing data', () => {
  const now = Date.now(), good = usagePayload(0, now + 10000);
  assert.equal(normalizeUsage(good, now).usage.rolling.percent, 0);
  for (const mutate of [p => { delete p.usage.weekly; }, p => { p.usage.rolling.percent = -1; },
    p => { p.usage.rolling.status = 'unknown'; }, p => { p.usage.rolling.resetsAt = new Date(now).toISOString(); },
    p => { p.usage.rolling.percent = '0'; }, p => { p.balance = 4.33; }]) {
    const p = structuredClone(good); mutate(p); assert.throws(() => normalizeUsage(p, now));
  }
  assert.throws(() => normalizeUsage({ rollingUsage: { usagePercent: 0 } }, now));
  const f = sharedFixture(); f.value.extra_credit_budget_micro_usd = 1; assert.throws(() => validateCredits(f.value));
});
test('billing and volume switches are independent; both enabled require both checks', async () => {
  for (const billing of [false, true]) for (const volume of [false, true]) {
    const f = sharedFixture(); f.value.billing.enabled = billing; f.value.volume.enabled = volume; f.put();
    await withCredits(base, f.file, async ctx => {
      if (volume) await ctx.refresh();
      const d = ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation');
      assert.equal(!!d.billing, billing); assert.equal(!!d.volume, volume);
      ctx.data.billing.limit_micro_usd = 199;
      assert.equal((() => { try { ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation'); return true; } catch { return false; } })(), !billing);
    }, { fetch: fakeUsage() });
  }
});
test('missing key, API failure, malformed payload, rate limit and changed account deny Go but permit qualified Free', async () => {
  for (const mode of ['missing', 'http', 'payload', 'rate-limited', 'account', 'expired-allowance', 'shell-substitution']) {
    const f = sharedFixture();
    if (mode === 'missing') rmSync(join(f.directory, '.env'));
    if (mode === 'account') { f.value.state.account_hash = digest('different_key'); f.put(); }
    if (mode === 'expired-allowance') { f.value.volume.allowances['opencode-go/fixture'].verified_at = '2000-01-01'; f.value.volume.allowances['opencode-go/fixture'].valid_until = '2000-01-02'; f.put(); }
    if (mode === 'shell-substitution') writeFileSync(join(f.directory, '.env'), 'OPENCODE_GO_API_KEY=$(touch SHOULD_NOT_EXIST)\n');
    const p = usagePayload(); if (mode === 'rate-limited') p.usage.weekly.status = 'rate-limited';
    const request = mode === 'http' ? async () => ({ ok: false }) : mode === 'payload' ? fakeUsage({ usage: {} }) : fakeUsage(p);
    await withCredits(base, f.file, async ctx => {
      await ctx.refresh();
      assert.throws(() => ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation'));
      assert.doesNotThrow(() => ctx.check({ model: 'fixture/free', billing: 'free' }, { credits: 0 }, 'implementation'));
    }, { fetch: request });
    assert.equal(existsSync(join(f.directory, 'SHOULD_NOT_EXIST')), false);
    assert.doesNotMatch(readFileSync(f.file, 'utf8'), /PRIVATE_USAGE_KEY/);
  }
});
test('usage body timeout fails closed and never follows a redirect with the bearer', async () => {
  const f = sharedFixture();
  await withCredits(base, f.file, async ctx => {
    await ctx.refresh(); assert.equal(ctx.unavailable, true); assert.equal(ctx.live, false);
  }, { fetch: async (_url, { signal, redirect }) => {
    assert.equal(redirect, 'error');
    return { ok: true, text: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('PRIVATE_ERROR')), { once: true })) };
  } });
});
test('denied starts retain dated telemetry/errors without replacing prior usage with zero', async () => {
  const f = sharedFixture();
  await withCredits(base, f.file, async ctx => {
    await ctx.refresh();
    assert.throws(() => ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation'), /volume/);
  }, { fetch: fakeUsage(usagePayload(90)) });
  assert.equal(f.get().state.snapshot.usage.rolling.percent, 90);
  await withCredits(base, f.file, async ctx => {
    await ctx.refresh(); assert.equal(ctx.unavailable, true);
  }, { fetch: async () => ({ ok: false, status: 401, text: async () => 'PRIVATE_ERROR_BODY' }) });
  const stored = f.get(); assert.equal(stored.state.snapshot.usage.rolling.percent, 90);
  assert.equal(stored.state.last_error.code, 'usage_http_401');
  assert.doesNotMatch(JSON.stringify(stored), /PRIVATE_ERROR_BODY|PRIVATE_USAGE_KEY/);
});
test('agent-facing credits CLI emits sanitized JSON for cached status and refresh failures', () => {
  const f = sharedFixture(); rmSync(join(f.directory, '.env'));
  const invoke = extra => spawnSync(process.execPath, [join(scripts, 'credits.mjs'), 'status', f.file, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000 });
  const cached = invoke([]); successful(cached); assert.equal(JSON.parse(cached.stdout).refreshed, false);
  const failed = invoke(['--refresh']); assert.equal(failed.status, 75);
  const result = JSON.parse(failed.stdout); assert.equal(result.status, 'unavailable'); assert.equal(result.refreshed, false);
  assert.equal(result.last_error.code, 'usage_key'); assert.equal(result.snapshot, null);
  assert.equal(failed.stderr, ''); assert.doesNotMatch(failed.stdout, /PRIVATE_USAGE_KEY/);
});
test('cross-project admission reserves one shared Go pool atomically and claim is single use', async () => {
  const f = sharedFixture(), a = fixture(), b = fixture(); attachShared(a, f); attachShared(b, f);
  const original = globalThis.fetch; globalThis.fetch = fakeUsage();
  try {
    const results = await Promise.allSettled([admit(a), admit(b)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const index = results.findIndex(r => r.status === 'fulfilled'), root = [a, b][index], d = results[index].value;
    assert.equal(Object.keys(f.get().state.runs).length, 1); assert.equal(d.shared_credits.reservation.volume.rolling, 20);
    assert.equal(d.shared_credits.volume.rolling.protected_percent, 30);
    await claim(root, d.run_id); await assert.rejects(claim(root, d.run_id));
    assert.equal(f.get().state.runs[d.run_id].state, 'started');
    assert.doesNotMatch(JSON.stringify(state(root)), /PRIVATE_USAGE_KEY/);
    assert.equal(calls(a).length + calls(b).length, 0);
  } finally { globalThis.fetch = original; }
});
test('Go claim rechecks live usage and immutable configuration; preflight stays offline and read-only', async () => {
  const f = sharedFixture(), root = fixture(); attachShared(root, f);
  successful(run(root, 'success', ['--check'])); assert.equal(existsSync(join(root, 'artifacts')), false);
  assert.equal(f.get().state.snapshot, null);
  const original = globalThis.fetch; globalThis.fetch = fakeUsage();
  try {
    const d = await admit(root);
    globalThis.fetch = fakeUsage(usagePayload(95)); await assert.rejects(claim(root, d.run_id), /volume/);
    assert.equal(state(root).runs[d.run_id].state, 'admitted'); assert.equal(f.get().state.runs[d.run_id].state, 'admitted');
    const data = f.get(); data.volume.max_percent.rolling = 99; writeFileSync(f.file, JSON.stringify(data));
    globalThis.fetch = fakeUsage(); await assert.rejects(claim(root, d.run_id), /configuration changed/);
    assert.equal(f.get().state.runs[d.run_id].state, 'admitted');
  } finally { globalThis.fetch = original; }
});
test('Free execution tolerates unavailable usage; fallback cannot bypass failed volume admission', async () => {
  const f = sharedFixture(), root = fixture(); attachShared(root, f, false); rmSync(join(f.directory, '.env'));
  const original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; throw Error('Unexpected network'); };
  try {
    successful(run(root)); assert.equal(requests, 0);
    assert.equal(Object.values(f.get().state.runs)[0].state, 'finished');
    assert.equal(f.get().state.last_error.code, 'usage_key');
    const second = fixture(); attachShared(second, f, false);
    const failed = run(second, 'technical'); assert.equal(failed.status, 75, failed.stdout + failed.stderr);
    assert.equal(calls(second).length, 1); assert.equal(state(second).tasks['task-fixture'].fallbacks, 0);
    assert.equal(Object.keys(f.get().state.runs).length, 2);
  } finally { globalThis.fetch = original; }
});
test('every Free start refreshes enabled account windows; disabled checks stay offline and failures remain nonblocking', async () => {
  const f = sharedFixture(), original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async (...args) => { requests++; return fakeUsage(usagePayload(requests * 10))(...args); };
  try {
    for (const expected of [10, 20]) {
      const root = fixture(); attachShared(root, f, false);
      const d = await admit(root); assert.equal(d.billing, 'free');
      assert.equal(requests, expected / 10 - 1);
      await claim(root, d.run_id);
      assert.equal(requests, expected / 10); assert.equal(f.get().state.snapshot.usage.monthly.percent, expected);
    }
    const root = fixture(); attachShared(root, f, false);
    const d = await admit(root);
    globalThis.fetch = async () => { requests++; return { ok: false, status: 503 }; };
    await claim(root, d.run_id);
    assert.equal(requests, 3); assert.equal(state(root).runs[d.run_id].state, 'started');
    assert.equal(f.get().state.snapshot.usage.monthly.percent, 20); assert.equal(f.get().state.last_error.code, 'usage_http_503');
    const data = f.get(); data.volume.enabled = false; writeFileSync(f.file, JSON.stringify(data));
    const offline = fixture(); attachShared(offline, f, false);
    const next = await admit(offline); await claim(offline, next.run_id); assert.equal(requests, 3);
  } finally { globalThis.fetch = original; }
});
test('shared write-ahead reservation survives interrupted local commit instead of replenishing the pool', async () => {
  const f = sharedFixture();
  await assert.rejects(withCredits(base, f.file, async ctx => {
    await ctx.refresh();
    const shared_credits = ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation');
    ctx.reserve({ run_id: 'orphan', model: 'opencode-go/fixture', variant: null, phase: 'implementation', shared_credits });
    throw Error('Simulated local commit interruption');
  }, { fetch: fakeUsage() }));
  assert.equal(f.get().state.runs.orphan.state, 'admitted');
  await withCredits(base, f.file, async ctx => {
    await ctx.refresh(); assert.throws(() => ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'fallback'), /volume/);
  }, { fetch: fakeUsage() });
});
test('separate consuming processes cannot spend the same shared billing remainder', async () => {
  const f = sharedFixture(), roots = [fixture(), fixture()]; f.value.billing.enabled = true; f.value.volume.enabled = false; f.put();
  roots.forEach(root => attachShared(root, f));
  const invoke = root => new Promise(resolveResult => {
    const program = `import {admit} from ${JSON.stringify(join(scripts, 'route-plan.mjs'))}; try { await admit(process.argv[1]); process.exitCode=0; } catch { process.exitCode=75; }`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', program, root], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    child.on('error', resolveResult); child.on('close', code => resolveResult({ code, output }));
  });
  const results = await Promise.all(roots.map(invoke));
  assert.equal(results.filter(r => r.code === 0).length, 1, JSON.stringify(results));
  assert.equal(Object.keys(f.get().state.runs).length, 1);
  assert.equal(roots.reduce((n, root) => n + Object.keys(state(root).runs).length, 0), 1);
});
test('shared repair and validation reserves remain protected for implementation and fallback', async () => {
  const f = sharedFixture(); f.value.billing.enabled = true;
  f.value.billing.limit_micro_usd = 250; f.value.billing.reserves_micro_usd = { repair: 30, validation: 30 }; f.put();
  await withCredits(base, f.file, async ctx => {
    await ctx.refresh();
    const e = { model: 'opencode-go/fixture', billing: 'go' };
    for (const phase of ['implementation', 'fallback', 'specialist']) assert.throws(() => ctx.check(e, { credits: 200 }, phase), /billing/);
    for (const phase of ['repair', 'validation']) assert.doesNotThrow(() => ctx.check(e, { credits: 200 }, phase));
    ctx.data.billing.enabled = false; ctx.data.volume.max_percent.rolling = 50;
    for (const phase of ['implementation', 'fallback']) assert.throws(() => ctx.check(e, { credits: 200 }, phase), /volume/);
    for (const phase of ['repair', 'validation']) assert.doesNotThrow(() => ctx.check(e, { credits: 200 }, phase));
  }, { fetch: fakeUsage() });
});
test('Go settlement uses its admitted multiplier, preserves window shadows and records the fresh start check', async () => {
  const f = sharedFixture(), root = fixture(); f.value.billing.enabled = true;
  f.value.billing.limit_micro_usd = 1000; f.value.billing.per_run_limit_micro_usd = 1000;
  f.value.volume.max_percent.rolling = 100; f.value.volume.allowances['opencode-go/fixture'].cost_multiplier = 2; f.put(); attachShared(root, f);
  const original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async (...args) => { requests++; return fakeUsage()(...args); };
  try {
    const d = await admit(root); await claim(root, d.run_id);
    const directory = join(root, 'artifacts/opencode/runs', d.run_id); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'events.jsonl'), JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', id: 'finish', tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 0 } } } }) + '\n');
    const result = await finish(root, d.run_id, 0), r = f.get().state.runs[d.run_id];
    assert.equal(requests, 2); assert.equal(r.usage_credits, 40); assert.equal(r.reservation.volume.rolling, 40);
    assert.equal(r.state, 'finished'); assert.equal(result.shared_credits_start.volume.rolling.percent, 0);
    assert.deepEqual(state(root).runs[d.run_id].decision, d); assert.equal(state(root).runs[d.run_id].decision_hash, digest(d));
    assert.doesNotMatch(readFileSync(join(directory, 'outcome.json'), 'utf8'), /PRIVATE_USAGE_KEY/);
  } finally { globalThis.fetch = original; }
});
test('known completed volume shadows expire only after reset; active and unknown runs remain reserved', async () => {
  const f = sharedFixture(), start = Date.now(); let now = start;
  await withCredits(base, f.file, async ctx => {
    await ctx.refresh();
    const d = { run_id: 'reset-test', model: 'opencode-go/fixture', variant: null, phase: 'implementation', shared_credits: ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation') };
    ctx.reserve(d); ctx.claim(d); ctx.settle(d, { credits: 20 });
    assert.throws(() => ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation'), /volume/);
  }, { fetch: fakeUsage(usagePayload(0, start + 1000)), now: () => now });
  now = start + 2000;
  await withCredits(base, f.file, async ctx => {
    await ctx.refresh();
    assert.doesNotThrow(() => ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation'));
    ctx.data.state.runs['reset-test'].usage_credits = null;
    assert.throws(() => ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation'), /volume/);
    ctx.data.state.runs['reset-test'].usage_credits = 20; ctx.data.state.runs['reset-test'].state = 'started';
    assert.throws(() => ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation'), /volume/);
  }, { fetch: fakeUsage(usagePayload(0, start + 10000)), now: () => now });
});
test('enabling volume does not ignore active Go reservations admitted with volume disabled', async () => {
  const f = sharedFixture(); f.value.volume.enabled = false; f.put();
  await withCredits(base, f.file, ctx => {
    const d = { run_id: 'pre-volume', model: 'opencode-go/fixture', variant: null, phase: 'implementation', shared_credits: ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation') };
    ctx.reserve(d); ctx.claim(d);
  });
  const data = f.get(); data.volume.enabled = true; writeFileSync(f.file, JSON.stringify(data));
  await withCredits(base, f.file, async ctx => {
    await ctx.refresh(); assert.throws(() => ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation'), /Reconcile/);
  }, { fetch: fakeUsage() });
});

test('quota retry waits until every blocking window can fit, rather than the first reset', async () => {
  const f = sharedFixture(), now = Date.now(), payload = usagePayload(0, now + 30000);
  Object.assign(payload.usage.rolling, { percent: 99, resetsAt: new Date(now + 10000).toISOString() });
  Object.assign(payload.usage.weekly, { percent: 99, resetsAt: new Date(now + 20000).toISOString() });
  await withCredits(base, f.file, async ctx => {
    await ctx.refresh();
    assert.throws(() => ctx.check({ model: 'opencode-go/fixture', billing: 'go' }, { credits: 200 }, 'implementation'), e => {
      assert.equal(e.code, 'credits_wait'); assert.equal(e.retry_at, new Date(now + 21000).toISOString());
      assert.deepEqual(e.blocking_windows, ['rolling', 'weekly']); return true;
    });
  }, { fetch: fakeUsage(payload) });
});
test('router reports the earliest feasible quota retry across qualified combinations', async () => {
  const f = sharedFixture(), root = fixture(), now = Date.now(); attachShared(root, f);
  const cfg = configuration(root), extra = entry('opencode-go/fixture-early', null, 'go');
  cfg.c.entries.push(extra); cfg.p.default_go.push({ model: extra.model, variant: null });
  save(root, '.agents/model-catalog.json', cfg.c); save(root, '.agents/routing-policy.json', cfg.p);
  f.value.volume.reserves_percent = { repair: 0, validation: 0 };
  f.value.volume.allowances[extra.model] = { ...f.value.volume.allowances['opencode-go/fixture'], limits_micro_usd: { rolling: 1000, weekly: 50000, monthly: 4000 } }; f.put();
  const payload = usagePayload(0, now + 30000);
  Object.assign(payload.usage.rolling, { percent: 57, resetsAt: new Date(now + 10000).toISOString() });
  Object.assign(payload.usage.weekly, { percent: 97, resetsAt: new Date(now + 20000).toISOString() });
  const original = globalThis.fetch; globalThis.fetch = fakeUsage(payload);
  try {
    await assert.rejects(admit(root), e => { assert.equal(e.code, 'credits_wait'); assert.equal(e.retry_at, new Date(now + 11000).toISOString()); return true; });
  } finally { globalThis.fetch = original; }
});
test('enabled quota wait releases accounting locks, performs no polling and re-admits after fresh usage', async () => {
  const f = sharedFixture(), root = fixture(), start = Date.now(); let clock = start, requests = 0, sleeps = 0, notices = 0;
  f.value.volume.wait_for_reset = true; f.put(); attachShared(root, f);
  const original = globalThis.fetch;
  globalThis.fetch = async (...args) => { requests++; return fakeUsage(usagePayload(requests === 1 ? 99 : 0, start + (requests === 1 ? 180000 : 360000)))(...args); };
  try {
    const d = await admit(root, false, null, {
      now: () => clock,
      sleep: async ms => {
        assert(ms > 0 && ms <= 60000); sleeps++; assert.equal(requests, 1);
        assert.equal(existsSync(f.file + '.lock'), false); assert.equal(existsSync(join(root, 'artifacts/opencode/budget/lock')), false);
        assert.equal(Object.keys(f.get().state.runs).length, 0); assert.equal(Object.keys(state(root).runs).length, 0);
        clock += ms;
      },
      onWait: record => { notices++; assert.equal(record.status, 'waiting_for_credits'); assert.equal(record.retry_at, new Date(start + 181000).toISOString()); }
    });
    assert.equal(requests, 2); assert.equal(sleeps, 4); assert.equal(notices, 1);
    assert.equal(d.model, 'opencode-go/fixture'); assert.equal(Object.keys(state(root).runs).length, 1);
    assert.equal(JSON.parse(readFileSync(join(root, 'artifacts/opencode/credit-wait.json'))).status, 'released');
    assert.equal(calls(root).length, 0);
  } finally { globalThis.fetch = original; }
});
test('waiting at claim retains the same model, variant, reservation and single-use entitlement', async () => {
  const f = sharedFixture(), root = fixture(), start = Date.now(); let clock = start, requests = 0;
  f.value.volume.wait_for_reset = true; f.put(); attachShared(root, f);
  const original = globalThis.fetch;
  globalThis.fetch = async (...args) => { requests++; return fakeUsage(usagePayload(requests === 2 ? 99 : 0, start + requests * 10000))(...args); };
  try {
    const d = await admit(root), result = await claim(root, d.run_id, {
      now: () => clock, sleep: async ms => { clock += ms; },
      onWait: record => {
        assert.equal(record.run_id, d.run_id); assert.equal(state(root).runs[d.run_id].state, 'admitted');
        assert.equal(f.get().state.runs[d.run_id].state, 'admitted');
        assert.equal(totals(state(root)).all.credits, d.reservation.credits); assert.equal(state(root).tasks[d.task_id].fallbacks, 0);
      }
    });
    assert.equal(requests, 3); assert.deepEqual(result, d); assert.equal(state(root).runs[d.run_id].state, 'started');
    await assert.rejects(claim(root, d.run_id), /already used/); assert.equal(calls(root).length, 0);
  } finally { globalThis.fetch = original; }
});
test('workspace or shared configuration changes while waiting require supervision, without a start', async () => {
  for (const kind of ['workspace', 'credits']) {
    const f = sharedFixture(), root = fixture(), start = Date.now(); let clock = start;
    f.value.volume.wait_for_reset = true; f.put(); attachShared(root, f);
    const original = globalThis.fetch; globalThis.fetch = fakeUsage(usagePayload(99, start + 10000));
    try {
      await assert.rejects(admit(root, false, null, { now: () => clock, onWait: () => {}, sleep: async ms => {
        clock += ms;
        if (kind === 'workspace') writeFileSync(join(root, 'user.txt'), 'new user work\n');
        else { const data = f.get(); data.volume.max_percent.rolling = 100; writeFileSync(f.file, JSON.stringify(data)); }
      } }), /changed while waiting/);
      assert.equal(Object.keys(state(root).runs).length, 0); assert.equal(calls(root).length, 0);
      assert.equal(JSON.parse(readFileSync(join(root, 'artifacts/opencode/credit-wait.json'))).status, 'blocked');
    } finally { globalThis.fetch = original; }
  }
});
test('billing limits, API errors and reset-insufficient reserves never enter automatic quota wait', async () => {
  for (const kind of ['billing', 'api', 'reserves']) {
    const f = sharedFixture(), root = fixture(); f.value.volume.wait_for_reset = true;
    if (kind === 'billing') { f.value.billing.enabled = true; f.value.billing.limit_micro_usd = 100; }
    if (kind === 'reserves') f.value.volume.max_percent.rolling = 20;
    f.put(); attachShared(root, f);
    const original = globalThis.fetch; globalThis.fetch = kind === 'api' ? async () => ({ ok: false, status: 401 }) : fakeUsage();
    try {
      await assert.rejects(admit(root, false, null, { onWait: () => { assert.fail('Unexpected automatic wait'); }, sleep: async () => { assert.fail('Unexpected sleep'); } }));
      assert.equal(existsSync(join(root, 'artifacts/opencode/credit-wait.json')), false); assert.equal(Object.keys(state(root).runs).length, 0);
    } finally { globalThis.fetch = original; }
  }
});
test('runner waits through quota reset before Go execution, including one safe Free fallback', () => {
  for (const fallback of [false, true]) {
    const f = sharedFixture(), root = fixture(); f.value.volume.wait_for_reset = true; f.put(); attachShared(root, f, !fallback);
    const trace = join(f.directory, 'usage-count.json'), preload = join(f.directory, 'fake-usage.cjs');
    writeFileSync(preload, `const fs = require('node:fs');
globalThis.fetch = async (url, options) => {
  if (url !== 'https://opencode.ai/zen/go/v1/usage' || options.redirect !== 'error') throw Error('Unexpected request');
  const file = process.env.ROUTING_TEST_USAGE_TRACE;
  const count = (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : 0) + 1;
  fs.writeFileSync(file, JSON.stringify(count));
  const blocked = count <= Number(process.env.ROUTING_TEST_USAGE_BLOCK_UNTIL);
  const payload = {usage: Object.fromEntries(['rolling','weekly','monthly'].map(w => [w, {status:'ok', percent: blocked ? 99 : 0, resetsAt: new Date(Date.now() + (blocked ? 200 : 3600000)).toISOString()}]))};
  return {ok: true, text: async () => JSON.stringify(payload)};
};\n`);
    const result = spawnSync('bash', [join(scripts, 'execute-plan.sh'), '--project', root], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
      env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(preload)}`,
        ROUTING_TEST_USAGE_TRACE: trace, ROUTING_TEST_USAGE_BLOCK_UNTIL: fallback ? '2' : '1', ROUTING_TEST_SCENARIO: fallback ? 'technical' : 'success' }
    });
    successful(result);
    assert.deepEqual(calls(root).map(c => c.model), fallback ? ['fixture/free', 'opencode-go/fixture'] : ['opencode-go/fixture']);
    assert.equal(state(root).tasks['task-fixture'].fallbacks, fallback ? 1 : 0);
    assert.equal(JSON.parse(readFileSync(trace)), fallback ? 4 : 3);
    assert.equal((result.stderr.match(/waiting_for_credits/g) ?? []).length, 1);
    assert.equal(JSON.parse(readFileSync(join(root, 'artifacts/opencode/credit-wait.json'))).status, 'released');
    assert.equal(existsSync(join(root, 'artifacts/opencode/workspace.lock')), false);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_USAGE_KEY/);
  }
});

test('routing is catalog-only, check is read-only, exact custom variant and restrictive overlay reach one executor', () => {
  const root = fixture();
  successful(run(root, 'success', ['--check']));
  assert.equal(existsSync(join(root, 'artifacts')), false);
  assert.equal(existsSync(join(root, '.agents/IMPLEMENTATION_REPORT.md')), false);
  successful(run(root));
  const cs = calls(root); assert.equal(cs.length, 1); assert.equal(cs[0].command[0], 'run');
  assert.equal(cs[0].model, 'fixture/free'); assert.equal(cs[0].variant, 'custom-careful');
  assert.equal(cs[0].config_disabled, '1'); assert.equal(cs[0].overlay.agent.build.permission.task, 'deny');
  assert.equal(cs[0].overlay.agent.build.permission.edit, 'ask'); assert.equal(cs[0].overlay.permission.shell, 'deny');
  assert.equal(cs[0].overlay.compaction.auto, false); assert.equal(cs[0].overlay.agent.title.disable, true);
  const records = Object.values(state(root).runs); assert.equal(records.length, 1);
  assert.equal(records[0].decision.catalog_revision, 'fixture-r1'); assert.equal(records[0].decision.eligibility.threshold, 1);
  assert.equal(records[0].outcome.usage.tokens, 20); assert.equal(records[0].outcome.usage.credits, 0);
  const path = join(root, `artifacts/opencode/runs/${records[0].decision.run_id}/decision.json`);
  assert.equal(statSync(path).mode & 0o222, 0); assert.equal(digest(JSON.parse(readFileSync(path))), records[0].decision_hash);
});
test('risk/validation thresholds exclude weak Free; base Go omits variant and overrides legacy medium/high', () => {
  const root = fixture(), c = configuration(root).c; c.entries[0].assessment = assessment(1);
  save(root, '.agents/model-catalog.json', c);
  const t = configuration(root).t; t.risk = 3; t.validation = 0; save(root, '.agents/executor-task.json', t);
  successful(run(root)); assert.equal(calls(root)[0].model, 'fixture/go'); assert.equal(calls(root)[0].variant, null);
});
test('known observed total cost ranks peers; absent success data stays unknown', () => {
  const root = fixture(), cfg = configuration(root), other = entry('fixture/another-free', 'exact', 'free');
  cfg.c.entries.push(other);
  cfg.c.entries[0].outcomes = [{ task_class: taskClass(cfg.t), attempts: 4, successes: 2, credits: 600 }];
  other.outcomes = [{ task_class: taskClass(cfg.t), attempts: 2, successes: 2, credits: 40 }];
  assert.equal(select(cfg, state(root), false).entry.model, other.model);
  other.outcomes = [];
  const chosen = select(cfg, state(root), false); assert.match(chosen.cost_basis, /success-cost-unknown/);
});
test('safe technical Free failure permits one Go start and preserves dirty/staged work', () => {
  const root = fixture(); execFileSync('git', ['-C', root, 'add', 'user.txt'], { stdio: ['ignore', 'pipe', 'pipe'] });
  writeFileSync(join(root, 'user.txt'), 'dirty and staged user changes\n');
  const before = readFileSync(join(root, 'user.txt'));
  successful(run(root, 'technical'));
  assert.deepEqual(calls(root).map(c => c.model), ['fixture/free', 'fixture/go']);
  assert.deepEqual(readFileSync(join(root, 'user.txt')), before);
  const s = state(root), records = Object.values(s.runs);
  assert.equal(s.tasks['task-fixture'].fallbacks, 1); assert.equal(records[0].outcome.fallback_safe, true);
  assert.equal(records[1].decision.fallback_from, records[0].decision.run_id);
  assert.equal(records[1].decision.phase, 'fallback'); assert.equal(records[1].decision.variant, null);
  assert.equal(records[0].outcome.usage.tokens, null); assert.equal(totals(s).all.tokens, 220);
  const repeated = run(root, 'technical'); assert.notEqual(repeated.status, 0); assert.equal(calls(root).length, 2);
});
for (const scenario of ['changed', 'tool', 'step', 'unknown', 'truncated']) {
  test(`unsafe/ambiguous ${scenario} failure never restarts`, () => {
    const root = fixture(), result = run(root, scenario);
    assert.equal(result.status, 42, result.stdout + result.stderr); assert.equal(calls(root).length, 1);
    assert.equal(Object.values(state(root).runs)[0].outcome.fallback_safe, false);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_ERROR_SENTINEL/);
  });
}
test('Go failure ends chain and cannot reset fallback counter', () => {
  const root = fixture(), result = run(root, 'both-fail');
  assert.equal(result.status, 42, result.stdout + result.stderr); assert.equal(calls(root).length, 2);
  assert.equal(state(root).tasks['task-fixture'].fallbacks, 1);
  assert.notEqual(run(root, 'both-fail').status, 0); assert.equal(calls(root).length, 2);
});
test('protected repair/validation reserves deny automatic Go fallback', () => {
  const root = fixture(), b = configuration(root).b;
  b.project.credits = 399; save(root, '.agents/budget.json', b);
  const result = run(root, 'technical'); assert.equal(result.status, 75, result.stdout + result.stderr);
  assert.equal(calls(root).length, 1); assert.equal(state(root).tasks['task-fixture'].fallbacks, 0);
  assert.equal(existsSync(join(root, 'artifacts/opencode/workspace.lock')), false);
});
test('each phase cap is enforced; repair can spend its own reserve without taking validation reserve', () => {
  const root = fixture(), cfg = configuration(root), empty = state(root);
  for (const phase of phases) {
    const b = structuredClone(cfg.b); b.phases[phase].tokens = 10;
    assert.throws(() => checkBudget(empty, b, { tokens: 11, credits: 0 }, phase));
  }
  cfg.b.project = { tokens: 200, credits: 200 };
  assert.doesNotThrow(() => checkBudget(empty, cfg.b, { tokens: 100, credits: 100 }, 'repair'));
  assert.throws(() => checkBudget(empty, cfg.b, { tokens: 101, credits: 101 }, 'repair'));
});
test('atomic admission and single-use start permission under concurrent calls', async () => {
  const root = fixture();
  const results = await Promise.allSettled([admit(root), admit(root)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const id = results.find(r => r.status === 'fulfilled').value.run_id;
  await claim(root, id); await assert.rejects(claim(root, id), /already used/);
  const decision = state(root).runs[id].decision;
  assert.equal(totals(state(root)).all.tokens, decision.reservation.tokens);
});
test('budget is checked again when consuming admission after another execution overruns', async () => {
  const root = fixture(), d = await admit(root), { b } = configuration(root);
  await transaction(root, b, s => {
    const decision = { phase: 'implementation', reservation: { tokens: 1, credits: 0 } };
    s.runs.other = { decision, decision_hash: digest(decision), state: 'finished', outcome: { usage: { tokens: 9900, credits: 0 } } };
  });
  await assert.rejects(claim(root, d.run_id), /budget|reserves/i);
  assert.equal(state(root).runs[d.run_id].state, 'admitted');
});
test('fallback counter and second reservation commit together under concurrent requests', async () => {
  const root = fixture(), d = await admit(root); await claim(root, d.run_id);
  const directory = join(root, 'artifacts/opencode/runs', d.run_id); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'events.jsonl'), JSON.stringify({ type: 'error', error: { name: 'APIError', data: { statusCode: 429, isRetryable: true } } }) + '\n');
  writeFileSync(join(directory, 'placeholder.md'), 'unchanged placeholder'); writeFileSync(join(root, '.agents/IMPLEMENTATION_REPORT.md'), 'unchanged placeholder');
  assert.equal((await finish(root, d.run_id, 1)).fallback_safe, true);
  const results = await Promise.allSettled([admit(root, false, d.run_id), admit(root, false, d.run_id)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(state(root).tasks['task-fixture'].fallbacks, 1);
  assert.equal(Object.keys(state(root).runs).length, 2);
});
test('specialist phase requires and enforces an individual combination limit', () => {
  const root = fixture(), cfg = configuration(root), s = state(root), go = cfg.c.entries[1];
  assert.throws(() => checkBudget(s, cfg.b, { tokens: 100, credits: 100 }, 'specialist', go));
  cfg.b.specialist_limits = [{ model: go.model, variant: go.variant, limit: { tokens: 100, credits: 100 } }];
  assert.doesNotThrow(() => checkBudget(s, cfg.b, { tokens: 100, credits: 100 }, 'specialist', go));
  assert.throws(() => checkBudget(s, cfg.b, { tokens: 101, credits: 100 }, 'specialist', go));
});
test('known input limits and xhigh authorization constrain exact combinations', () => {
  const root = fixture(), cfg = configuration(root);
  cfg.c.entries[0].input = 100;
  cfg.c.entries[1].variant = 'custom-xhigh'; cfg.c.entries[1].requires_xhigh = true;
  cfg.p.default_go[0].variant = 'custom-xhigh';
  assert.throws(() => select(cfg, state(root), false));
  assert.equal(select(cfg, state(root), true).entry.variant, 'custom-xhigh');
});
test('separate processes cannot allocate the same remaining budget', async () => {
  const root = fixture(), cfg = configuration(root); cfg.b.project.tokens = 500; save(root, '.agents/budget.json', cfg.b);
  const program = `import { transaction, checkBudget } from ${JSON.stringify(new URL('./budget.mjs', import.meta.url).href)};
    import { configuration, digest } from ${JSON.stringify(new URL('./routing-schema.mjs', import.meta.url).href)};
    const root=process.argv[1], id=process.argv[2], {b}=configuration(root);
    try { await transaction(root,b,s=>{const reservation={tokens:200,credits:0};checkBudget(s,b,reservation,'implementation');
      const decision={phase:'implementation',reservation};s.runs[id]={decision,decision_hash:digest(decision),state:'admitted'};}); }
    catch {process.exitCode=75;}`;
  function child(id) { return new Promise((yes, no) => { const c = spawn(process.execPath, ['--input-type=module', '-e', program, root, id], { stdio: 'ignore' }); c.on('error', no); c.on('close', yes); }); }
  const codes = await Promise.all([child('one'), child('two')]); assert.deepEqual(codes.sort(), [0, 75]);
  assert.equal(totals(state(root)).all.tokens, 200);
});
test('unknown costs and unknown quality never become qualified Free combinations', () => {
  const root = fixture(), cfg = configuration(root);
  cfg.c.entries[0].billing = 'unknown'; cfg.c.entries[0].rates = null;
  assert.equal(select(cfg, state(root), false).entry.model, 'fixture/go');
  cfg.c.entries[1].assessment.plan_following = { score: null, basis: 'unknown', evidence: 'No evidence' };
  assert.throws(() => select(cfg, state(root), false));
});
test('missing telemetry conservatively retains reservation; duplicate usage is deduplicated', () => {
  const root = fixture(); successful(run(root, 'missing-usage'));
  const record = Object.values(state(root).runs)[0]; assert.equal(record.outcome.usage.tokens, null);
  assert.equal(totals(state(root)).all.tokens, 200);
  const event = { type: 'step_finish', part: { type: 'step-finish', id: 'a', tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 0 } } } };
  const path = join(root, 'events.fixture'); writeFileSync(path, JSON.stringify(event) + '\n' + JSON.stringify(event) + '\n');
  assert.equal(collectUsage(path, configuration(root).c.entries[1], '1.18.31').usage.tokens, 20);
  assert.equal(collectUsage(path, configuration(root).c.entries[1], 'unverified').usage.tokens, null);
});
test('routed overrides, changed context, unsupported hard enforcement and reused revisions fail closed', () => {
  const root = fixture(); assert.equal(run(root, 'success', ['--model', 'fixture/free']).status, 64);
  const b = configuration(root).b; b.enforcement = 'hard'; save(root, '.agents/budget.json', b);
  assert.equal(run(root).status, 75); b.enforcement = 'estimated'; save(root, '.agents/budget.json', b);
  writeFileSync(join(root, '.agents/executor.json'), '{"instructions":[]}');
  assert.equal(run(root).status, 75); assert.equal(calls(root).length, 0);
});
test('failed report preparation cannot continue into an executor call', () => {
  const root = fixture(); mkdirSync(join(root, '.agents/IMPLEMENTATION_REPORT.md'));
  const result = run(root);
  assert.notEqual(result.status, 0); assert.equal(calls(root).length, 0);
  assert.equal(Object.values(state(root).runs)[0].state, 'started');
  assert.equal(existsSync(join(root, 'artifacts/opencode/workspace.lock')), true);
});
test('one global catalog serves distinct approved projects; project state never enters its fingerprint', () => {
  const a = fixture(), b = fixture(), c = configuration(a).c;
  c.schema_version = 2; c.source.scope = 'global'; c.source.context_hash = contextHash(a, 'global'); c.unassessed = []; c.exclusions = [];
  mkdirSync(globalCatalogDirectory(), { recursive: true }); writeFileSync(globalCatalogPath(), JSON.stringify(c));
  const before = contextHash(a, 'global');
  const pa = configuration(a).p; pa.catalog = 'global'; pa.allowed_combinations = [{ model: 'fixture/free', variant: 'custom-careful' }];
  save(a, '.agents/routing-policy.json', pa);
  const pb = configuration(b).p; pb.catalog = 'global'; pb.allowed_combinations = [{ model: 'fixture/go', variant: null }];
  save(b, '.agents/routing-policy.json', pb);
  save(b, '.agents/executor.json', { instructions: [] });
  assert.equal(contextHash(b, 'global'), before);
  assert.equal(configuration(a).catalog_scope, 'global'); assert.equal(configuration(b).catalog_scope, 'global');
  successful(run(a)); successful(run(b));
  assert.equal(calls(a)[0].model, 'fixture/free'); assert.equal(calls(b)[0].model, 'fixture/go');
  assert.equal(readFileSync(globalCatalogPath(), 'utf8'), JSON.stringify(c));
  assert.notEqual(Object.values(state(a).runs)[0].decision.run_id, Object.values(state(b).runs)[0].decision.run_id);
  // Existing project catalogs are still selected without an explicit global setting.
  const legacy = fixture(); assert.equal(configuration(legacy).catalog_scope, 'project'); successful(run(legacy));
});
test('global routing rejects missing approvals and incompatible project config without refresh', () => {
  const root = fixture(), c = configuration(root).c, p = configuration(root).p;
  c.schema_version = 2; c.source.scope = 'global'; c.source.context_hash = contextHash(root, 'global'); c.unassessed = []; c.exclusions = [];
  mkdirSync(globalCatalogDirectory(), { recursive: true }); writeFileSync(globalCatalogPath(), JSON.stringify(c));
  p.catalog = 'global'; save(root, '.agents/routing-policy.json', p);
  assert.equal(run(root, 'success', ['--check']).status, 75); assert.equal(calls(root).length, 0);
  p.allowed_combinations = c.entries.map(e => ({ model: e.model, variant: e.variant })); save(root, '.agents/routing-policy.json', p);
  successful(run(root, 'success', ['--check']));
  writeFileSync(join(root, 'opencode.json'), '{"model":"different/provider"}');
  const before = readFileSync(globalCatalogPath(), 'utf8');
  assert.equal(run(root, 'success', ['--check']).status, 75); assert.equal(calls(root).length, 0);
  assert.equal(readFileSync(globalCatalogPath(), 'utf8'), before);
});
test('explicit global bootstrap records verified variants/prices but never fabricates qualification', () => {
  const root = fixture(); rmSync(globalCatalogDirectory(), { recursive: true, force: true });
  const models = { 'fixture/global': { variants: { precise: { reasoningEffort: 'high' }, disabled: { disabled: true } },
    capabilities: { toolcall: true, input: { text: true } }, limit: { context: 10000, output: 1000 },
    cost: { input: 0.1, output: 1, cache: { read: 0.01, write: 0.2 }, tiers: [{ input: 0.2, output: 2, cache: { read: 0.02, write: 0.4 }, tier: { type: 'context', size: 5000 } }] } },
    'fixture/unresolved': { capabilities: { toolcall: true }, limit: { context: 10000, output: 1000 } } };
  for (const provider of ['opencode', 'opencode-go']) models[`${provider}/same-free-name`] = { providerID: provider,
    variants: { exact: { reasoningEffort: 'high' } }, capabilities: { toolcall: true }, limit: { context: 10000, output: 1000 },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } } };
  const metadata = join(base, 'global-metadata.json'); writeFileSync(metadata, JSON.stringify(models));
  const invoke = revision => spawnSync(process.execPath, [join(root, '.agents/skills/opencode-executor/scripts/refresh-model-catalog.mjs'), '--update', '--global', '--revision', revision],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, ROUTING_TEST_MODELS: metadata, ROUTING_TEST_CAPTURE_ROOT: root }, timeout: 10000 });
  successful(invoke('global-fixture-r1'));
  const c = catalog(JSON.parse(readFileSync(globalCatalogPath(), 'utf8')));
  assert.equal(c.schema_version, 2); assert.equal(c.source.scope, 'global'); assert.equal(c.entries.length, 0);
  assert.deepEqual(c.unassessed.filter(e => e.model === 'fixture/global').map(e => e.variant), [null, 'precise']); assert.equal(c.exclusions.length, 1);
  assert.equal(c.unassessed[1].assessment.plan_following.score, null); assert.equal(c.unassessed[1].billing, 'unknown');
  assert.equal(c.unassessed[1].rates, null); assert.equal(c.unassessed[1].pricing.base.input, 0.1);
  assert.equal(c.unassessed[1].pricing.tiers[0].context_tokens, 5000);
  for (const [provider, billing] of [['opencode', 'free'], ['opencode-go', 'go']]) {
    const combinations = c.unassessed.filter(e => e.model === `${provider}/same-free-name`);
    assert.deepEqual(combinations.map(e => e.variant), [null, 'exact']);
    assert(combinations.every(e => e.billing === billing && e.billing_evidence.includes(provider)));
    assert(combinations.every(e => e.assessment.plan_following.score === null && e.pricing.conditions === 'unknown'));
  }
  const before = readFileSync(globalCatalogPath(), 'utf8'); assert.equal(invoke('global-fixture-r1').status, 65);
  assert.equal(readFileSync(globalCatalogPath(), 'utf8'), before);
  assert(calls(root).every(c => ['--version', 'debug', 'models'].includes(c.command[0])));
  assert.equal(existsSync(join(root, 'artifacts/opencode/budget')), false);
  assert.doesNotMatch(before, /PRIVATE_CONFIG_SENTINEL|user\.txt|task-fixture/);
});
test('billing follows exact CLI providers, never model-name hints or arbitrary zero prices', () => {
  const zero = { input: 0, output: 0, cache: { read: 0, write: 0 } };
  assert.equal(cliBilling('opencode/plain-name', { providerID: 'opencode', cost: zero }).billing, 'free');
  assert.equal(cliBilling('opencode-go/name-free', { providerID: 'opencode-go', cost: zero }).billing, 'go');
  assert.equal(cliBilling('opencode-go/with-unknown-price', { providerID: 'opencode-go' }).billing, 'go');
  for (const id of ['other/name-free', 'opencode-go-copy/name', 'opencode-copy/name']) assert.equal(cliBilling(id, { cost: zero }).billing, 'unknown');
  for (const cost of [undefined, { input: 0, output: 0 }, { ...zero, output: 1 }, { ...zero, tiers: [{ output: 1 }] }]) {
    assert.equal(cliBilling('opencode/name-free', { cost }).billing, 'unknown');
  }
  assert.throws(() => cliBilling('opencode/name', { providerID: 'opencode-go', cost: zero }), /conflicts/);
  const root = fixture(), cfg = configuration(root), model = 'opencode-go/name-free';
  const annotations = { schema_version: 1, revision: 'conflicting-billing', credit_unit: 'microUSD', entries: [
    { model, variant: null, billing: 'free', evidence: 'Incorrect Free claim', assessment: assessment(3), outcomes: [] }
  ] };
  const models = new Map([[model, { providerID: 'opencode-go', variants: {}, capabilities: { toolcall: true }, limit: { context: 10000, output: 1000 }, cost: zero }]]);
  assert.throws(() => buildCatalog(root, models, annotations, cfg.c.source), /billing conflicts/);
});
test('published evidence enriches CLI inventory, stays provisional and requires project opt-in', () => {
  const root = fixture(), cfg = configuration(root);
  rmSync(globalCatalogDirectory(), { recursive: true, force: true });
  const models = {
    'fixture/free': { variants: { 'custom-careful': { thinking: { budgetTokens: 100 } }, unreviewed: { thinking: { budgetTokens: 10 } } },
      capabilities: { toolcall: true }, limit: { context: 10000, output: 1000 }, cost: { input: 0, output: 0, cache: { read: 0, write: 0 } } },
    'fixture/go': { variants: {}, capabilities: { toolcall: true }, limit: { context: 10000, output: 1000 },
      cost: { input: 1, output: 1, cache: { read: 1, write: 1 } } }
  };
  const metadata = join(base, 'publication-metadata.json'); writeFileSync(metadata, JSON.stringify(models));
  const file = join(base, 'publication-assessments.json');
  const invoke = (revision, supplied = false) => spawnSync(process.execPath, [join(scripts, 'refresh-model-catalog.mjs'), '--update', '--global', '--revision', revision,
    ...(supplied ? ['--assessments', file] : [])], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 10000,
    env: { ...process.env, ROUTING_TEST_MODELS: metadata, ROUTING_TEST_CAPTURE_ROOT: root } });
  successful(invoke('publication-draft'));
  const draft = catalog(JSON.parse(readFileSync(globalCatalogPath(), 'utf8')));
  const selected = draft.unassessed.find(e => e.model === 'fixture/free' && e.variant === 'custom-careful');
  const source = { url: 'https://provider.invalid/model-card#evaluation', title: 'Fixture official model card', accessed_at: '2026-10-21',
    model_version: 'Fixture exact version', tested_configuration: 'thinking.budgetTokens=100; fixture harness', variant_match: 'exact',
    applicability: 'Relevant published settings match the fixture custom variant.', limitations: 'External fixture result; local task behavior unverified.' };
  const grades = assessment(null);
  for (const axis of ['plan_following', 'tool_use', 'complexity_fit', 'implementation']) grades[axis] = {
    score: 2, basis: 'provisional', evidence: `Fixture configuration-matched repository evaluation supports moderate ${axis}.`, sources: [source],
    review: { rubric: 'capability-scope-v1', rule: 'S2', support: 'evaluation', source_indices: [0], limits: 'Fixture evaluation supports moderate tasks; demanding scope is not established.' }
  };
  const supplied = { schema_version: 1, revision: 'publication-enriched', credit_unit: 'microUSD', entries: [
    { model: selected.model, variant: selected.variant, variant_hash: selected.variant_hash, billing: 'free',
      evidence: 'Curated fixture publication, no local successes claimed.', assessment: grades, outcomes: [] }
  ] };
  writeFileSync(file, JSON.stringify(supplied)); successful(invoke(supplied.revision, true));
  const c = catalog(JSON.parse(readFileSync(globalCatalogPath(), 'utf8')));
  assert.equal(c.entries.length, 1); assert.equal(c.unassessed.length, 3);
  assert.deepEqual(c.entries[0].assessment.implementation.sources, [source]);
  assert.equal(c.unassessed.find(e => e.variant === 'unreviewed').assessment.implementation.score, null);
  assert(c.entries.concat(c.unassessed).every(e => e.outcomes.length === 0));
  cfg.c = c; cfg.p.default_go = [];
  cfg.t.complexity = 2;
  assert.throws(() => select(cfg, readState(root, cfg.b), false), /No sufficiently qualified/);
  cfg.p.allow_provisional = true;
  assert.equal(select(cfg, readState(root, cfg.b), false).entry.variant, 'custom-careful');
  successful(invoke('publication-retained'));
  const retained = readFileSync(globalCatalogPath(), 'utf8');
  assert.deepEqual(JSON.parse(retained).entries[0].assessment, grades);
  for (const a of Object.values(JSON.parse(retained).entries[0].assessment).filter(a => a.review)) assert.equal(scoreFromReview(a.review, a.sources), a.score);
  assert.equal(readFileSync(join(globalCatalogDirectory(), 'revisions', `${digest('publication-retained')}.json`), 'utf8'), retained);
  supplied.revision = 'publication-invalid';
  delete supplied.entries[0].variant_hash;
  writeFileSync(file, JSON.stringify(supplied)); assert.equal(invoke(supplied.revision, true).status, 65);
  assert.equal(readFileSync(globalCatalogPath(), 'utf8'), retained);
  supplied.entries[0].variant_hash = selected.variant_hash;
  supplied.entries[0].model = 'outside/not-in-cli';
  writeFileSync(file, JSON.stringify(supplied)); assert.equal(invoke(supplied.revision, true).status, 65);
  supplied.entries[0].model = selected.model; supplied.entries.push(supplied.entries[0]);
  writeFileSync(file, JSON.stringify(supplied)); assert.equal(invoke(supplied.revision, true).status, 65);
  supplied.entries.pop();
  models['fixture/free'].variants['custom-careful'].thinking.budgetTokens = 200;
  writeFileSync(metadata, JSON.stringify(models)); writeFileSync(file, JSON.stringify(supplied));
  assert.equal(invoke(supplied.revision, true).status, 65);
  assert.equal(readFileSync(globalCatalogPath(), 'utf8'), retained);
  successful(invoke('publication-settings-changed'));
  const changed = catalog(JSON.parse(readFileSync(globalCatalogPath(), 'utf8')));
  assert.equal(changed.entries.length, 0);
  assert.equal(changed.unassessed.find(e => e.variant === 'custom-careful').assessment.implementation.score, null);
  assert(calls(root).every(c => ['--version', 'debug', 'models'].includes(c.command[0])));
  assert.equal(existsSync(join(root, 'artifacts/opencode/budget')), false);
});
test('versioned review replays each score and rejects unsupported scopes and source references', () => {
  const sources = [{ variant_match: 'exact', tested_configuration: 'Exact fixture effort and evaluation harness' }];
  const review = rule => ({ rubric: 'capability-scope-v1', rule, support: rule === 'U' ? 'none' : 'evaluation',
    source_indices: rule === 'U' ? [] : [0], limits: 'Fixture scope limits and applicability are explicitly recorded.' });
  for (const [rule, expected] of [['U', null], ['S0', 0], ['S1', 1], ['S2', 2], ['S3', 3]]) {
    const recorded = JSON.parse(JSON.stringify(review(rule)));
    assert.equal(scoreFromReview(recorded, sources), expected);
  }
  assert.equal(scoreFromReview({ ...review('S2'), support: 'description' }, sources), 2);
  for (const bad of [
    { ...review('S2'), rubric: 'future-unimplemented' }, { ...review('S2'), rule: 'S4' },
    { ...review('S2'), source_indices: [1] }, { ...review('S2'), source_indices: [0, 0] },
    { ...review('S2'), source_indices: [] }, { ...review('S2'), support: 'none' },
    { ...review('U'), source_indices: [0] }, { ...review('S3'), support: 'description' }
  ]) assert.throws(() => scoreFromReview(bad, sources));
  assert.throws(() => scoreFromReview(review('S2'), [{ ...sources[0], variant_match: 'unmapped' }]));
  assert.throws(() => scoreFromReview(review('S3'), [{ ...sources[0], variant_match: 'general' }]));
  assert.throws(() => scoreFromReview(review('S3'), [{ ...sources[0], tested_configuration: null }]));
});
test('catalog review rejects changed scores, missing provenance and false local observations', () => {
  const c = configuration(fixture()).c;
  const a = { score: 2, basis: 'provisional', evidence: 'Fixture multi-step implementation evidence and explicit scope judgment.',
    sources: [{ url: 'https://provider.invalid/report', title: 'Fixture report', accessed_at: '2026-10-21', model_version: 'Fixture model',
      tested_configuration: null, variant_match: 'general', applicability: 'Documented model-wide multi-step capability.', limitations: 'No local workflow measurements.' }],
    review: { rubric: 'capability-scope-v1', rule: 'S2', support: 'description', source_indices: [0], limits: 'No evidence supports demanding work in this configuration.' } };
  c.entries[0].assessment.implementation = a;
  assert.doesNotThrow(() => catalog(c));
  for (const change of [a => { a.score = 1; }, a => { a.review.rule = 'S1'; }, a => { delete a.sources; }, a => { a.basis = 'observed'; }]) {
    const bad = structuredClone(c); change(bad.entries[0].assessment.implementation); assert.throws(() => catalog(bad));
  }
});
test('publication schema rejects incomplete, unsafe and unmapped evidence and false observed claims', () => {
  const root = fixture(), c = configuration(root).c;
  const source = { url: 'https://provider.invalid/model-card', title: 'Fixture report', accessed_at: '2026-10-21',
    model_version: 'Exact fixture model', tested_configuration: null, variant_match: 'general',
    applicability: 'Fixture documented property independent of reasoning settings.', limitations: 'Provider description only.' };
  c.entries[0].assessment.implementation = { score: 1, basis: 'provisional', evidence: 'Fixture limited implementation claim.', sources: [source] };
  assert.doesNotThrow(() => catalog(c));
  for (const modify of [
    a => { a.basis = 'observed'; },
    a => { a.sources = []; },
    a => { delete a.sources[0].limitations; },
    a => { a.sources[0].url = 'file:///private/config'; },
    a => { a.sources[0].url = 'https://user:secret@provider.invalid/model-card'; },
    a => { a.sources[0].accessed_at = '2026-02-30'; },
    a => { a.sources[0].variant_match = 'unmapped'; }
  ]) {
    const bad = structuredClone(c); modify(bad.entries[0].assessment.implementation);
    assert.throws(() => catalog(bad));
  }
  c.entries[0].assessment.refactoring = { score: null, basis: 'unknown', evidence: 'No applicable variant evidence.',
    sources: [{ ...source, variant_match: 'unmapped' }] };
  assert.doesNotThrow(() => catalog(c));
});
test('refresh is explicit, local CLI only, validates effective custom variants, strips secrets and preserves invalid updates', () => {
  const root = fixture(), cfg = configuration(root), models = {
    'fixture/free': { variants: { 'custom-careful': { thinking: { budgetTokens: 100 } }, disabled: { disabled: true } },
      capabilities: { toolcall: true }, limit: { context: 10000, output: 1000 }, cost: { input: 0, output: 0, cache: { read: 0, write: 0 } }, headers: { Authorization: 'PRIVATE_CONFIG_SENTINEL' } },
    'fixture/go': { variants: {}, capabilities: { toolcall: true }, limit: { context: 10000, output: 1000 }, cost: { input: 0.1, output: 1, cache: { read: 0.01, write: 0.2 } } },
  };
  const metadata = join(base, `metadata-${serial}.json`); writeFileSync(metadata, JSON.stringify(models));
  const annotations = { schema_version: 1, revision: 'fixture-r2', credit_unit: 'microUSD', entries: cfg.c.entries.map(e => ({ model: e.model, variant: e.variant,
    billing: e.billing, evidence: e.evidence, assessment: e.assessment, outcomes: [] })) };
  save(root, '.agents/assessments.json', annotations);
  const invoke = args => spawnSync(process.execPath, [join(root, '.agents/skills/opencode-executor/scripts/refresh-model-catalog.mjs'), ...args], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, ROUTING_TEST_MODELS: metadata }, timeout: 10000 });
  assert.equal(invoke([]).status, 65); assert.equal(calls(root).length, 0);
  const args = ['--update', '--project', root, '--assessments', '.agents/assessments.json'];
  successful(invoke(args)); assert.equal(configuration(root).c.revision, 'fixture-r2');
  assert.deepEqual(calls(root).map(c => c.command[0]), ['--version', 'debug', 'debug', 'models']);
  const stored = readFileSync(join(root, '.agents/model-catalog.json'), 'utf8'); assert.doesNotMatch(stored, /PRIVATE_CONFIG_SENTINEL/);
  assert.equal(readdirSync(join(root, 'artifacts/opencode/catalog-revisions')).length, 2);
  assert.equal(invoke(args).status, 65); assert.equal(readFileSync(join(root, '.agents/model-catalog.json'), 'utf8'), stored);
  assert.equal(configuration(root).c.entries[1].rates.input, 100000);
  annotations.revision = 'fixture-r3'; annotations.entries[0].variant = 'imaginary-high'; save(root, '.agents/assessments.json', annotations);
  assert.equal(invoke(args).status, 65); assert.equal(readFileSync(join(root, '.agents/model-catalog.json'), 'utf8'), stored);
  annotations.entries[0].variant = 'disabled'; save(root, '.agents/assessments.json', annotations);
  assert.equal(invoke(args).status, 65);
  assert.throws(() => parseModels('fixture/free\n{"variants":')); assert.throws(() => catalog({ ...cfg.c, entries: [cfg.c.entries[0], cfg.c.entries[0]] }));
  models['fixture/free'].variants = undefined;
  assert.throws(() => buildCatalog(root, new Map(Object.entries(models)), annotations, cfg.c.source));
  annotations.entries = [annotations.entries[1]];
  models['fixture/go'].cost.experimentalOver200K = { input: 3, output: 6 };
  assert.equal(buildCatalog(root, new Map(Object.entries(models)), annotations, cfg.c.source).entries[0].rates, null);
});
