import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { configureConsumer } from './configure-consumer.mjs';
import { consumerConfiguration } from '../skills/opencode-executor/scripts/consumer-config.mjs';
import { axes, phases, digest, configuration } from '../skills/opencode-executor/scripts/routing-schema.mjs';
import { contextHash, admit, claim, finish, select } from '../skills/opencode-executor/scripts/route-plan.mjs';
import { withCredits, normalizeUsage } from '../skills/opencode-executor/scripts/credits.mjs';
import { readState } from '../skills/opencode-executor/scripts/budget.mjs';
import { documentedAllowances } from '../skills/opencode-executor/scripts/go-allowances.mjs';

const source = fileURLToPath(new URL('..', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'shared-provider-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
const bin = join(scratch, 'bin'); mkdirSync(bin);
writeFileSync(join(bin, 'opencode'), '#!/bin/sh\nprintf "1.18.31\\n"\n', { mode: 0o755 });
writeFileSync(join(bin, 'codex'), "#!/usr/bin/env node\nif(process.env.POOL_NO_API_TRACE)require('node:fs').writeFileSync(process.env.POOL_NO_API_TRACE,'unexpected RPC');process.exit(99);\n", { mode: 0o755 });
for (const name of Object.keys(process.env)) if (name.startsWith('OPENCODE_')) delete process.env[name];
process.env.PATH = `${bin}:${process.env.PATH}`;
let serial = 0;
const put = (file, value) => writeFileSync(file, JSON.stringify(value));
const usage = percent => ({ usage: Object.fromEntries(['rolling', 'weekly', 'monthly'].map(w => [w, { status: 'ok', percent, resetsAt: new Date(Date.now() + 3600000).toISOString() }])) });
const fakeFetch = percent => async () => ({ ok: true, text: async () => JSON.stringify(usage(percent)) });
const codexSnapshot = () => ({ status: 'ok', source: 'codex-app-server:account/rateLimits/read', observed_at: new Date().toISOString(),
 buckets: [{ id: 'codex', primary: { used_percent: 35, remaining_percent: 65, window_minutes: 300, resets_at: new Date(Date.now() + 3600000).toISOString() }, secondary: null, credits: null }] });
const funding = percent => ({ funding: { fetch: fakeFetch(percent), codex: async () => codexSnapshot() } });
function entry(model, billing) {
 return { model, variant: null, variant_hash: digest(model), context: 10000, output: 1000, tool_use: true, billing,
  rates: Object.fromEntries(['input', 'output', 'cache_read', 'cache_write'].map(k => [k, billing === 'free' ? 0 : 1000000])),
  assessment: Object.fromEntries(axes.map(k => [k, { score: 3, basis: 'observed', evidence: 'Isolated fixture acceptance evidence' }])),
  evidence: 'Fixture only', requires_xhigh: false, outcomes: [] };
}
async function fixture(entries = [entry('opencode-go/fixture', 'go')]) {
 const base = join(scratch, `installation ${serial++}`), shared = join(base, 'shared');
 mkdirSync(shared, { recursive: true }); process.env.SKILLS_STATE_DIR = shared; process.env.XDG_CONFIG_HOME = join(base, 'config');
 await configureConsumer();
 const file = join(shared, 'credits.json'), d = JSON.parse(readFileSync(file));
 d.billing = { enabled: true, period: d.billing.period, limit_micro_usd: 300, per_run_limit_micro_usd: 300, reserves_micro_usd: { repair: 0, validation: 0 } };
 d.volume.max_percent = { rolling: 100, weekly: 100, monthly: 100 }; d.volume.reserves_percent = { repair: 0, validation: 0 }; d.volume.wait_for_reset = false;
 const today = new Date().toISOString().slice(0, 10);
 d.volume.allowances['opencode-go/fixture'] = { limits_micro_usd: { rolling: 1000, weekly: 1000, monthly: 1000 }, cost_multiplier: 1, source: 'https://example.invalid/fixture-only', verified_at: today, valid_until: today };
 put(file, d); writeFileSync(join(shared, '.env'), 'OPENCODE_GO_API_KEY=fixture-only\n');
 const projects = [join(base, 'project A'), join(base, 'project B')];
 for (const project of projects) {
  mkdirSync(join(project, '.agents'), { recursive: true });
  assert.equal(spawnSync('git', ['init', '-q', project]).status, 0);
  writeFileSync(join(project, 'AGENTS.md'), '# Project-owned constraints\n');
  writeFileSync(join(project, '.agents/PLAN.md'), '# Goal\nReady: fixture task.\n# Relevant Instructions\nnone\n');
  put(join(project, '.agents/executor.json'), { instructions: ['AGENTS.md'] });
  put(join(project, '.agents/executor-task.json'), { schema_version: 1, task_id: 'same-name-different-project', operations: ['implementation'], complexity: 1, risk: 1, validation: 3,
    context_tokens: 100, output_tokens: 100, estimated_tokens: { input: 100, output: 100, cache_read: 0, cache_write: 0 }, phase: 'implementation' });
 }
 const config = JSON.parse(readFileSync(join(shared, 'consumer.json'))); config.reserve_multiplier = 1; put(join(shared, 'consumer.json'), config);
 const catalog = { schema_version: 2, revision: 'fixture', credit_unit: 'microUSD', source: { kind: 'opencode-cli', scope: 'global', cli_version: '1.18.31', captured_at: new Date().toISOString(), metadata_hash: 'fixture', context_hash: contextHash(projects[0], 'global') }, entries, unassessed: [], exclusions: [] };
 const directory = join(process.env.XDG_CONFIG_HOME, 'opencode/model-routing'); mkdirSync(directory, { recursive: true }); put(join(directory, 'catalog.json'), catalog);
 return { base, shared, file, projects, catalog, config };
}

test('all projects inherit one pool and automatic model selection; local files can only restrict it', async () => {
 const f = await fixture([entry('fixture/free', 'free'), entry('opencode-go/fixture', 'go')]);
 const [a, b] = f.projects, first = configuration(a), second = configuration(b);
 assert.equal(first.p.credits, f.file); assert.equal(second.p.credits, f.file);
 assert.equal(first.b.enforcement, 'provider-only'); assert.equal(second.b.enforcement, 'provider-only');
 assert.equal(first.p.auto_fallback, true); assert.equal(first.p.allowed_combinations.length, 2);
 assert(!existsSync(join(a, '.agents/routing-policy.json')) && !existsSync(join(b, '.agents/budget.json')));
 for (const override of [{ enabled: false }, { credits: 'copied/credits.json' }, { minimum_score: 0 }, { reserve_multiplier: 0.5 }, { allow_provisional: true }, { allowed_combinations: [{ model: 'another/paid', variant: null }] }]) {
  put(join(a, '.agents/routing-policy.json'), { schema_version: 1, ...override }); assert.throws(() => configuration(a));
 }
 put(join(a, '.agents/routing-policy.json'), { schema_version: 1, minimum_score: 2, auto_fallback: false, allowed_combinations: [{ model: 'fixture/free', variant: null }] });
 assert.equal(configuration(a).p.allowed_combinations.length, 1); assert.equal(configuration(b).p.allowed_combinations.length, 2);
});

test('independent project processes cannot reserve the same global remainder without project budgets', async () => {
 const f = await fixture();
 const code = `const funding={fetch:async()=>({ok:true,text:async()=>JSON.stringify(${JSON.stringify(usage(0))})}),codex:async()=>(${JSON.stringify(codexSnapshot())})}; const {writeSync}=await import('node:fs'); const {admit}=await import(${JSON.stringify(new URL('../skills/opencode-executor/scripts/route-plan.mjs', import.meta.url).href)}); try {const d=await admit(process.argv[1],false,null,{funding}); writeSync(1,JSON.stringify({ok:true,id:d.run_id}));} catch {writeSync(1,JSON.stringify({ok:false}));}`;
 const run = project => new Promise((resolveResult, reject) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, project], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; child.stdout.on('data', c => out += c); child.stderr.on('data', c => err += c); child.on('error', reject);
  child.on('close', status => { try { assert.equal(status, 0, err); resolveResult(JSON.parse(out)); } catch (e) { reject(e); } });
 });
 const result = await Promise.all(f.projects.map(run)); assert.equal(result.filter(r => r.ok).length, 1);
 const pool = JSON.parse(readFileSync(f.file)); assert.equal(Object.keys(pool.state.runs).length, 1);
 assert.equal(Object.values(pool.state.runs)[0].reservation.credits, 200);
 assert.equal(pool.state.codex.buckets[0].primary.remaining_percent, 65);
});

