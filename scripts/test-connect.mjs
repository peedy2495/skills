import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('..', import.meta.url));
const base = mkdtempSync(join(tmpdir(), 'skills-connect-test-'));
after(() => rmSync(base, { recursive: true, force: true }));
const library = join(base, 'skills'), bin = join(base, 'bin');
mkdirSync(join(library, 'scripts'), { recursive: true }); mkdirSync(bin);
cpSync(join(source, 'scripts/connect-project.mjs'), join(library, 'scripts/connect-project.mjs'));
cpSync(join(source, 'SKILL.md'), join(library, 'SKILL.md'));
for (const skill of ['opencode-executor', 'llm-usage']) cpSync(join(source, 'skills', skill), join(library, 'skills', skill), { recursive: true });
const calls = join(base, 'calls.jsonl');
writeFileSync(join(bin, 'opencode'), `#!/usr/bin/env node
const fs = require('node:fs'), args = process.argv.slice(2), command = args.join(' ');
fs.appendFileSync(process.env.CONNECT_TEST_CALLS, JSON.stringify(args)+'\\n');
if (process.env.CONNECT_TEST_FAIL) process.exit(42);
const output = value => fs.writeSync(1, typeof value === 'string' ? value+'\\n' : JSON.stringify(value)+'\\n');
const response = data => output({location:{directory:process.cwd()},data});
switch(command) {
case '--version': output('opencode v2.2.3'); break;
case 'models --standalone': output('fixture/model'); break;
case 'debug config --standalone': output([]); break;
case 'api --standalone model.list': response([{id:'model',providerID:'fixture',enabled:true,variants:[],cost:[{input:1,output:1,cache_read:1,cache_write:1}],capabilities:{tools:true,input:['text'],output:['text']},limit:{context:10000,output:1000}}]); break;
case 'api --standalone provider.list': response([{id:'fixture'}]); break;
case 'api --standalone agent.list': response([{id:'build',request:{},permissions:[]}]); break;
default: process.exit(99);
}
`, { mode: 0o755 });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OPENCODE_') && !key.startsWith('CODEX_')));
Object.assign(env, { PATH: `${bin}:${process.env.PATH}`, XDG_CONFIG_HOME: join(base, 'config'), SKILLS_STATE_DIR: join(base, 'isolated-shared-state'), CONNECT_TEST_CALLS: calls });
let serial = 0;
function fixture() {
  const root = join(base, `consumer ${serial++}`); mkdirSync(root);
  assert.equal(spawnSync('git', ['init', '-q', root], { env }).status, 0);
  writeFileSync(join(root, 'AGENTS.md'), 'Keep existing project constraints.\n');
  return root;
}
const connect = (root, overrides = {}, cwd = root, extra = []) => spawnSync(process.execPath, [join(library, 'scripts/connect-project.mjs'), '--project', root, ...extra], { cwd, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 30000 });

test('fresh V2 consumer links sibling checkout and discovery, updates once, preserves instructions/profile and ignores runtime state', () => {
  const root = fixture(); mkdirSync(join(root, '.agents')); writeFileSync(join(root, '.agents/executor.json'), '{"instructions":["AGENTS.md"]}\n');
  writeFileSync(join(root, '.gitignore'), 'existing-rule');
  const result = connect(root, {}, base); assert.equal(result.status, 0, JSON.stringify({ stdout: result.stdout, stderr: result.stderr, calls: existsSync(calls) ? readFileSync(calls, 'utf8') : null }));
  assert.equal(readlinkSync(join(root, 'skills')), '../skills');
  assert.equal(readlinkSync(join(root, '.agents/skills/cost-efficient-prompts')), '../../skills');
  assert.deepEqual(readdirSync(join(root, '.agents/skills')), ['cost-efficient-prompts']);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), 'Keep existing project constraints.\n');
  assert.equal(readFileSync(join(root, '.agents/executor.json'), 'utf8'), '{"instructions":["AGENTS.md"]}\n');
  const marker = readFileSync(join(root, '.agents/skills-setup.json'), 'utf8'), before = readFileSync(calls, 'utf8');
  const again = connect(root); assert.equal(again.status, 0, again.stderr); assert.match(again.stdout, /"catalog_updated":false/);
  assert.equal(readFileSync(calls, 'utf8'), before); assert.equal(readFileSync(join(root, '.agents/skills-setup.json'), 'utf8'), marker);
  for (const path of ['skills', 'artifacts/opencode/run.json', '.agents/skills-setup.json']) {
    const ignored = spawnSync('git', ['-C', root, 'check-ignore', '--no-index', path], { env, encoding: 'utf8' });
    assert.equal(ignored.status, 0, ignored.stderr + path);
  }
  const catalog = JSON.parse(readFileSync(join(env.SKILLS_STATE_DIR, 'catalog.json'), 'utf8'));
  assert.equal(catalog.source.cli_version, 'opencode v2.2.3'); assert.equal(catalog.entries.length, 0); assert.equal(catalog.unassessed.length, 1);
  const commands = before.trim().split('\n').map(JSON.parse); assert(commands.every(args => !args.includes('run') && !args.includes('--refresh')));
});

