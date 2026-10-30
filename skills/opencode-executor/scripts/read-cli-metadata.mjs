import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { assert } from './routing-schema.mjs';
import { runtimeVersion } from './opencode-runtime.mjs';

// Metadata only; called by the explicitly requested catalog updater, never routing.
// Provider/config/agent objects can contain secrets: hash in memory, never log/save.
export function normalizeV2Models(ids, items, providers = []) {
  assert(Array.isArray(items) && Array.isArray(providers), 'Incomplete V2 model/provider metadata');
  const available = new Set(ids), models = new Map();
  assert(available.size === ids.length && ids.length > 0, 'Invalid V2 model inventory');
  for (const m of items) {
    const id = `${m.providerID}/${m.id}`;
    if (!available.has(id)) continue;
    assert(!models.has(id) && m.enabled === true && Array.isArray(m.variants) && Array.isArray(m.cost), 'Incomplete V2 effective model metadata');
    const variants = {};
    for (const v of m.variants) {
      assert(typeof v.id === 'string' && v.id.length > 0 && !Object.hasOwn(variants, v.id), 'Invalid V2 effective variants');
      // Preserve complete effective settings/header/body inputs in the binding,
      // not just names or guessed numeric strengths. Object never leaves memory.
      variants[v.id] = v;
    }
    const bases = m.cost.filter(p => p.tier === undefined);
    assert(bases.length <= 1, 'Ambiguous V2 base pricing');
    const tiers = m.cost.filter(p => p.tier !== undefined);
    const cost = bases.length ? { ...bases[0], ...(tiers.length ? { tiers } : {}) } : undefined;
    const provider = providers.find(p => p.id === m.providerID);
    models.set(id, { providerID: m.providerID, name: m.name,
      options: { contract: 'opencode-v2', provider, modelID: m.modelID, package: m.package,
        compatibility: m.compatibility, settings: m.settings, headers: m.headers, body: m.body },
      variants, cost, limit: m.limit,
      capabilities: { toolcall: (m.type === undefined || m.type === 'chat') && m.capabilities?.tools === true && m.capabilities?.output?.includes('text'),
        input: { text: m.capabilities?.input?.includes('text') === true } } });
  }
  assert(models.size === available.size, 'V2 CLI list and effective model metadata disagree');
  return models;
}
export function readCLIMetadata(root, parseV1, cliOverride, onVersion = () => {}) {
  const env = { ...process.env, OPENCODE_CONFIG_PROJECT_DISABLE: '1', OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_DISABLE_MODELS_FETCH: '1' };
  const cli = cliOverride ?? (args => execFileSync('opencode', args, {
    cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const version = cli(['--version']).trim(), runtime = runtimeVersion(version);
  onVersion(version);
  if (runtime.major === 1) {
    const resolved = JSON.parse(cli(['debug', 'config']));
    const agent = JSON.parse(cli(['debug', 'agent', 'build']));
    const output = cli(['models', '--verbose']);
    return { version, models: parseV1(output), agent, metadata: [output, resolved, agent] };
  }
  const ids = cli(['models', '--standalone']).trim().split(/\r?\n/).filter(Boolean);
  assert(ids.every(id => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./:-]+$/.test(id)), 'Unsupported V2 model ID output');
  const read = operation => {
    const response = JSON.parse(cli(['api', '--standalone', operation]));
    assert(response.location?.directory && realpathSync(response.location.directory) === realpathSync(root), 'V2 metadata location differs from execution directory');
    return response.data;
  };
  const resolved = JSON.parse(cli(['debug', 'config', '--standalone']));
  const items = read('model.list'), providers = read('provider.list'), agents = read('agent.list');
  assert(Array.isArray(resolved) && Array.isArray(items) && Array.isArray(providers) && Array.isArray(agents), 'Incomplete V2 effective configuration');
  assert(items.filter(m => ids.includes(`${m.providerID}/${m.id}`)).every(m => providers.some(p => p.id === m.providerID)), 'Effective V2 provider metadata unavailable');
  const agent = agents.find(a => a.id === 'build');
  assert(agent && agent.request && Array.isArray(agent.permissions), 'Effective V2 build agent unavailable');
  return { version, models: normalizeV2Models(ids, items, providers), agent,
    metadata: [ids, items, providers, resolved, agents] };
}