test('a large local budget or a different local period never increases the provider remainder', async () => {
 const f = await fixture(), [a, b] = f.projects, cap = { tokens: 10000000, credits: 10000000 };
 put(join(b, '.agents/budget.json'), { schema_version: 1, period: 'different-project-period', credit_unit: 'microUSD', enforcement: 'estimated',
  project: cap, per_run: cap, phases: Object.fromEntries(phases.map(p => [p, cap])), reserves: { repair: { tokens: 0, credits: 0 }, validation: { tokens: 0, credits: 0 } } });
 await admit(a, false, null, funding(0));
 await assert.rejects(admit(b, false, null, funding(0)));
 assert.equal(Object.keys(JSON.parse(readFileSync(f.file)).state.runs).length, 1);
 assert.equal(configuration(b).b.period, 'different-project-period');
});

test('shared Free-to-funded execution settles Go and approved paid fallback without a local budget or new project allowance', async () => {
 for (const target of [entry('opencode-go/fixture', 'go'), entry('opencode/muse-fixture', 'paid')]) {
 const f = await fixture([entry('fixture/free', 'free'), target]), root = f.projects[0];
 const first = await admit(root, false, null, funding(0)); assert.equal(first.billing, 'free'); await claim(root, first.run_id, funding(0));
 const report = '# Status\nBLOCKED\n', directory = id => join(root, 'artifacts/opencode/runs', id);
 mkdirSync(directory(first.run_id), { recursive: true }); writeFileSync(join(root, '.agents/IMPLEMENTATION_REPORT.md'), report); writeFileSync(join(directory(first.run_id), 'placeholder.md'), report);
 writeFileSync(join(directory(first.run_id), 'events.jsonl'), JSON.stringify({ type: 'error', error: { name: 'APIError', data: { statusCode: 503, isRetryable: true } } }) + '\n');
 assert.equal((await finish(root, first.run_id, 42)).fallback_safe, true);
 const next = await admit(root, false, first.run_id, funding(0)); assert.equal(next.billing, target.billing); assert.equal(next.fallback_from, first.run_id);
 await claim(root, next.run_id, funding(0)); mkdirSync(directory(next.run_id), { recursive: true });
 writeFileSync(join(directory(next.run_id), 'events.jsonl'), JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', id: 'finish', tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 0 } } } }) + '\n');
 await finish(root, next.run_id, 0);
 const pool = JSON.parse(readFileSync(f.file)); assert.equal(Object.keys(pool.state.runs).length, 2);
 assert(Object.values(pool.state.runs).every(r => r.state === 'finished'));
 assert.equal(pool.state.runs[next.run_id].usage_credits, 20);
 assert.equal(readState(root, configuration(root).b).tasks[first.task_id].fallbacks, 1);
 }
});

test('offline preflight uses common defaults without API calls or provider/local ledger writes', async () => {
 const f = await fixture(), before = readFileSync(f.file, 'utf8');
 const script = fileURLToPath(new URL('../skills/opencode-executor/scripts/route-plan.mjs', import.meta.url));
 const trace = join(f.base, 'unexpected-api-call');
 const code = `const fs=await import('node:fs');globalThis.fetch=async()=>{fs.writeFileSync(${JSON.stringify(trace)},'unexpected API');throw Error('unexpected API');};process.argv=[process.execPath,${JSON.stringify(script)},'check',${JSON.stringify(f.projects[0])},'false'];await import(${JSON.stringify(new URL('../skills/opencode-executor/scripts/route-plan.mjs', import.meta.url).href)});`;
 const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, POOL_NO_API_TRACE: trace }, encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr); assert(!existsSync(trace));
 assert.equal(readFileSync(f.file, 'utf8'), before); assert(!existsSync(join(f.projects[0], 'artifacts')));
});

