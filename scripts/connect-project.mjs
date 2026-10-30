import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, symlinkSync, unlinkSync, appendFileSync, writeSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assert, object } from '../skills/opencode-executor/scripts/routing-schema.mjs';
import { atomicJSON } from '../skills/opencode-executor/scripts/budget.mjs';

const library = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const present = path => { try { return lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const args = process.argv.slice(2);
try {
  assert(args.length === 0 || (args.length === 2 && args[0] === '--project' && args[1]), 'Use connect-project.mjs [--project path]');
  const root = realpathSync(args[1] ?? process.cwd());
  assert(existsSync(join(library, 'SKILL.md')), 'Missing efficiency entrypoint');
  const gitRoot = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert(root === realpathSync(gitRoot) && root !== library, 'Run from a consumer Git root, not the library');
  // Inspect conflicts before creating links. Never replace user files or follow
  // consumer configuration directories outside the repository.
  for (const dir of ['.agents', '.agents/skills']) {
    const path = join(root, dir), info = present(path);
    assert(!info || (info.isDirectory() && !info.isSymbolicLink()), 'Consumer .agents directories must be local directories');
  }
  const links = [['skills', library], ['.agents/skills/cost-efficient-prompts', library]];
  for (const [name, target] of links) {
    const path = join(root, name), info = present(path);
    assert(!info || (info.isSymbolicLink() && existsSync(path) && realpathSync(path) === target), `Conflicting consumer link: ${name}; preserve and reconcile it explicitly`);
  }
  const ignore = join(root, '.gitignore'), ignoreInfo = present(ignore);
  assert(!ignoreInfo || (ignoreInfo.isFile() && !ignoreInfo.isSymbolicLink() && ignoreInfo.nlink === 1), 'Consumer .gitignore must be a local file');
  const marker = join(root, '.agents/skills-setup.json'), markerInfo = present(marker);
  assert(!markerInfo || (markerInfo.isFile() && !markerInfo.isSymbolicLink() && markerInfo.nlink === 1), 'Consumer setup marker must be a local file');
  if (markerInfo) {
    const state = JSON.parse(readFileSync(marker, 'utf8'));
    object(state, ['schema_version', 'catalog_initialized_at']);
    assert(state.schema_version === 1 && typeof state.catalog_initialized_at === 'string' && Number.isFinite(Date.parse(state.catalog_initialized_at)), 'Invalid setup marker; inspect before retrying');
  }
  // Retire only former library aliases; project-owned skill files/links stay.
  const discovery = join(root, '.agents/skills');
  const legacy = present(discovery) ? readdirSync(discovery).filter(name => {
    const path = join(discovery, name);
    return /^[a-z0-9-]+$/.test(name) && present(path).isSymbolicLink() && readlinkSync(path) === `../../skills/skills/${name}`;
  }) : [];
  mkdirSync(join(root, '.agents/skills'), { recursive: true });
  for (const [name, target] of links) {
    const path = join(root, name);
    // Route discovery through ./skills so the consumer has one shared root.
    if (!present(path)) symlinkSync(name === 'skills' ? relative(root, target) : '../../skills', path);
  }
  for (const name of legacy) unlinkSync(join(discovery, name));
  const content = ignoreInfo ? readFileSync(ignore, 'utf8') : '';
  // A trailing slash would match directories only, not the ./skills symlink.
  const rules = ['/skills', '/artifacts/opencode/', '/.agents/skills-setup.json'];
  const missing = rules.filter(rule => !content.split(/\r?\n/).includes(rule));
  if (missing.length) appendFileSync(ignore, `${content && !content.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
  const update = !markerInfo;
  if (update) {
    // First connection explicitly authorizes the existing metadata-only updater.
    // Failure keeps the links but writes no success marker, allowing a retry.
    execFileSync(process.execPath, [join(library, 'skills/opencode-executor/scripts/refresh-model-catalog.mjs'), '--update', '--global'],
      { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
    atomicJSON(marker, { schema_version: 1, catalog_initialized_at: new Date().toISOString() }, 2);
  }
  writeSync(1, JSON.stringify({ status: 'connected', skill: 'cost-efficient-prompts', catalog_updated: update, next: 'Read skills/SKILL.md; consumer rules own implementation.' }) + '\n');
} catch (e) {
  writeSync(2, `Project connection failed: ${e.safe ? e.message : 'inspect existing links/configuration and updater diagnostics; no setup success recorded'}\n`);
  process.exitCode = 65;
}
