import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const markdown = [], entries = [];
function walk(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) throw Error('Distributed source must not be a symlink: ' + relative(root, path));
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) if (name !== '__pycache__') walk(resolve(path, name));
  } else if (path.endsWith('.md')) {
    markdown.push(path);
    if (path.endsWith('/SKILL.md')) entries.push(relative(root, path));
  }
}
for (const path of ['SKILL.md', 'README.md', 'AGENTS.md', 'skills', 'references', 'scripts']) walk(resolve(root, path));
const expected = ['SKILL.md', 'skills/llm-usage/SKILL.md', 'skills/opencode-executor/SKILL.md', 'skills/skill-maintenance/SKILL.md'].sort();
if (JSON.stringify(entries.sort()) !== JSON.stringify(expected)) throw Error('Only efficiency, execution, quota and this project maintenance belong here');
const broken = [];
for (const f of markdown) {
  const prose = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, raw] of prose.matchAll(/\]\(([^)]+)\)/g)) {
    const target = raw.replace(/^<(.+)>$/, '$1');
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const ref = target.split('#')[0];
    if (ref && !existsSync(resolve(dirname(f), ref))) broken.push(relative(root, f) + ': ' + ref);
  }
}
if (broken.length) throw Error('Broken local links:\n' + broken.join('\n'));
console.log('PASS: one consumer efficiency entrypoint and scoped maintenance; local references resolve without source symlinks.');
