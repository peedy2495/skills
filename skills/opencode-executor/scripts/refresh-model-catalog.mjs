import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assert, axes, catalog, digest, json, key, local, object, text } from './routing-schema.mjs';
import { contextHash } from './route-plan.mjs';
import { atomicJSON } from './budget.mjs';
import { globalCatalogDirectory, globalCatalogPath } from './catalog-store.mjs';

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
  return { billing: 'unknown', evidence: 'CLI metadata does not establish a supported Free/Go classification.' };
}
export function buildCatalog(root, models, assessments, source, agent = {}, exclusions = []) {
  object(assessments, ['schema_version', 'revision', 'credit_unit', 'entries']);
  assert(assessments.schema_version === 1 && Array.isArray(assessments.entries), 'Invalid catalog assessments');
  const entries = [];
  for (const a of assessments.entries) {
    object(a, ['model', 'variant', 'billing', 'evidence', 'assessment', 'outcomes'], ['variant_hash']);
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
      ...(classified.billing === 'unknown' ? {} : { billing_evidence: classified.evidence }),
      requires_xhigh: a.variant === 'xhigh' || agent.variant === 'xhigh' || !!xhigh([m.options, v, agent]), outcomes: a.outcomes,
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
  for (const [model, m] of models) {
    if (!m.variants || typeof m.variants !== 'object' || Array.isArray(m.variants)) { exclusions.push({ model, reason: 'Effective variants unavailable; no strength inferred' }); continue; }
    if (m.capabilities?.toolcall !== true || m.capabilities?.input?.text === false || !Number.isSafeInteger(m.limit?.context) || m.limit.context <= 0 || !Number.isSafeInteger(m.limit?.output) || m.limit.output <= 0) {
      exclusions.push({ model, reason: 'Required advertised text/tool capability or limits unavailable' }); continue;
    }
    for (const variant of [null, ...Object.keys(m.variants).sort().filter(k => !m.variants[k]?.disabled)]) {
      const old = previous && previous.source.context_hash === source.context_hash
        ? [...previous.entries, ...(previous.unassessed ?? [])].find(e => key(e) === key({ model, variant }) && e.variant_hash === digest([m.options ?? {}, variant === null ? null : m.variants[variant], agent])) : null;
      const curated = old && (old.billing !== 'unknown' || old.outcomes.length > 0 || Object.values(old.assessment).some(a => a.basis !== 'unknown'));
      entries.push({ model, variant, variant_hash: digest([m.options ?? {}, variant === null ? null : m.variants[variant], agent]),
        billing: old?.billing ?? 'unknown', evidence: curated ? old.evidence : 'Local CLI advertises tool support and limits; quality unverified; billing classified from supported CLI provider metadata; no inference performed.',
        assessment: old?.assessment ?? Object.fromEntries(axes.map(k => [k, { score: null, basis: 'unknown', evidence: 'No verified task results supplied; CLI capabilities do not establish implementation quality.' }])),
        outcomes: old?.outcomes ?? [] });
    }
  }
  return { annotations: { schema_version: 1, revision, credit_unit: 'microUSD', entries }, exclusions };
}
export function enrichAssessments(initial, supplied) {
  object(supplied, ['schema_version', 'revision', 'credit_unit', 'entries']);
  assert(supplied.schema_version === 1 && Array.isArray(supplied.entries), 'Invalid catalog assessments');
  const available = new Set(initial.entries.map(key)), updates = new Map();
  for (const a of supplied.entries) {
    assert(available.has(key(a)), 'Assessment combination absent from eligible local CLI inventory');
    assert(!updates.has(key(a)), 'Duplicate assessment combination'); updates.set(key(a), a);
  }
  return { ...supplied, entries: initial.entries.map(a => updates.get(key(a)) ?? a) };
}
function publish(target, revisions, result, previous) {
  assert(previous?.revision !== result.revision, 'Use a new catalog revision');
  mkdirSync(revisions, { recursive: true, mode: 0o700 });
  const archive = c => join(revisions, `${digest(c.revision)}.json`);
  assert(!existsSync(archive(result)), 'Catalog revision already used; choose a new revision');
  if (previous) {
    const path = archive(previous);
    if (existsSync(path)) assert(digest(JSON.parse(readFileSync(path, 'utf8'))) === digest(previous), 'Catalog revision content changed');
    else writeFileSync(path, JSON.stringify(previous, null, 2) + '\n', { flag: 'wx', mode: 0o400 });
  }
  writeFileSync(archive(result), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o400 });
  atomicJSON(target, result, 2);
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    const args = process.argv.slice(2);
    const global = args.includes('--global');
    let root, annotations, revision;
    if (global) {
      assert(args[0] === '--update' && args[1] === '--global' && (args.length - 2) % 2 === 0, 'Use --update --global [--revision id] [--assessments file] only on explicit user request');
      const options = new Map();
      for (let i = 2; i < args.length; i += 2) { assert(['--revision', '--assessments'].includes(args[i]) && !options.has(args[i]) && text(args[i + 1]), 'Invalid global update options'); options.set(args[i], args[i + 1]); }
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
    const env = { ...process.env, OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_DISABLE_MODELS_FETCH: '1' };
    const cli = args => execFileSync('opencode', args, { cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const before = contextHash(root, scope), version = cli(['--version']).trim();
    assert(text(version), 'Cannot determine OpenCode version');
    // These commands do not perform inference. Never retain raw configuration.
    const resolved = JSON.parse(cli(['debug', 'config']));
    const agent = JSON.parse(cli(['debug', 'agent', 'build']));
    const output = cli(['models', '--verbose']);
    assert(before === contextHash(root, scope), 'Configuration changed during catalog capture');
    const models = parseModels(output);
    const source = { kind: 'opencode-cli', cli_version: version, captured_at: new Date().toISOString(), context_hash: before,
      metadata_hash: digest([output, resolved, agent]), ...(global ? { scope: 'global' } : {}) };
    let exclusions = [];
    if (global) {
      const initial = initialAssessments(models, revision, previous, source, agent);
      annotations = annotations ? enrichAssessments(initial.annotations, annotations) : initial.annotations;
      exclusions = initial.exclusions;
    }
    const result = buildCatalog(root, models, annotations, source, agent, exclusions);
    const revisions = global ? join(globalCatalogDirectory(), 'revisions') : local(root, 'artifacts/opencode/catalog-revisions');
    publish(target, revisions, result, previous);
    console.log(`Catalog updated: qualified=${result.entries.length} unassessed=${result.unassessed?.length ?? 0} excluded=${result.exclusions?.length ?? 0}; revision=${result.revision}; target=${target}`);
  } catch (e) { console.error(`Catalog update failed: ${e.safe ? e.message : 'invalid CLI output or configuration; previous catalog preserved'}`); process.exitCode = 65; }
}
