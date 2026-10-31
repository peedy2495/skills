import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assert, axes, catalog } from './routing-schema.mjs';
import { globalCatalogPath } from './catalog-store.mjs';

// Completion of research and qualification for a task are different things.
// Legacy ratings/provenance also count as reviewed; never schedule them again.
export const assessed = e => e.research !== undefined || Object.values(e.assessment).some(a => a.score !== null || a.sources?.length);
export function assessmentWork(c) {
  const all = [...c.entries, ...(c.unassessed ?? [])], groups = new Map();
  for (const e of all.filter(e => !assessed(e))) {
    if (!groups.has(e.model)) groups.set(e.model, { model: e.model, billing: e.billing, combinations: [] });
    groups.get(e.model).combinations.push({ variant: e.variant, variant_hash: e.variant_hash });
  }
  const order = { free: 0, go: 1, paid: 2, unknown: 3 };
  return { revision: c.revision, dimensions: axes, combinations: all.length, qualified: c.entries.length,
    reviewed: all.filter(assessed).length, blocked: all.filter(e => e.research?.status === 'blocked').length,
    pending: all.filter(e => !assessed(e)).length,
    models: [...groups.values()].sort((a, b) => order[a.billing] - order[b.billing] || a.model.localeCompare(b.model)) };
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    const args = process.argv.slice(2);
    assert(args[0] === '--global' && (args.length === 1 || (args.length === 3 && args[1] === '--model')), 'Use assessment-work.mjs --global [--model exact-id] after explicit catalog capture');
    const work = assessmentWork(catalog(JSON.parse(readFileSync(globalCatalogPath(), 'utf8'))));
    const models = args.length === 3 ? work.models.filter(m => m.model === args[2]) : work.models.map(({ model, billing, combinations }) => ({ model, billing, pending: combinations.length }));
    console.log(JSON.stringify({ ...work, models }, null, 2));
  } catch (e) { console.error(`Assessment work failed: ${e.safe ? e.message : 'catalog unavailable or invalid'}`); process.exitCode = 65; }
}