test('each new project captures metadata even with a global catalog; pre-existing root symlink is accepted', () => {
  const root = fixture(); symlinkSync('../skills', join(root, 'skills'));
  const before = readFileSync(calls, 'utf8'); const result = connect(root);
  assert.equal(result.status, 0, result.stderr); assert.notEqual(readFileSync(calls, 'utf8'), before);
});

test('failed initialization keeps retryable links and no success marker', () => {
  const root = fixture(); const result = connect(root, { CONNECT_TEST_FAIL: '1' });
  assert.notEqual(result.status, 0); assert(existsSync(join(root, 'skills'))); assert(!existsSync(join(root, '.agents/skills-setup.json')));
  const retry = connect(root); assert.equal(retry.status, 0, retry.stderr); assert(existsSync(join(root, '.agents/skills-setup.json')));
});

test('different consumer links resolve the same provider pool without local balances', () => {
  const first = fixture(), second = fixture(), shared = join(base, 'shared-providers'); mkdirSync(shared);
  cpSync(join(source, 'consumer.example.json'), join(shared, 'consumer.json'));
  cpSync(join(source, 'credits.example.json'), join(shared, 'credits.json'));
  for (const root of [first, second]) symlinkSync('../skills', join(root, 'skills'));
  const read = root => spawnSync(process.execPath, ['--input-type=module', '-e', "import {consumerConfiguration} from './skills/skills/opencode-executor/scripts/consumer-config.mjs'; import{writeSync}from'node:fs';writeSync(1,consumerConfiguration().credits);"], { cwd: root, env: { ...env, SKILLS_STATE_DIR: shared }, encoding: 'utf8' });
  for (const root of [first, second]) {
    const result = read(root); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, join(shared, 'credits.json'));
    assert(!existsSync(join(root, 'credits.json')));
  }
});

test('only library aliases are retired; consumer domain skills stay local and maintenance is not discovered', () => {
  const root = fixture(), before = readFileSync(calls, 'utf8');
  mkdirSync(join(root, '.agents/skills/domain'), { recursive: true });
  writeFileSync(join(root, '.agents/skills/domain/SKILL.md'), '# Project-specific fixture\n');
  symlinkSync('domain', join(root, '.agents/skills/domain-alias'));
  symlinkSync('../../skills/skills/opencode-executor', join(root, '.agents/skills/opencode-executor'));
  symlinkSync('../../skills/skills/skill-creator', join(root, '.agents/skills/skill-creator'));
  const result = connect(root); assert.equal(result.status, 0, result.stderr);
  assert.notEqual(readFileSync(calls, 'utf8'), before);
  assert.deepEqual(readdirSync(join(root, '.agents/skills')).sort(), ['cost-efficient-prompts', 'domain', 'domain-alias']);
  assert.equal(readFileSync(join(root, '.agents/skills/domain/SKILL.md'), 'utf8'), '# Project-specific fixture\n');
  assert.equal(readlinkSync(join(root, '.agents/skills/domain-alias')), 'domain');
  for (const extra of [['--skill', 'imagegen'], ['--profile', 'authoring']]) {
    const invalid = fixture(); assert.notEqual(connect(invalid, {}, invalid, extra).status, 0); assert(!existsSync(join(invalid, 'skills')));
  }
});