test('admission and start refresh shared account observations; external usage and another project never create capacity', async () => {
 const f = await fixture(); let reads = 0;
 const options = percent => ({ funding: { fetch: fakeFetch(percent), codex: async () => { reads++; return codexSnapshot(); } } });
  const d = await admit(f.projects[0], false, null, options(0));
  await assert.rejects(claim(f.projects[0], d.run_id, options(85)), /volume|quota/);
  assert.equal(readState(f.projects[0], configuration(f.projects[0]).b).runs[d.run_id].state, 'admitted');
  await claim(f.projects[0], d.run_id, options(0));
  await assert.rejects(admit(f.projects[1], false, null, options(0)));
  assert.equal(reads, 3);
  const pool = JSON.parse(readFileSync(f.file)); assert.equal(Object.keys(pool.state.runs).length, 1); assert.equal(pool.state.codex.status, 'ok');
});

test('failed account reads stay unknown; disabled funding or explicitly strict conversion rules cannot authorize Go', async () => {
 const f = await fixture(), before = JSON.parse(readFileSync(f.file));
 await withCredits(f.projects[0], f.file, async ctx => {
  await ctx.refreshCodex(); assert.equal(ctx.data.state.codex.status, 'unavailable');
 }, { codex: async () => { throw Error('PRIVATE_ACCOUNT_ERROR'); } });
 assert(!readFileSync(f.file, 'utf8').includes('PRIVATE_ACCOUNT_ERROR'));
  let d = JSON.parse(readFileSync(f.file)); d.volume.enabled = false; put(f.file, d); await assert.rejects(admit(f.projects[0], false, null, funding(0)));
  d = { ...before, volume: { ...before.volume, allowances: {}, token_price_fallback: false } }; put(f.file, d); await assert.rejects(admit(f.projects[0], false, null, funding(0)));
  assert.equal(Object.keys(JSON.parse(readFileSync(f.file)).state.runs).length, 0);
});

