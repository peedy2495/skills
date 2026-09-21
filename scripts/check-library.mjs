import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = dir => readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(resolve(dir,e.name)) : [resolve(dir,e.name)]);
let skills=0;
for (const f of walk(resolve(root,'skills'))) {
  if (!f.endsWith('.md')) continue;
  const s=readFileSync(f,'utf8');
  if (f.endsWith('SKILL.md')) {
    if (!/^---\nname: [a-z0-9-]+\ndescription: .+\n---/.test(s)) throw Error('Invalid skill metadata: '+f);
    skills++;
  }
  for (const [,ref] of s.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^https?:/.test(ref)) continue;
    if (!existsSync(resolve(dirname(f),ref))) throw Error('Broken reference: '+ref);
  }
}
console.log(`PASS: ${skills} discoverable skills; all local Markdown links resolve.`);
