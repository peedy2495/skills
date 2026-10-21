import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync, lstatSync, readlinkSync, realpathSync, readdirSync, writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, configuration, digest, key, local, taskClass, json } from './routing-schema.mjs';
import { checkBudget, readState, transaction, atomicJSON } from './budget.mjs';
import { collectUsage } from './collect-usage.mjs';
import { globalCatalogDirectory } from './catalog-store.mjs';
import { withCredits, readCredits } from './credits.mjs';

export function contextHash(root, scope = 'project') {
  const sources = [];
  function scan(path) {
    // Publishing revisions must not invalidate its own source fingerprint.
    if (resolve(path) === resolve(globalCatalogDirectory())) return;
    if (!existsSync(path)) return;
    const s = lstatSync(path);
    if (s.isSymbolicLink()) { sources.push([path, readlinkSync(path)]); return; }
    if (s.isDirectory()) {
      for (const n of readdirSync(path).sort()) if (!['node_modules', '.git', 'cache'].includes(n)) scan(join(path, n));
    } else if (s.isFile()) sources.push([path, digest(readFileSync(path))]);
  }
  scan(join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode'));
  scan('/etc/opencode');
  if (process.env.OPENCODE_CONFIG) scan(resolve(root, process.env.OPENCODE_CONFIG));
  if (process.env.OPENCODE_CONFIG_DIR) scan(resolve(root, process.env.OPENCODE_CONFIG_DIR));
  if (scope === 'project') scan(local(root, '.agents/executor.json'));
  else {
    // Conservatively detect project-local overrides, even when project config
    // discovery is disabled. Arbitrary cwd-sensitive plugins are not inferred.
    for (const name of ['opencode.json', 'opencode.jsonc', '.opencode']) scan(join(root, name));
  }
  const executable = process.env.PATH.split(':').map(p => join(p, 'opencode')).find(p => existsSync(p));
  assert(executable, 'OpenCode CLI missing');
  const bin = realpathSync(executable), s = statSync(bin);
  const inputs = { sources, binary: [bin, s.size, s.mtimeMs], inline: process.env.OPENCODE_CONFIG_CONTENT || '',
    mode: 'OPENCODE_DISABLE_PROJECT_CONFIG=1', pure: process.env.OPENCODE_PURE || '', plugins: process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS || '' };
  if (scope === 'global') {
    inputs.scope = 'global-v2';
    inputs.environment = Object.entries(process.env).filter(([k]) =>
      (k.startsWith('OPENCODE_') && !['OPENCODE_DISABLE_MODELS_FETCH', 'OPENCODE_DISABLE_PROJECT_CONFIG'].includes(k)) || /(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|SECRET_ACCESS_KEY)$/.test(k)).sort(([a], [b]) => a.localeCompare(b));
  }
  return digest(inputs);
}
export function workspaceHash(root) {
  const git = args => execFileSync('git', ['-C', root, ...args], { maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const files = [...new Set(git(['ls-files', '-co', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean))].sort();
  const parts = [];
  for (const file of files) {
    if (file.startsWith('artifacts/opencode/') || file === '.agents/IMPLEMENTATION_REPORT.md') continue;
    const path = resolve(root, file);
    if (!existsSync(path)) { parts.push([file, 'missing']); continue; }
    const s = lstatSync(path);
    parts.push([file, s.mode, s.isSymbolicLink() ? readlinkSync(path) : s.isFile() ? digest(readFileSync(path)) : 'directory']);
  }
  let head = '';
  try { head = git(['rev-parse', '--verify', 'HEAD']).toString(); } catch { /* unborn Git fixture/project */ }
  return digest([head, digest(git(['ls-files', '--stage', '-z'])), parts]);
}
export function select(cfg, state, allowXhigh, fallback = false, shared = null, preview = false) {
  const { c, p, b, t } = cfg;
  const required = [...new Set(['plan_following', 'tool_use', 'complexity_fit', ...t.operations])];
  const threshold = Math.max(p.minimum_score, t.complexity, t.risk, 3 - t.validation);
  const candidates = [], waiting = [];
  for (const e of c.entries) {
    if (p.allowed_combinations && !p.allowed_combinations.some(x => key(x) === key(e))) continue;
    if ((e.requires_xhigh || e.variant === 'xhigh') && !allowXhigh) continue;
    if (e.context < t.context_tokens + t.output_tokens || e.output < t.output_tokens || e.rates === null || e.billing === 'unknown') continue;
    if (e.input != null && e.input < t.context_tokens) continue;
    if (!required.every(k => e.assessment[k].score !== null && e.assessment[k].score >= threshold && (p.allow_provisional || e.assessment[k].basis === 'observed'))) continue;
    const isGo = p.default_go.some(x => key(x) === key(e));
    const specialist = p.specialists.some(x => key(x) === key(e));
    const tier = e.billing === 'free' ? 0 : isGo ? 1 : specialist && t.phase === 'specialist' ? 2 : 99;
    if (tier === 99 || (fallback && !isGo)) continue;
    const tokens = Math.ceil(Object.values(t.estimated_tokens).reduce((a, n) => a + n, 0) * p.reserve_multiplier);
    const credits = Math.ceil(Object.entries(t.estimated_tokens).reduce((sum, [k, n]) => sum + n * e.rates[k] / 1_000_000, 0) * p.reserve_multiplier);
    if (![tokens, credits].every(Number.isSafeInteger)) continue;
    const phase = fallback ? 'fallback' : t.phase;
    let budget, shared_credits;
    try {
      budget = checkBudget(state, b, { tokens, credits }, phase, e);
      if (shared) shared_credits = shared.check(e, { tokens, credits }, phase, null, preview);
    } catch (e) { if (e.code === 'credits_wait') waiting.push(e); continue; }
    const observed = e.outcomes.find(o => o.task_class === taskClass(t) && o.successes > 0);
    candidates.push({ entry: e, tier, reservation: { tokens, credits }, phase, budget, shared_credits, required, threshold,
      expected: observed ? observed.credits / observed.successes : null });
  }
  if (!candidates.length && waiting.length) {
    waiting.sort((a, b) => Date.parse(a.retry_at) - Date.parse(b.retry_at));
    throw waiting[0];
  }
  assert(candidates.length, 'No sufficiently qualified, authorized and affordable catalog combination');
  const tier = Math.min(...candidates.map(x => x.tier));
  const pool = candidates.filter(x => x.tier === tier);
  const observed = pool.every(x => x.expected !== null);
  pool.sort((a, z) => (observed ? a.expected - z.expected : a.reservation.credits - z.reservation.credits)
    || (z.entry.assessment.cost_efficiency.score ?? -1) - (a.entry.assessment.cost_efficiency.score ?? -1)
    || (key(a.entry) < key(z.entry) ? -1 : key(a.entry) > key(z.entry) ? 1 : 0));
  return { ...pool[0], cost_basis: observed ? 'observed-total-credits-per-success' : 'estimated-usage; success-cost-unknown' };
}
function load(root) {
  const cfg = configuration(root);
  assert(contextHash(root, cfg.catalog_scope) === cfg.c.source.context_hash, 'OpenCode configuration incompatible with catalog fingerprint; no automatic refresh');
  return cfg;
}
async function withFundingWait(root, cfg, runId, operation, timing = {}) {
  const initialInputs = digest(cfg), baseline = workspaceHash(root);
  const now = timing.now ?? (() => Date.now()), sleep = timing.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  let record = null, creditsHash = null;
  const path = local(root, 'artifacts/opencode/credit-wait.json');
  const persist = () => {
    mkdirSync(local(root, 'artifacts/opencode'), { recursive: true, mode: 0o700 });
    atomicJSON(path, record, 2);
  };
  for (;;) {
    try {
      assert(digest(load(root)) === initialInputs && workspaceHash(root) === baseline, 'Inputs or workspace changed while waiting; Codex must reassess');
      const result = await operation(creditsHash);
      if (record) { record.status = 'released'; record.run_id = result.run_id; record.updated_at = new Date(now()).toISOString(); persist(); }
      return result;
    } catch (e) {
      if (e.code !== 'credits_wait' || !e.wait_for_reset) {
        if (record) { record.status = 'blocked'; record.reason = e.safe ? e.message : 'invalid_configuration_or_state'; record.updated_at = new Date(now()).toISOString(); persist(); }
        throw e;
      }
      creditsHash ??= e.credits_config_hash;
      assert(creditsHash === e.credits_config_hash, 'Shared credits configuration changed while waiting');
      record = { schema_version: 1, status: 'waiting_for_credits', task_id: cfg.t.task_id, run_id: runId,
        stage: runId === null ? 'admission' : 'claim', retry_at: e.retry_at, blocking_windows: e.blocking_windows,
        inputs_hash: initialInputs, workspace_hash: baseline, credits_config_hash: creditsHash, updated_at: new Date(now()).toISOString() };
      persist();
      if (timing.onWait) timing.onWait(record);
      else writeSync(2, JSON.stringify({ state: record.status, retry_at: record.retry_at, blocking_windows: record.blocking_windows,
        wait_record: path }) + '\n');
      // No shared-credit/budget lock, model call, polling or executor restart.
      // The surrounding runner retains its separate workspace ownership lock.
      // Short timer slices keep the process interruptible across distant resets.
      while (Date.parse(record.retry_at) > now()) await sleep(Math.min(60000, Date.parse(record.retry_at) - now()));
    }
  }
}
export async function admit(root, allowXhigh = false, previous = null, timing = {}) {
  const cfg = load(root), baseline = workspaceHash(root);
  return withFundingWait(root, cfg, null, creditsHash => withCredits(root, cfg.p.credits, shared => transaction(root, cfg.b, async state => {
    assert(creditsHash === null || shared?.hash === creditsHash, 'Shared credits configuration changed while waiting');
    const task = state.tasks[cfg.t.task_id] ?? { fallbacks: 0, active: null };
    assert(task.active === null, 'Task already has an active/reserved execution');
    if (previous) {
      const prior = state.runs[previous];
      assert(prior?.decision.task_id === cfg.t.task_id && prior.outcome?.fallback_safe && prior.state === 'finished', 'No safe technical Free failure');
      assert(prior.decision.billing === 'free' && cfg.p.auto_fallback && task.fallbacks === 0, 'Automatic fallback unavailable or already consumed');
      assert(prior.decision.workspace_hash === baseline, 'Workspace changed before fallback');
      assert(prior.decision.plan_hash === digest(readFileSync(local(root, '.agents/PLAN.md'))), 'Plan changed before fallback');
    } else assert(!Object.values(state.runs).some(r => r.decision.task_id === cfg.t.task_id), 'Task ID already used; supervisor must explicitly replan with a new task ID');
    let choice = select(cfg, state, allowXhigh, !!previous, shared, true);
    if (shared?.data.volume.enabled && choice.entry.billing === 'go') {
      await shared.refresh();
      assert(shared.live && !shared.unavailable, `Go usage unavailable (${shared.data.state.last_error?.code}); no start authorized`);
    }
    choice = select(cfg, state, allowXhigh, !!previous, shared);
    const e = choice.entry;
    const run_id = randomUUID();
    const decision = { run_id, task_id: cfg.t.task_id, model: e.model, variant: e.variant, variant_hash: e.variant_hash,
      catalog_revision: cfg.c.revision, catalog_hash: digest(cfg.c), policy_hash: digest(cfg.p), task_hash: digest(cfg.t),
      budget_config_hash: digest(cfg.b), plan_hash: digest(readFileSync(local(root, '.agents/PLAN.md'))), workspace_hash: baseline,
      phase: choice.phase, billing: e.billing, reservation: choice.reservation, budget: choice.budget,
      auto_fallback: cfg.p.auto_fallback,
      eligibility: { required: choice.required, threshold: choice.threshold, assessments: Object.fromEntries(choice.required.map(k => [k, e.assessment[k]])),
        task_features: { operations: cfg.t.operations, complexity: cfg.t.complexity, risk: cfg.t.risk, validation: cfg.t.validation,
          context_tokens: cfg.t.context_tokens, output_tokens: cfg.t.output_tokens, estimated_tokens: cfg.t.estimated_tokens },
        context: e.context, cost_basis: choice.cost_basis, expected_credits_per_success: choice.expected },
      fallback_from: previous, admitted_at: new Date().toISOString() };
    if (shared) { decision.shared_credits = choice.shared_credits; shared.reserve(decision); }
    state.runs[run_id] = { decision, decision_hash: digest(decision), entry: e, cli_version: cfg.c.source.cli_version, state: 'admitted' };
    task.active = run_id; if (previous) task.fallbacks++; state.tasks[cfg.t.task_id] = task;
    return decision;
  })), timing);
}
export async function claim(root, id, timing = {}) {
  const cfg = load(root);
  return withFundingWait(root, cfg, id, creditsHash => withCredits(root, cfg.p.credits, shared => transaction(root, cfg.b, async s => {
    assert(creditsHash === null || shared?.hash === creditsHash, 'Shared credits configuration changed while waiting');
    const r = s.runs[id]; assert(r?.state === 'admitted' && s.tasks[r.decision.task_id]?.active === id, 'Start permission already used or unavailable');
    assert(r.decision.task_hash === digest(cfg.t) && r.decision.catalog_hash === digest(cfg.c) && r.decision.policy_hash === digest(cfg.p) && r.decision.budget_config_hash === digest(cfg.b), 'Start inputs changed');
    assert(r.decision.workspace_hash === workspaceHash(root), 'Workspace changed after admission');
    assert(r.decision.plan_hash === digest(readFileSync(local(root, '.agents/PLAN.md'))), 'Plan changed after admission');
    const withoutThisReservation = { ...s, runs: { ...s.runs } }; delete withoutThisReservation.runs[id];
    r.start_budget = checkBudget(withoutThisReservation, cfg.b, r.decision.reservation, r.decision.phase, r.decision);
    assert(!!shared === !!r.decision.shared_credits, 'Shared credit binding changed after admission');
    if (shared) {
      // Refresh account windows before every real start, including Free runs.
      // A failed refresh gates Go funding; Free work still needs no Go capacity.
      if (shared.data.volume.enabled) await shared.refresh();
      r.start_shared_credits = shared.check({ model: r.decision.model, billing: r.decision.billing }, r.decision.reservation, r.decision.phase, id);
      shared.claim(r.decision);
    }
    r.started_at = new Date().toISOString();
    r.state = 'started'; return r.decision;
  })), timing);
}
export async function finish(root, id, exit) {
  // Do not reload catalog/policy: settle against the immutable admitted snapshot.
  const budget = json(root, '.agents/budget.json');
  const reference = readState(root, budget).runs[id]?.decision.shared_credits?.path;
  return withCredits(root, reference, shared => transaction(root, budget, s => {
    const r = s.runs[id]; assert(r?.state === 'started' && !r.outcome, 'Execution already settled or not started');
    const directory = local(root, `artifacts/opencode/runs/${id}`);
    const usage = collectUsage(join(directory, 'events.jsonl'), r.entry, r.cli_version);
    const unchanged = r.decision.workspace_hash === workspaceHash(root) && r.decision.plan_hash === digest(readFileSync(local(root, '.agents/PLAN.md')));
    const report = local(root, '.agents/IMPLEMENTATION_REPORT.md');
    const placeholder = join(directory, 'placeholder.md');
    const reportUnchanged = existsSync(report) && existsSync(placeholder) && readFileSync(report).equals(readFileSync(placeholder));
    const outcome = { ...usage, exit, workspace_unchanged: unchanged,
      ...(r.start_shared_credits ? { shared_credits_start: r.start_shared_credits } : {}),
      fallback_safe: exit !== 0 && usage.before_work && unchanged && reportUnchanged && r.decision.billing === 'free' && r.decision.auto_fallback, finished_at: new Date().toISOString() };
    if (shared) shared.settle(r.decision, usage.usage);
    r.outcome = outcome; r.state = 'finished'; s.tasks[r.decision.task_id].active = null;
    writeFileSync(join(directory, 'outcome.json'), JSON.stringify(outcome) + '\n', { flag: 'wx', mode: 0o400 });
    return outcome;
  }));
}
function overlay(model) {
  const config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT || '{}');
  config.small_model = model;
  config.compaction = { ...config.compaction, auto: false };
  config.agent ??= {};
  config.agent.build = { ...config.agent.build, permission: { ...config.agent.build?.permission, task: 'deny' } };
  for (const name of ['title', 'summary', 'compaction']) config.agent[name] = { ...config.agent[name], disable: true };
  return JSON.stringify(config);
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    const [command, rootArg, value, previous] = process.argv.slice(2), root = realpathSync(rootArg);
    if (command === 'mode') {
      if (!existsSync(local(root, '.agents/routing-policy.json'))) console.log('legacy');
      else { const p = json(root, '.agents/routing-policy.json'); assert(p.schema_version === 1 && typeof p.enabled === 'boolean', 'Invalid routing activation'); console.log(p.enabled ? 'routed' : 'legacy'); }
    } else if (command === 'workspace-lock') {
      const directory = local(root, 'artifacts/opencode'); mkdirSync(directory, { recursive: true, mode: 0o700 });
      const lock = local(root, 'artifacts/opencode/workspace.lock');
      assert(!existsSync(lock), 'Another managed execution or interrupted run owns this workspace'); mkdirSync(lock);
    } else if (command === 'workspace-unlock') rmSync(local(root, 'artifacts/opencode/workspace.lock'), { recursive: true });
    else if (command === 'check') {
      const cfg = load(root); const choice = select(cfg, readState(root, cfg.b), value === 'true');
      if (cfg.p.credits) readCredits(root, cfg.p.credits);
      console.log(`Router local preflight OK: ${choice.entry.model}; variant=${JSON.stringify(choice.entry.variant)}; estimated budget only.${cfg.p.credits ? ' Shared funding is checked before admission/start; no usage API call in preflight.' : ''}`);
    } else if (command === 'admit') {
      const d = await admit(root, value === 'true', previous || null);
      const directory = local(root, `artifacts/opencode/runs/${d.run_id}`);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(join(directory, 'decision.json'), JSON.stringify(d) + '\n', { flag: 'wx', mode: 0o400 });
      console.log([d.run_id, d.model, d.variant ?? ''].join('\n'));
    } else if (command === 'claim') { const d = await claim(root, value); process.stdout.write(overlay(d.model)); }
    else if (command === 'finish') { const outcome = await finish(root, value, Number(previous)); console.log(outcome.fallback_safe ? 'safe-technical-free-failure' : 'no-fallback'); }
    else throw Error('Unknown router operation');
  } catch (e) { console.error(`Router: ${e.safe ? e.message : 'invalid configuration or local state; inspect privately'}`); process.exitCode = 75; }
}