test('documented Go limits use the published 20/50/100 percent windows and expire into price fallback', () => {
 const current = documentedAllowances(Date.parse('2026-10-30T12:00:00Z'));
 assert.deepEqual(current['opencode-go/glm-5.2'].limits_micro_usd, { rolling: 12000000, weekly: 30000000, monthly: 60000000 });
 assert.equal(current['opencode-go/deepseek-v4-pro'].cost_multiplier, 2);
 assert.deepEqual(documentedAllowances(Date.parse('2027-01-01T00:00:00Z')), {});
});

test('approved emergency families start with unknown scores, keep Free first, and never admit unrelated or explicitly unsuitable models', async () => {
 const unknown = model => { const e = entry(model, 'free'); for (const a of Object.values(e.assessment)) Object.assign(a, { score: null, basis: 'unknown' }); return e; };
 const free = unknown('opencode/deepseek-fixture-free'), paid = unknown('opencode-go/glm-fixture'); paid.billing = 'go'; paid.rates = entry('x', 'go').rates;
 const unrelated = unknown('opencode/unapproved-free');
 const f = await fixture([]); f.catalog.unassessed = [free, paid, unrelated];
 put(join(process.env.XDG_CONFIG_HOME, 'opencode/model-routing/catalog.json'), f.catalog);
 const exhausted = JSON.parse(readFileSync(f.file)); exhausted.billing.limit_micro_usd = 0; exhausted.billing.per_run_limit_micro_usd = 0; put(f.file, exhausted);
 const root = f.projects[0], d = await admit(root, false, null, funding(100));
 assert.equal(d.model, free.model); assert.equal(d.eligibility.qualification, 'user-approved-emergency');
 assert(Object.values(d.eligibility.assessments).every(a => a.score === null && a.basis === 'unknown'));
 await claim(root, d.run_id, funding(100));
 put(join(f.projects[1], '.agents/routing-policy.json'), { schema_version: 1, emergency_families: [] });
 assert.throws(() => select(configuration(f.projects[1]), { runs: {}, tasks: {} }, false), /No sufficiently/);
 free.assessment.tool_use = { score: 0, basis: 'observed', evidence: 'Fixture failure' }; f.catalog.unassessed = [free, unrelated];
 put(join(process.env.XDG_CONFIG_HOME, 'opencode/model-routing/catalog.json'), f.catalog);
 assert.throws(() => select(configuration(root), { runs: {}, tasks: {} }, false), /No sufficiently/);
});

