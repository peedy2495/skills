import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assert } from './routing-schema.mjs';

// Version adapters use the native CLI client; it owns private-server lifetime,
// event subscription, session.wait and final-message reconciliation in V2.
export function runtimeVersion(value) {
  const match = /^(?:opencode v)?(\d+\.\d+\.\d+)$/.exec(value.trim());
  assert(match && ['1', '2'].includes(match[1].split('.')[0]), 'Unsupported OpenCode version; inspect compatibility before execution');
  const major = Number(match[1].split('.')[0]);
  assert(major !== 2 || match[1] === '2.2.2', 'OpenCode V2 release not validated; update the version adapter explicitly');
  return { version: match[1], major };
}
export function probeRuntime() {
  try {
    return runtimeVersion(execFileSync('opencode', ['--version'], {
      env: { ...process.env, EXECUTOR_VERSION_PROBE: '1' }, encoding: 'utf8',
      timeout: 15000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch (e) { assert(false, e.safe ? e.message : 'Cannot determine OpenCode version; raw output suppressed'); }
}
export function executionOverlay(version, model, initial = {}) {
  const config = structuredClone(initial);
  assert(config && typeof config === 'object' && !Array.isArray(config), 'Invalid inline OpenCode configuration');
  if (runtimeVersion(version).major === 1) {
    config.small_model = model;
    config.compaction = { ...config.compaction, auto: false };
    config.agent ??= {};
    config.agent.build = { ...config.agent.build, permission: { ...config.agent.build?.permission, task: 'deny' } };
    for (const name of ['title', 'summary', 'compaction']) config.agent[name] = { ...config.agent[name], disable: true };
    return config;
  }
  // V2 deliberately does not reinterpret a mixed legacy inline permission map:
  // silently dropping an old deny while adding native keys would grant access.
  assert(!['agent', 'permission', 'small_model', 'tools'].some(k => Object.hasOwn(config, k)), 'Migrate legacy inline OpenCode fields to V2 before execution');
  assert(config.agents === undefined || (config.agents && typeof config.agents === 'object' && !Array.isArray(config.agents)), 'Invalid V2 agents');
  assert(config.policies === undefined || Array.isArray(config.policies), 'Invalid V2 policies');
  const forbidden = ['subagent', 'experimental_image_generate'];
  config.agents ??= {};
  const build = config.agents.build ?? {};
  assert(build && typeof build === 'object' && !Array.isArray(build), 'Invalid V2 build agent');
  assert(build.permissions === undefined || Array.isArray(build.permissions), 'Invalid V2 build permissions');
  config.agents.build = { ...build, permissions: [...build.permissions ?? [],
    ...forbidden.map(action => ({ action, resource: '*', effect: 'deny' }))] };
  config.policies = [...config.policies ?? [], ...forbidden.map(action => ({ action: 'tool.use', resource: `${action}:*`, effect: 'deny' }))];
  for (const name of ['title', 'summary', 'compaction']) config.agents[name] = { ...config.agents[name], disabled: true };
  config.compaction = { ...config.compaction, auto: false };
  config.warming = false;
  return config;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    const [command, version, model] = process.argv.slice(2);
    if (command === 'probe') { const runtime = probeRuntime(); console.log(`${runtime.major}\n${runtime.version}`); }
    else if (command === 'overlay') console.log(JSON.stringify(executionOverlay(version, model, JSON.parse(process.env.OPENCODE_CONFIG_CONTENT || '{}'))));
    else assert(false, 'Unknown runtime operation');
  } catch (e) { console.error(`Executor: ${e.safe ? e.message : 'invalid runtime configuration; inspect privately'}`); process.exitCode = 65; }
}
