import { readFileSync, mkdirSync, existsSync, realpathSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { assert, axes, catalog, digest, json, key, local, object, text } from './routing-schema.mjs';
import { contextHash } from './route-plan.mjs';
import { atomicJSON } from './budget.mjs';
import { globalCatalogPath } from './catalog-store.mjs';
import { readCLIMetadata } from './read-cli-metadata.mjs';
import { assessed, assessmentWork } from './assessment-work.mjs';

// `models --verbose` is a sequence of ID lines and pretty JSON objects, not JSONL.
export function parseModels(output) {
  const models = new Map(); let rest = output.trim();
  while (rest) {
    const newline = rest.indexOf('\n'), id = rest.slice(0, newline).trim();
    assert(newline > 0 && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.:-]+$/.test(id) && !models.has(id), 'Unsupported models output');
    rest = rest.slice(newline + 1).trimStart();
    assert(rest.startsWith('{'), 'Missing verbose model metadata');
    let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { end = i + 1; break; }
    }
    assert(end > 0, 'Incomplete verbose metadata');
    models.set(id, JSON.parse(rest.slice(0, end))); rest = rest.slice(end).trimStart();
  }
  return models;
}
function xhigh(value) {
  return value && typeof value === 'object' && Object.entries(value).some(([k, v]) =>
    (['reasoningeffort', 'effort'].includes(k.toLowerCase().replaceAll('_', '')) && v === 'xhigh') || xhigh(v));
}
function advertisedPrices(cost) {
  const prices = value => Object.fromEntries(Object.entries({ input: value?.input, output: value?.output,
    cache_read: value?.cache?.read ?? value?.cache_read, cache_write: value?.cache?.write ?? value?.cache_write })
    .map(([k, n]) => [k, typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null]));
  return { unit: 'USD-per-million-tokens', base: prices(cost), conditions: 'unknown',
    tiers: (Array.isArray(cost?.tiers) ? cost.tiers : []).filter(t => t.tier?.type === 'context' && Number.isSafeInteger(t.tier.size) && t.tier.size >= 0)
      .map(t => ({ context_tokens: t.tier.size, prices: prices(t) })) };
}
export function cliBilling(model, metadata) {
  const provider = model.split('/')[0];
  assert(metadata.providerID === undefined || metadata.providerID === provider, 'CLI provider ID conflicts with model namespace');
  if (provider === 'opencode-go') return { billing: 'go', evidence: 'Local CLI opencode-go provider namespace identifies OpenCode Go; remaining quota and subscription conditions are unverified.' };
  const cost = metadata.cost;
  const simplePrice = cost && Object.keys(cost).every(k => ['input', 'output', 'cache', 'cache_read', 'cache_write'].includes(k));
  const zero = simplePrice && [cost.input, cost.output, cost.cache?.read ?? cost.cache_read, cost.cache?.write ?? cost.cache_write].every(n => n === 0);
  if (provider === 'opencode' && zero) return { billing: 'free', evidence: 'Local CLI opencode provider namespace and complete explicit zero input/output/cache rates identify a Free offering; remaining quota and other conditions are unverified.' };
  if (provider === 'opencode' && simplePrice && [cost.input, cost.output, cost.cache?.read ?? cost.cache_read, cost.cache?.write ?? cost.cache_write].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) && !zero)
    return { billing: 'paid', evidence: 'Local CLI OpenCode Console namespace and complete positive token pricing identify pay-as-you-go; wallet availability is enforced separately.' };
  return { billing: 'unknown', evidence: 'CLI metadata does not establish a supported Free/Go classification.' };
}
export function buildCatalog(root, models, assessments, source, agent = {}, exclusions = []) {
  object(assessments, ['schema_version', 'revision', 'credit_unit', 'entries']);
  assert(assessments.schema_version === 1 && Array.isArray(assessments.entries), 'Invalid catalog assessments');
  const entries = [];
  for (const a of assessments.entries) {
    object(a, ['model', 'variant', 'billing', 'evidence', 'assessment', 'outcomes'], ['variant_hash', 'research']);
    const m = models.get(a.model);
    assert(m && m.variants && typeof m.variants === 'object' && !Array.isArray(m.variants), 'Model absent or effective variants unavailable');
    assert(a.variant === null || Object.hasOwn(m.variants, a.variant), 'Variant not available in effective CLI configuration');
    const v = a.variant === null ? null : m.variants[a.variant];
    assert(!v?.disabled && m.capabilities?.toolcall === true, 'Disabled variant or model without tools');
    const variant_hash = digest([m.options ?? {}, v, agent]);
    const published = Object.values(a.assessment ?? {}).some(axis => axis?.sources !== undefined);
    assert((a.variant_hash === undefined && !published) || a.variant_hash === variant_hash, 'Assessment variant fingerprint missing or changed; review effective CLI settings');
    const classified = cliBilling(a.model, m);
    assert(classified.billing === 'unknown' || a.billing === 'unknown' || classified.billing === a.billing, 'Assessment billing conflicts with CLI provider classification');
    const billing = a.billing === 'unknown' ? classified.billing : a.billing;
    let rates = null;
    const rawRates = { input: m.cost?.input, output: m.cost?.output,
      cache_read: m.cost?.cache?.read ?? m.cost?.cache_read, cache_write: m.cost?.cache?.write ?? m.cost?.cache_write };
    // OpenCode advertises USD per million tokens. Keep credit units explicit;
    // Provider classification is separate from rates, quotas and conditions;
    // zero prices alone never classify an arbitrary provider as Free.
    const simplePrice = m.cost && Object.keys(m.cost).every(k => ['input', 'output', 'cache', 'cache_read', 'cache_write'].includes(k));
    if (simplePrice && assessments.credit_unit === 'microUSD' && Object.values(rawRates).every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) {
      rates = Object.fromEntries(Object.entries(rawRates).map(([k, n]) => [k, Math.ceil(n * 1_000_000)]));
    }
    assert(billing !== 'free' || (rates && Object.values(rates).every(n => n === 0)), 'Free claim not corroborated by complete CLI rates');
    entries.push({ model: a.model, variant: a.variant, variant_hash,
      context: m.limit?.context, input: m.limit?.input ?? null, output: m.limit?.output, tool_use: m.capabilities.toolcall,
      billing, rates, assessment: a.assessment, evidence: a.evidence,
      ...(a.research === undefined ? {} : { research: a.research }),
      ...(classified.billing === 'unknown' ? {} : { billing_evidence: classified.evidence }),
      requires_xhigh: a.variant === 'xhigh' || agent.variant === 'xhigh' || agent.model?.variant === 'xhigh' || !!xhigh([m.options, v, agent]), outcomes: a.outcomes,
      ...(source.scope === 'global' ? { pricing: advertisedPrices(m.cost) } : {}) });
  }
  assert(entries.length > 0, 'No qualified combinations supplied; existing catalog preserved');
  if (source.scope === 'global') {
    const qualified = e => ['plan_following', 'tool_use', 'complexity_fit'].every(k => e.assessment[k]?.score > 0) &&
      ['implementation', 'debugging', 'refactoring'].some(k => e.assessment[k]?.score > 0);
    return catalog({ schema_version: 2, revision: assessments.revision, credit_unit: assessments.credit_unit, source,
      entries: entries.filter(qualified), unassessed: entries.filter(e => !qualified(e)), exclusions });
  }
  return catalog({ schema_version: 1, revision: assessments.revision, credit_unit: assessments.credit_unit, source, entries });
}
export function initialAssessments(models, revision, previous, source, agent) {
  const entries = [], exclusions = [];
  const prior = new Map([...previous?.entries ?? [], ...previous?.unassessed ?? []].map(e => [key(e), e]));
  for (const [model, m] of models) {
    if (!m.variants || typeof m.variants !== 'object' || Array.isArray(m.variants)) { exclusions.push({ model, reason: 'Effective variants unavailable; no strength inferred' }); continue; }
    if (m.capabilities?.toolcall !== true || m.capabilities?.input?.text === false || !Number.isSafeInteger(m.limit?.context) || m.limit.context <= 0 || !Number.isSafeInteger(m.limit?.output) || m.limit.output <= 0) {
      exclusions.push({ model, reason: 'Required advertised text/tool capability or limits unavailable' }); continue;
    }
    for (const variant of [null, ...Object.keys(m.variants).sort().filter(k => !m.variants[k]?.disabled)]) {
      const candidate = prior.get(key({ model, variant }));
      // Global config changes need a fresh routing fingerprint, not a new rating
      // for every unaffected model. Effective provider/model/variant/agent inputs
      // are already bound by variant_hash; runtime changes still require review.
      const scoped = previous?.source.context_hash === source.context_hash || m.options?.contract === 'opencode-v2';
      const old = scoped && previous?.source.cli_version === source.cli_version && candidate?.variant_hash === digest([m.options ?? {}, variant === null ? null : m.variants[variant], agent]) ? candidate : null;
      const curated = old && (assessed(old) || old.billing !== 'unknown' || old.outcomes.length > 0);
      entries.push({ model, variant, variant_hash: digest([m.options ?? {}, variant === null ? null : m.variants[variant], agent]),
        billing: cliBilling(model, m).billing === 'unknown' ? old?.billing ?? 'unknown' : cliBilling(model, m).billing, evidence: curated ? old.evidence : 'Local CLI advertises tool support and limits; quality unverified; billing classified from supported CLI provider metadata; no inference performed.',
        assessment: old?.assessment ?? Object.fromEntries(axes.map(k => [k, { score: null, basis: 'unknown', evidence: 'No verified task results supplied; CLI capabilities do not establish implementation quality.' }])),
        ...(old?.research === undefined ? {} : { research: old.research }),
        outcomes: old?.outcomes ?? [] });
    }
  }
  return { annotations: { schema_version: 1, revision, credit_unit: 'microUSD', entries }, exclusions };
}
export function enrichAssessments(initial, supplied, reassess = false) {
  object(supplied, ['schema_version', 'revision', 'credit_unit', 'entries']);
  assert(supplied.schema_version === 1 && Array.isArray(supplied.entries), 'Invalid catalog assessments');
  const available = new Set(initial.entries.map(key)), updates = new Map();
  for (const a of supplied.entries) {
    object(a, ['model', 'variant', 'billing', 'evidence', 'assessment', 'outcomes'], ['variant_hash', 'research']);
    assert(available.has(key(a)), 'Assessment combination absent from eligible local CLI inventory');
    assert(!updates.has(key(a)), 'Duplicate assessment combination'); updates.set(key(a), a);
  }
  return { ...supplied, entries: initial.entries.map(a => {
    const update = updates.get(key(a));
    if (!update) return a;
    const published = Object.values(update.assessment ?? {}).some(axis => axis?.sources !== undefined);
    assert((update.variant_hash === undefined && !published) || update.variant_hash === a.variant_hash,
      'Assessment variant fingerprint missing or changed; review effective CLI settings');
    if (assessed(a) && !reassess) {
      assert(digest([a.assessment, a.outcomes, a.research]) === digest([update.assessment, update.outcomes, update.research]),
        'Existing assessment is protected; research missing combinations only (explicit reassessment requires --reassess)');
      return a;
    }
    return update;
  }) };
}
// Only these updater-owned namespaces are disposable; never scan other projects
// or delete user-supplied assessment sources outside these scratch directories.
function obsoleteArtifacts(target, artifactRoots) {
  const paths = new Set(), owned = name => ['catalog-revisions', 'catalog-update'].includes(name) || name.startsWith('catalog-update-');
  const directory = dirname(target);
  for (const name of readdirSync(directory)) {
    const suffix = name.slice(basename(target).length + 1);
    if (owned(name) || (name.startsWith(`${basename(target)}.`) && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(suffix))) paths.add(join(directory, name));
  }
  for (const root of new Set(artifactRoots)) {
    const scratch = local(root, 'artifacts/opencode');
    if (existsSync(scratch)) for (const name of readdirSync(scratch)) if (owned(name)) paths.add(join(scratch, name));
  }
  return [...paths];
}
export function publishCatalog(target, result, previous, artifactRoots = []) {
  catalog(result);
  assert(previous?.revision !== result.revision, 'Use a new catalog revision');
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const lock = `${target}.lock`;
  try { mkdirSync(lock); } catch (e) {
    assert(e.code !== 'EEXIST', 'Catalog update busy or interrupted; inspect lock, never steal it'); throw e;
  }
  let committed = false;
  try {
    const current = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : null;
    assert(digest(current) === digest(previous ?? null), 'Catalog changed during capture; repeat explicit update');
    // Resolve cleanup scope before commit. Removing a directory symlink unlinks
    // it; rm never follows it into another project or installation.
    const obsolete = obsoleteArtifacts(target, artifactRoots);
    atomicJSON(target, result, 2); committed = true;
    for (const path of obsolete) rmSync(path, { recursive: true, force: true });
    return obsolete.length;
  } catch (e) {
    if (committed) throw Object.assign(Error('Current catalog published; obsolete artifact cleanup incomplete; inspect updater-owned paths'), { safe: true, published: true });
    throw e;
  } finally {
    rmSync(lock, { recursive: true });
  }
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    const args = process.argv.slice(2);
    const global = args.includes('--global');
    let root, annotations, revision, reassess = false;
    if (global) {
      assert(args[0] === '--update' && args[1] === '--global', 'Use --update --global [--revision id] [--assessments file] only on explicit user request');
      const options = new Map();
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--reassess') { assert(!reassess, 'Duplicate reassessment option'); reassess = true; continue; }
        assert(['--revision', '--assessments'].includes(args[i]) && !options.has(args[i]) && text(args[i + 1]), 'Invalid global update options'); options.set(args[i], args[++i]);
      }
      assert(!reassess || options.has('--assessments'), 'Reassessment requires explicit assessment input');
      root = realpathSync(homedir());
      if (options.has('--assessments')) annotations = JSON.parse(readFileSync(options.get('--assessments'), 'utf8'));
      revision = options.get('--revision') ?? annotations?.revision ?? `global-${new Date().toISOString()}`;
      if (annotations) { assert(!options.has('--revision') || annotations.revision === revision, 'Assessment and requested revision differ'); }
    } else {
      assert(args.length === 5 && args[0] === '--update' && args[1] === '--project' && args[3] === '--assessments', 'Use --update --project path --assessments project-local.json only on explicit user request');
      root = realpathSync(args[2]); annotations = json(root, args[4]);
    }
    const scope = global ? 'global' : 'project';
    const target = global ? globalCatalogPath() : local(root, '.agents/model-catalog.json');
    const previous = existsSync(target) ? catalog(JSON.parse(readFileSync(target, 'utf8'))) : null;
    // Version/metadata reads are administrative only; never inference.
    let before;
    const captured = readCLIMetadata(root, parseModels, undefined, version => { before = contextHash(root, scope, version); });
    assert(before === contextHash(root, scope, captured.version), 'Configuration changed during catalog capture');
    const { models, agent, version } = captured;
    const source = { kind: 'opencode-cli', cli_version: version, captured_at: new Date().toISOString(), context_hash: before,
      metadata_hash: digest(captured.metadata), ...(global ? { scope: 'global' } : {}) };
    let exclusions = [];
    if (global) {
      const initial = initialAssessments(models, revision, previous, source, agent);
      annotations = annotations ? enrichAssessments(initial.annotations, annotations, reassess) : initial.annotations;
      exclusions = initial.exclusions;
    }
    const result = buildCatalog(root, models, annotations, source, agent, exclusions);
    const removed = publishCatalog(target, result, previous, [global ? process.cwd() : root]);
    console.log(`Catalog updated: qualified=${result.entries.length} unassessed=${result.unassessed?.length ?? 0} excluded=${result.exclusions?.length ?? 0}; revision=${result.revision}; removed_artifacts=${removed}; target=${target}`);
    if (global) {
      const work = assessmentWork(result);
      console.log(`Assessment work: reviewed=${work.reviewed} blocked=${work.blocked} pending=${work.pending} models=${work.models.length}; ${work.pending ? 'quality update incomplete; run assessment-work.mjs --global and research pending models' : 'no research pending'}`);
    }
  } catch (e) { console.error(`${e.published ? 'Catalog cleanup incomplete' : 'Catalog update failed'}: ${e.safe ? e.message : 'invalid CLI output, configuration or filesystem state; inspect current catalog'}`); process.exitCode = 65; }
}
