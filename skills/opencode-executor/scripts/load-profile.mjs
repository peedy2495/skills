import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

// Read only the explicitly named profile fields. Never echo profile contents/errors.
const root = realpathSync(process.argv[2]);
const file = resolve(root, '.agents/executor.json');
try {
  if (!existsSync(file)) throw Error();
  const profileRelative = relative(root, realpathSync(file));
  if (isAbsolute(profileRelative) || profileRelative === '..' || profileRelative.startsWith('../')) throw Error();
  const p = JSON.parse(readFileSync(file, 'utf8'));
  if (!Object.hasOwn(p, 'instructions')) throw Error();
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw Error();
  if (Object.keys(p).some(k => !['model','effort','instructions'].includes(k))) throw Error();
  const model = p.model ?? '';
  const effort = p.effort ?? 'medium';
  if (typeof model !== 'string' || (model && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.:-]+$/.test(model))) throw Error();
  if (!['minimal','low','medium','high','xhigh'].includes(effort)) throw Error();
  const inputs = p.instructions;
  if (!Array.isArray(inputs)) throw Error();
  for (const name of inputs) {
    if (typeof name !== 'string' || !name.endsWith('.md') || isAbsolute(name) || name.split(/[\\/]/).includes('..') || /[\r\n\0]/.test(name)) throw Error();
    const actual = realpathSync(resolve(root, name));
    const rel = relative(root, actual);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('../') || !statSync(actual).isFile()) throw Error();
  }
  process.stdout.write([model,effort,...[...new Set(inputs)].sort()].join('\n')+'\n');
} catch {
  console.error('Invalid executor profile: use model, effort and existing project-local Markdown instruction paths only.');
  process.exit(65);
}
