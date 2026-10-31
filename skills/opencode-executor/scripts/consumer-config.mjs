import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, object, key } from './routing-schema.mjs';

export const emergencyApproved = (entry, families = []) => /^(opencode|opencode-go)\//.test(entry.model) &&
  families.some(f => entry.model.split('/')[1].startsWith(`${f}-`)) && ['free', 'go', 'paid'].includes(entry.billing);

// One installation, shared by every consumer. An explicit installation-wide
// override also lets independent checkouts use the same pool; never copy state.
export const stateDirectory = () => {
  assert(!process.env.SKILLS_STATE_DIR || isAbsolute(process.env.SKILLS_STATE_DIR), 'SKILLS_STATE_DIR must be an installation-wide absolute path');
  return resolve(process.env.SKILLS_STATE_DIR || fileURLToPath(new URL('../../..', import.meta.url)));
};
export function consumerConfiguration() {
  const file = resolve(stateDirectory(), 'consumer.json');
  if (!existsSync(file)) return null;
  const info = lstatSync(file);
  assert(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Shared consumer configuration must be a local file');
  const g = JSON.parse(readFileSync(file, 'utf8'));
  object(g, ['schema_version', 'enabled', 'catalog', 'selection', 'minimum_score', 'allow_provisional', 'auto_fallback', 'reserve_multiplier', 'credits', 'refresh_codex'], ['emergency_families']);
  assert(g.emergency_families === undefined || (Array.isArray(g.emergency_families) && g.emergency_families.every(f => ['deepseek', 'muse', 'glm'].includes(f))), 'Invalid emergency model families');
  assert(g.schema_version === 1 && g.enabled === true && g.catalog === 'global' && g.selection === 'qualified-free-then-go', 'Invalid shared routing configuration');
  assert(Number.isInteger(g.minimum_score) && g.minimum_score >= 1 && g.minimum_score <= 3 && typeof g.allow_provisional === 'boolean' && typeof g.auto_fallback === 'boolean', 'Invalid shared model qualification');
  assert(Number.isFinite(g.reserve_multiplier) && g.reserve_multiplier >= 1 && g.credits === 'credits.json' && g.refresh_codex === true, 'Shared provider pool and automatic account refresh are required');
  return { ...g, directory: realpathSync(stateDirectory()), credits: resolve(realpathSync(stateDirectory()), 'credits.json') };
}

export function sharedPolicy(g, c, local = null, root = '.') {
  const refs = entries => entries.map(({ model, variant }) => ({ model, variant }));
  const emergency = g.emergency_families ?? [];
  const candidates = [...c.entries, ...(c.unassessed ?? []).filter(e => emergencyApproved(e, emergency))];
  const p = { schema_version: 1, enabled: true, catalog: 'global',
    minimum_score: g.minimum_score, allow_provisional: g.allow_provisional, auto_fallback: g.auto_fallback,
    reserve_multiplier: g.reserve_multiplier, credits: g.credits,
    emergency_families: emergency,
    allowed_combinations: refs(candidates.filter(e => ['free', 'go'].includes(e.billing) || emergencyApproved(e, emergency))),
    default_go: refs(candidates.filter(e => e.billing === 'go')), specialists: [] };
  if (!local) return p;
  object(local, ['schema_version'], Object.keys(p).filter(k => k !== 'schema_version'));
  assert(local.schema_version === 1 && (local.enabled === undefined || local.enabled === true), 'A project cannot bypass shared routing');
  assert(local.catalog === undefined || local.catalog === 'global', 'A project cannot replace the shared catalog');
  if (local.emergency_families !== undefined) {
    assert(Array.isArray(local.emergency_families) && local.emergency_families.every(f => emergency.includes(f)), 'A project cannot expand emergency approvals');
    p.emergency_families = local.emergency_families;
  }
  if (local.credits !== undefined) assert(realpathSync(resolve(root, local.credits)) === realpathSync(g.credits), 'A project cannot replace or copy the shared provider pool');
  for (const field of ['allowed_combinations', 'default_go', 'specialists']) {
    if (local[field] === undefined) continue;
    assert(Array.isArray(local[field]) && local[field].every(v => p[field].some(e => key(v) === key(e))), 'Local model approvals may only restrict the shared pool');
    p[field] = local[field];
  }
  if (local.minimum_score !== undefined) {
    assert(Number.isInteger(local.minimum_score) && local.minimum_score >= g.minimum_score && local.minimum_score <= 3, 'A project cannot lower shared qualification');
    p.minimum_score = local.minimum_score;
  }
  for (const field of ['allow_provisional', 'auto_fallback']) {
    if (local[field] === undefined) continue;
    assert(typeof local[field] === 'boolean' && (!local[field] || g[field]), 'A project cannot expand shared routing authorization');
    p[field] = local[field];
  }
  if (local.reserve_multiplier !== undefined) {
    assert(Number.isFinite(local.reserve_multiplier) && local.reserve_multiplier >= g.reserve_multiplier, 'A project cannot reduce the shared reservation margin');
    p.reserve_multiplier = local.reserve_multiplier;
  }
  return p;
}
