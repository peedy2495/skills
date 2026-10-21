import { mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, rmSync, openSync, closeSync, fsyncSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { assert, local, digest, integer, object } from './routing-schema.mjs';

const zero = () => ({ tokens: 0, credits: 0 });
export const storePath = root => local(root, 'artifacts/opencode/budget/state.json');
export function readState(root, budget) {
  const file = storePath(root);
  if (!existsSync(file)) {
    const runs = local(root, 'artifacts/opencode/runs');
    assert(!existsSync(runs) || readdirSync(runs).length === 0, 'Budget ledger missing; reconcile previous run records explicitly');
    return { schema_version: 1, period: budget.period, credit_unit: budget.credit_unit, runs: {}, tasks: {} };
  }
  const s = JSON.parse(readFileSync(file, 'utf8'));
  object(s, ['schema_version', 'period', 'credit_unit', 'runs', 'tasks']);
  assert(s.schema_version === 1 && s.period === budget.period && s.credit_unit === budget.credit_unit, 'Budget period/unit changed: reconcile ledger explicitly');
  for (const r of Object.values(s.runs)) {
    assert(r.decision && digest(r.decision) === r.decision_hash, 'Damaged decision ledger');
    assert(['admitted', 'started', 'finished'].includes(r.state), 'Damaged start state');
  }
  return s;
}
export function atomicJSON(path, value, spaces = 0) {
  const tmp = `${path}.${randomUUID()}`;
  let fd;
  try {
    fd = openSync(tmp, 'wx', 0o600);
    writeFileSync(fd, JSON.stringify(value, null, spaces) + '\n'); fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(tmp, path);
    const dir = openSync(dirname(path), 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
  } finally { if (fd !== undefined) closeSync(fd); rmSync(tmp, { force: true }); }
}
export async function withLock(lock, fn) {
  let held = false;
  for (let i = 0; i < 100; i++) {
    try { mkdirSync(lock); held = true; break; }
    catch (e) { if (e.code !== 'EEXIST') throw e; await new Promise(r => setTimeout(r, 20)); }
  }
  assert(held, 'Budget busy or interrupted transaction; inspect lock, never steal it');
  try { return await fn(); } finally { rmSync(lock, { recursive: true }); }
}
export async function transaction(root, budget, fn) {
  const path = storePath(root); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  local(root, 'artifacts/opencode/budget');
  return withLock(join(dirname(path), 'lock'), async () => {
    const s = readState(root, budget), result = await fn(s);
    atomicJSON(path, s); return result;
  });
}
export function totals(s) {
  const all = zero(), phases = {};
  for (const r of Object.values(s.runs)) {
    const phase = r.decision.phase; phases[phase] ??= zero();
    for (const k of ['tokens', 'credits']) {
      const n = r.outcome?.usage?.[k];
      // Unknown usage retains the admission reservation, independently per unit.
      const used = n === null || n === undefined ? r.decision.reservation[k] : n;
      assert(integer(used), 'Invalid accounted usage');
      all[k] += used; phases[phase][k] += used;
      assert(Number.isSafeInteger(all[k]), 'Budget arithmetic overflow');
    }
  }
  return { all, phases };
}
export function checkBudget(s, b, reservation, phase, combination = null) {
  const usage = totals(s), protection = zero();
  for (const name of ['repair', 'validation']) {
    if (name === phase) continue;
    for (const k of ['tokens', 'credits']) protection[k] += Math.max(0, b.reserves[name][k] - (usage.phases[name]?.[k] ?? 0));
  }
  for (const k of ['tokens', 'credits']) {
    assert(reservation[k] <= b.per_run[k], 'Per-run budget exceeded');
    assert((usage.phases[phase]?.[k] ?? 0) + reservation[k] <= b.phases[phase][k], 'Phase budget exceeded');
    assert(usage.all[k] + reservation[k] + protection[k] <= b.project[k], 'Project budget or protected reserves exceeded');
    if (phase === 'specialist') {
      const matches = v => combination && v.model === combination.model && v.variant === combination.variant;
      const cap = b.specialist_limits?.find(matches);
      assert(cap, 'Specialist requires an explicit per-combination budget');
      const spent = Object.values(s.runs).filter(r => r.decision.phase === 'specialist' && matches(r.decision))
        .reduce((n, r) => n + (r.outcome?.usage?.[k] ?? r.decision.reservation[k]), 0);
      assert(spent + reservation[k] <= cap.limit[k], 'Specialist combination budget exceeded');
    }
  }
  return { period: b.period, credit_unit: b.credit_unit, before: usage.all, phase, phase_before: usage.phases[phase] ?? zero(),
    phase_cap: b.phases[phase], per_run_cap: b.per_run, protected: protection, cap: b.project, enforcement: b.enforcement };
}