test('conflicts, dangling links, foreign config directories and non-root invocations preserve existing state', () => {
  for (const kind of ['directory', 'dangling', 'foreign-agents', 'foreign-ignore', 'marker']) {
    const root = fixture();
    if (kind === 'directory') mkdirSync(join(root, 'skills'));
    if (kind === 'dangling') symlinkSync('missing', join(root, 'skills'));
    if (kind === 'foreign-agents') symlinkSync(base, join(root, '.agents'));
    if (kind === 'foreign-ignore') symlinkSync(join(base, 'missing-ignore'), join(root, '.gitignore'));
    if (kind === 'marker') { mkdirSync(join(root, '.agents')); writeFileSync(join(root, '.agents/skills-setup.json'), '{}'); }
    const before = existsSync(calls) ? readFileSync(calls, 'utf8') : '';
    assert.notEqual(connect(root).status, 0, kind); assert.equal(existsSync(calls) ? readFileSync(calls, 'utf8') : '', before);
    assert(!existsSync(join(root, '.agents/skills/cost-efficient-prompts')));
  }
  const root = fixture(), child = join(root, 'nested'); mkdirSync(child);
  assert.notEqual(connect(child).status, 0); assert(!existsSync(join(child, 'skills')));
});

test('a fresh Git clone elsewhere connects and preflights without source symlinks, Home skills or the original checkout', () => {
  const isolated = { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  delete isolated.SKILLS_STATE_DIR;
  for (const key of Object.keys(isolated)) if (['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_CONFIG_COUNT'].includes(key)) delete isolated[key];
  const git = (args, cwd) => {
    const result = spawnSync('git', args, { cwd, env: isolated, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  };
  const seed = join(base, 'portable-seed'); mkdirSync(seed);
  const files = git(['-C', source, 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const name of files) {
    const path = join(source, name); let info;
    try { info = lstatSync(path); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    assert(!info.isSymbolicLink(), `Clone source contains a symlink: ${name}`);
    assert(info.isFile()); mkdirSync(dirname(join(seed, name)), { recursive: true }); cpSync(path, join(seed, name));
  }
  git(['init', '-q'], seed); git(['add', '--all'], seed);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Portable source fixture'], seed);
  const relocated = join(base, 'unrelated layout with spaces'); mkdirSync(relocated);
  const cloned = join(relocated, 'skills'); git(['clone', '--no-local', seed, cloned]);
  rmSync(seed, { recursive: true });
  assert(!existsSync(join(cloned, 'catalog.json')), 'Private catalog must not ship in Git');
  const check = spawnSync(process.execPath, [join(cloned, 'scripts/check-library.mjs')], { env: isolated, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  const consumer = join(relocated, 'project'); mkdirSync(consumer); git(['init', '-q'], consumer);
  const connected = spawnSync(process.execPath, [join(cloned, 'scripts/connect-project.mjs')], { cwd: consumer, env: isolated, encoding: 'utf8' });
  assert.equal(connected.status, 0, connected.stderr);
  assert.equal(readlinkSync(join(consumer, 'skills')), '../skills');
  assert.equal(readlinkSync(join(consumer, '.agents/skills/cost-efficient-prompts')), '../../skills');
  assert.equal(realpathSync(join(consumer, '.agents/skills/cost-efficient-prompts/SKILL.md')), join(cloned, 'SKILL.md'));
  assert.deepEqual(readdirSync(join(consumer, '.agents/skills')), ['cost-efficient-prompts']);
  assert(existsSync(join(cloned, 'catalog.json')) && !lstatSync(join(cloned, 'catalog.json')).isSymbolicLink());
  assert(!existsSync(join(consumer, 'catalog.json')));
  assert.equal(git(['check-ignore', 'catalog.json'], cloned).trim(), 'catalog.json');
  const located = spawnSync(process.execPath, ['--input-type=module', '-e', "import{globalCatalogPath}from './skills/skills/opencode-executor/scripts/catalog-store.mjs';import{writeSync}from'node:fs';writeSync(1,globalCatalogPath());"], { cwd: consumer, env: isolated, encoding: 'utf8' });
  assert.equal(located.status, 0, located.stderr); assert.equal(located.stdout, join(cloned, 'catalog.json'));
  writeFileSync(join(consumer, 'AGENTS.md'), '# Consumer rules\n');
  writeFileSync(join(consumer, '.agents/executor.json'), '{"model":"fixture/model","instructions":["AGENTS.md"]}\n');
  writeFileSync(join(consumer, '.agents/PLAN.md'), '# Goal\nReady: isolated clone check.\n# Relevant Instructions\nnone\n');
  const preflight = spawnSync('bash', [join(consumer, 'skills/skills/opencode-executor/scripts/execute-plan.sh'), '--check'], { cwd: consumer, env: isolated, encoding: 'utf8' });
  assert.equal(preflight.status, 0, preflight.stderr);
});