test('missing or expired conversions permit token-priced Go starts but preserve fresh quotas and cross-project serialization', async () => {
 const e = entry('opencode-go/glm-fixture', 'go'); for (const a of Object.values(e.assessment)) Object.assign(a, { score: null, basis: 'unknown' });
 const f = await fixture([]); f.catalog.unassessed = [e]; put(join(process.env.XDG_CONFIG_HOME, 'opencode/model-routing/catalog.json'), f.catalog);
 const pool = JSON.parse(readFileSync(f.file)); pool.volume.allowances[e.model] = { ...pool.volume.allowances['opencode-go/fixture'], verified_at: '2020-01-01', valid_until: '2020-01-02' }; put(f.file, pool);
 const a = await admit(f.projects[0], false, null, funding(0));
 assert.equal(a.billing, 'go'); assert.equal(a.shared_credits.volume_basis, 'token-price'); assert.equal(a.reservation.credits, 200);
 await assert.rejects(admit(f.projects[1], false, null, funding(0)));
 await assert.rejects(claim(f.projects[0], a.run_id, funding(100)));
 await claim(f.projects[0], a.run_id, funding(0));
 const directory = join(f.projects[0], 'artifacts/opencode/runs', a.run_id); mkdirSync(directory, { recursive: true });
 writeFileSync(join(directory, 'events.jsonl'), JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', id: 'step', tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 0 } } } }) + '\n');
 await finish(f.projects[0], a.run_id, 0);
 const next = await admit(f.projects[1], false, null, funding(0)); assert.equal(next.shared_credits.volume_basis, 'token-price');
});

test('Go selection uses comparable allowance shares, then token costs when a conversion is missing', async () => {
 const cheap = entry('opencode-go/cheap', 'go'), efficient = entry('opencode-go/efficient', 'go');
 efficient.rates = Object.fromEntries(Object.keys(efficient.rates).map(k => [k, 2000000]));
 const f = await fixture([cheap, efficient]); let d = JSON.parse(readFileSync(f.file));
 const template = d.volume.allowances['opencode-go/fixture'];
 d.volume.allowances[cheap.model] = { ...template, limits_micro_usd: { rolling: 1000, weekly: 1000, monthly: 1000 } };
 d.volume.allowances[efficient.model] = { ...template, limits_micro_usd: { rolling: 10000, weekly: 10000, monthly: 10000 } };
 d.billing.enabled = false; put(f.file, d);
 await withCredits(f.projects[0], f.file, async ctx => {
  await ctx.refresh(); const cfg = configuration(f.projects[0]), state = { runs: {}, tasks: {} };
  assert.equal(select(cfg, state, false, false, ctx).entry.model, efficient.model);
  delete ctx.data.volume.allowances[efficient.model];
  assert.equal(select(cfg, state, false, false, ctx).entry.model, cheap.model);
 }, { fetch: fakeFetch(0) });
});

test('a conversion expiring between admission and claim switches to the serialized price fallback', async () => {
 const f = await fixture(), root = f.projects[0], first = await admit(root, false, null, funding(0));
 assert.equal(first.shared_credits.volume_basis, 'verified-allowance');
 const tomorrow = Date.parse(`${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`) + 1000;
 const payload = usage(0); for (const w of Object.values(payload.usage)) w.resetsAt = new Date(tomorrow + 3600000).toISOString();
 const later = { funding: { now: () => tomorrow, fetch: async () => ({ ok: true, text: async () => JSON.stringify(payload) }), codex: async () => codexSnapshot() } };
 await claim(root, first.run_id, later);
 const held = JSON.parse(readFileSync(f.file)).state.runs[first.run_id];
 assert.equal(held.state, 'started'); assert.deepEqual(held.reservation.volume, { rolling: 0, weekly: 0, monthly: 0 });
 await assert.rejects(admit(f.projects[1], false, null, later));
});

test('paid emergency Console models require the shared monetary cap and use the cheapest admitted token estimate', async () => {
 const paid = entry('opencode/muse-fixture', 'paid'); for (const a of Object.values(paid.assessment)) Object.assign(a, { score: null, basis: 'unknown' });
 const f = await fixture([]); f.catalog.unassessed = [paid]; put(join(process.env.XDG_CONFIG_HOME, 'opencode/model-routing/catalog.json'), f.catalog);
 const selected = await admit(f.projects[0], false, null, funding(0)); assert.equal(selected.billing, 'paid');
 let d = JSON.parse(readFileSync(f.file)); d.billing.enabled = false; put(f.file, d);
 await assert.rejects(admit(f.projects[1], false, null, funding(0)));
});

test('setup preserves shared spending/account data, is repeatable and refuses unresolved runs', async () => {
 const f = await fixture();
  const before = JSON.parse(readFileSync(f.file)); before.state.snapshot = normalizeUsage(usage(20)); put(f.file, before);
  await configureConsumer(); const afterSetup = JSON.parse(readFileSync(f.file)); assert.deepEqual(afterSetup.state, before.state);
  assert.deepEqual(afterSetup.billing, before.billing); assert.deepEqual(afterSetup.volume.allowances, before.volume.allowances);
  const cfg = readFileSync(join(f.shared, 'consumer.json'), 'utf8'); await configureConsumer(); assert.equal(readFileSync(join(f.shared, 'consumer.json'), 'utf8'), cfg);
  // The setup command enabled waiting; this fixture still has ample capacity.
  await admit(f.projects[0], false, null, funding(0)); const pool = readFileSync(f.file, 'utf8');
  await assert.rejects(configureConsumer(), /Reconcile/); assert.equal(readFileSync(f.file, 'utf8'), pool);
  assert.equal(consumerConfiguration().credits, f.file);
});

test('the setup CLI works through a consumer symlink and preserves that shared account state', async () => {
 const f = await fixture(), root = f.projects[0]; symlinkSync(source, join(root, 'skills'));
 const before = JSON.parse(readFileSync(f.file)).state;
 const result = spawnSync(process.execPath, [join(root, 'skills/scripts/configure-consumer.mjs')], { cwd: root, env: process.env, encoding: 'utf8' });
 assert.equal(result.status, 0, result.stderr);
 assert.equal(JSON.parse(result.stdout).pool, f.file);
 assert.deepEqual(JSON.parse(readFileSync(f.file)).state, before);
});

test('loss of the global ledger cannot silently create new credit', async () => {
 const f = await fixture(); rmSync(f.file);
 await assert.rejects(configureConsumer(), /ledger missing/); assert(!existsSync(f.file));
 const previous = process.env.SKILLS_STATE_DIR; process.env.SKILLS_STATE_DIR = 'relative-project-state';
 try { assert.throws(() => consumerConfiguration(), /absolute/); } finally { process.env.SKILLS_STATE_DIR = previous; }
});
