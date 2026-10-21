import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { globalCatalogPath } from './catalog-store.mjs';

export const axes = ['plan_following', 'implementation', 'debugging', 'refactoring', 'tool_use', 'complexity_fit', 'cost_efficiency'];
export const phases = ['implementation', 'fallback', 'repair', 'validation', 'specialist'];
export const assert = (value, message) => { if (!value) throw Object.assign(Error(message), { safe: true }); };
export const integer = n => Number.isSafeInteger(n) && n >= 0;
export const text = s => typeof s === 'string' && s.length > 0 && s.length <= 500 && !/[\r\n\0]/.test(s);
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const key = e => JSON.stringify([e.model, e.variant]);
export function object(v, required, optional = []) {
  assert(v && typeof v === 'object' && !Array.isArray(v), 'Expected object');
  assert(required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => [...required, ...optional].includes(k)), 'Invalid schema fields');
}
// Frozen rule IDs: changing their meaning requires a new rubric version.
// Evidence selection and scope are curated; replaying that recorded judgment is deterministic.
export function scoreFromReview(review, sources = []) {
  object(review, ['rubric', 'rule', 'support', 'source_indices', 'limits']);
  const scores = { U: null, S0: 0, S1: 1, S2: 2, S3: 3 };
  assert(review.rubric === 'capability-scope-v1' && Object.hasOwn(scores, review.rule), 'Unknown assessment rubric or rule');
  assert(['none', 'description', 'evaluation'].includes(review.support) && text(review.limits), 'Invalid assessment review');
  assert(Array.isArray(review.source_indices) && new Set(review.source_indices).size === review.source_indices.length &&
    review.source_indices.every(i => integer(i) && i < sources.length), 'Invalid review source references');
  const score = scores[review.rule], supporting = review.source_indices.map(i => sources[i]);
  assert(score === null ? review.support === 'none' && supporting.length === 0 :
    review.support !== 'none' && supporting.length > 0 && supporting.every(s => ['exact', 'general'].includes(s.variant_match)), 'Review lacks applicable supporting evidence');
  assert(score !== 3 || (review.support === 'evaluation' && supporting.some(s => s.variant_match === 'exact' && text(s.tested_configuration))), 'Demanding scope requires configuration-matched evaluation evidence');
  return score;
}
export function amount(v) { object(v, ['tokens', 'credits']); assert(integer(v.tokens) && integer(v.credits), 'Invalid budget amount'); }
export function local(root, name) {
  const path = resolve(root, name);
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const rel = relative(realpathSync(root), realpathSync(ancestor));
  assert(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'), 'Path must stay in consuming project');
  return path;
}
export const json = (root, name) => JSON.parse(readFileSync(local(root, name), 'utf8'));
export function catalog(c) {
  object(c, ['schema_version', 'revision', 'source', 'credit_unit', 'entries'], ['unassessed', 'exclusions']);
  object(c.source, ['kind', 'cli_version', 'captured_at', 'context_hash', 'metadata_hash'], ['scope']);
  assert([1, 2].includes(c.schema_version) && c.source.kind === 'opencode-cli' && text(c.revision) && text(c.credit_unit), 'Invalid catalog provenance');
  if (c.schema_version === 2) {
    assert(c.source.scope === 'global' && Array.isArray(c.unassessed) && Array.isArray(c.exclusions), 'Invalid global catalog');
    for (const e of c.exclusions) { object(e, ['model', 'reason']); assert(text(e.model) && text(e.reason), 'Invalid catalog exclusion'); }
  } else assert(c.unassessed === undefined && c.exclusions === undefined && c.source.scope === undefined, 'Unexpected legacy catalog fields');
  assert(['cli_version', 'captured_at', 'context_hash', 'metadata_hash'].every(k => text(c.source[k])), 'Missing catalog provenance');
  assert(Array.isArray(c.entries), 'Invalid catalog entries');
  const seen = new Set();
  const pending = c.unassessed ?? [];
  for (const e of [...c.entries, ...pending]) {
    object(e, ['model', 'variant', 'variant_hash', 'context', 'output', 'tool_use', 'billing', 'rates', 'assessment', 'evidence', 'requires_xhigh', 'outcomes'], ['input', 'pricing', 'billing_evidence']);
    assert(typeof e.model === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.:-]+$/.test(e.model), 'Invalid model ID');
    assert(e.variant === null || (text(e.variant) && e.variant.length <= 100), 'Invalid variant ID');
    assert(!seen.has(key(e)), 'Duplicate model/variant'); seen.add(key(e));
    assert(text(e.variant_hash) && integer(e.context) && e.context > 0 && integer(e.output) && e.output > 0 && e.tool_use === true, 'Unqualified model metadata');
    assert(e.input === undefined || e.input === null || integer(e.input), 'Invalid input limit');
    assert(['free', 'go', 'paid', 'unknown'].includes(e.billing) && typeof e.requires_xhigh === 'boolean' && text(e.evidence), 'Invalid qualification');
    assert(e.billing_evidence === undefined || text(e.billing_evidence), 'Invalid billing evidence');
    if (e.rates !== null) {
      object(e.rates, ['input', 'output', 'cache_read', 'cache_write']);
      assert(Object.values(e.rates).every(integer), 'Invalid rates');
    }
    assert(e.billing !== 'free' || (e.rates && Object.values(e.rates).every(n => n === 0)), 'Free status needs verified zero rates');
    object(e.assessment, axes);
    for (const axis of axes) {
      const a = e.assessment[axis];
      object(a, ['score', 'basis', 'evidence'], ['sources', 'review']);
      assert(a.score === null || (integer(a.score) && a.score <= 3), 'Invalid assessment score');
      assert(['observed', 'provisional', 'unknown'].includes(a.basis) && text(a.evidence), 'Invalid assessment evidence');
      assert((a.score === null) === (a.basis === 'unknown'), 'Unknown assessments must not invent scores');
      if (a.sources !== undefined) {
        assert(Array.isArray(a.sources) && a.sources.length > 0 && a.sources.length <= 10, 'Invalid assessment sources');
        assert(a.basis !== 'observed', 'Published assessments must remain provisional or unknown');
        for (const s of a.sources) {
          object(s, ['url', 'title', 'accessed_at', 'model_version', 'tested_configuration', 'variant_match', 'applicability', 'limitations']);
          assert(['url', 'title', 'accessed_at', 'model_version', 'applicability', 'limitations'].every(k => text(s[k])), 'Incomplete publication evidence');
          let url;
          try { url = new URL(s.url); } catch { assert(false, 'Invalid publication URL'); }
          assert(url.protocol === 'https:' && url.hostname && !url.username && !url.password, 'Use public HTTPS publication URLs');
          assert(/^\d{4}-\d{2}-\d{2}$/.test(s.accessed_at) && Number.isFinite(Date.parse(s.accessed_at)) && new Date(s.accessed_at).toISOString().slice(0, 10) === s.accessed_at, 'Invalid publication access date');
          assert(s.tested_configuration === null || text(s.tested_configuration), 'Invalid published configuration');
          assert(['exact', 'general', 'unmapped'].includes(s.variant_match), 'Invalid publication variant mapping');
        }
        assert(a.score === null || a.sources.some(s => s.variant_match !== 'unmapped'), 'Unmapped published variants cannot justify a score');
      }
      if (a.review !== undefined) {
        assert(a.basis !== 'observed' && Array.isArray(a.sources), 'Published review requires sources and cannot claim local observations');
        assert(a.score === scoreFromReview(a.review, a.sources), 'Assessment score differs from recorded review');
      }
    }
    const qualified = ['plan_following', 'tool_use', 'complexity_fit'].every(k => e.assessment[k].score > 0) &&
      ['implementation', 'debugging', 'refactoring'].some(k => e.assessment[k].score > 0);
    assert(pending.includes(e) ? !qualified : qualified, 'Unqualified combinations must remain outside routable entries');
    if (e.pricing !== undefined) {
      object(e.pricing, ['unit', 'base', 'tiers', 'conditions']);
      assert(e.pricing.unit === 'USD-per-million-tokens' && e.pricing.conditions === 'unknown' && Array.isArray(e.pricing.tiers), 'Invalid advertised pricing');
      const prices = value => { object(value, ['input', 'output', 'cache_read', 'cache_write']); assert(Object.values(value).every(n => n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0)), 'Invalid advertised rates'); };
      prices(e.pricing.base);
      for (const tier of e.pricing.tiers) { object(tier, ['context_tokens', 'prices']); assert(integer(tier.context_tokens), 'Invalid price tier'); prices(tier.prices); }
    }
    assert(Array.isArray(e.outcomes), 'Invalid outcomes');
    for (const o of e.outcomes) {
      object(o, ['task_class', 'attempts', 'successes', 'credits']);
      assert(text(o.task_class) && integer(o.attempts) && integer(o.successes) && o.successes <= o.attempts && integer(o.credits), 'Invalid observed outcomes');
    }
  }
  return c;
}
export function configuration(root) {
  const p = json(root, '.agents/routing-policy.json');
  object(p, ['schema_version', 'enabled', 'minimum_score', 'default_go', 'specialists', 'allow_provisional', 'auto_fallback', 'reserve_multiplier'], ['catalog', 'allowed_combinations', 'credits']);
  assert(p.credits === undefined || text(p.credits), 'Invalid shared credits path');
  const scope = p.catalog ?? (existsSync(local(root, '.agents/model-catalog.json')) ? 'project' : 'global');
  assert(['project', 'global'].includes(scope), 'Invalid catalog scope');
  const c = catalog(scope === 'project' ? json(root, '.agents/model-catalog.json') : JSON.parse(readFileSync(globalCatalogPath(), 'utf8')));
  assert(scope !== 'global' || c.schema_version === 2, 'Global routing requires a versioned global catalog');
  assert(p.schema_version === 1 && p.enabled === true && integer(p.minimum_score) && p.minimum_score <= 3, 'Invalid routing policy');
  assert(typeof p.allow_provisional === 'boolean' && typeof p.auto_fallback === 'boolean' && Number.isFinite(p.reserve_multiplier) && p.reserve_multiplier >= 1, 'Invalid routing controls');
  assert(scope !== 'global' || Array.isArray(p.allowed_combinations), 'Global catalog requires project-local model/variant approvals');
  for (const name of ['default_go', 'specialists', ...(p.allowed_combinations === undefined ? [] : ['allowed_combinations'])]) {
    assert(Array.isArray(p[name]), 'Invalid routing group');
    for (const member of p[name]) {
      object(member, ['model', 'variant']);
      const e = c.entries.find(e => key(e) === key(member));
      assert(e && (name !== 'default_go' || e.billing === 'go'), 'Routing group must reference qualified catalog entries');
    }
  }
  const b = json(root, '.agents/budget.json');
  object(b, ['schema_version', 'period', 'credit_unit', 'enforcement', 'project', 'per_run', 'phases', 'reserves'], ['specialist_limits']);
  assert(b.schema_version === 1 && text(b.period) && b.credit_unit === c.credit_unit && b.enforcement === 'estimated', 'Unsupported budget enforcement or unit');
  amount(b.project); amount(b.per_run); object(b.phases, phases); phases.forEach(k => amount(b.phases[k]));
  object(b.reserves, ['repair', 'validation']); amount(b.reserves.repair); amount(b.reserves.validation);
  if (b.specialist_limits !== undefined) {
    assert(Array.isArray(b.specialist_limits), 'Invalid specialist limits');
    for (const limit of b.specialist_limits) {
      object(limit, ['model', 'variant', 'limit']); amount(limit.limit);
      assert(c.entries.some(e => key(e) === key(limit)), 'Specialist limit must reference catalog combination');
    }
  }
  const t = json(root, '.agents/executor-task.json');
  object(t, ['schema_version', 'task_id', 'operations', 'complexity', 'risk', 'validation', 'context_tokens', 'output_tokens', 'estimated_tokens', 'phase']);
  assert(t.schema_version === 1 && text(t.task_id) && ['implementation', 'repair', 'validation', 'specialist'].includes(t.phase), 'Invalid task');
  assert(Array.isArray(t.operations) && t.operations.length > 0 && t.operations.every(k => ['implementation', 'debugging', 'refactoring'].includes(k)), 'Invalid task operations');
  assert(['complexity', 'risk', 'validation'].every(k => integer(t[k]) && t[k] <= 3), 'Invalid task features');
  assert(integer(t.context_tokens) && t.context_tokens > 0 && integer(t.output_tokens) && t.output_tokens > 0, 'Invalid context requirement');
  object(t.estimated_tokens, ['input', 'output', 'cache_read', 'cache_write']);
  assert(Object.values(t.estimated_tokens).every(integer) && Object.values(t.estimated_tokens).some(n => n > 0), 'Missing usage estimate');
  return { c, p, b, t, catalog_scope: scope };
}
export const taskClass = t => JSON.stringify([[...new Set(t.operations)].sort(), t.complexity, t.risk, t.validation]);
