import { existsSync, lstatSync, readFileSync, realpathSync, mkdirSync, writeFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consumerConfiguration, stateDirectory, emergencyApproved } from '../skills/opencode-executor/scripts/consumer-config.mjs';
import { validateCredits } from '../skills/opencode-executor/scripts/credits.mjs';
import { assert, catalog } from '../skills/opencode-executor/scripts/routing-schema.mjs';
import { globalCatalogPath } from '../skills/opencode-executor/scripts/catalog-store.mjs';
import { atomicJSON, withLock } from '../skills/opencode-executor/scripts/budget.mjs';
import { documentedAllowances } from '../skills/opencode-executor/scripts/go-allowances.mjs';

const source = fileURLToPath(new URL('..', import.meta.url));
export async function configureConsumer() {
  const directory = stateDirectory(), config = resolve(directory, 'consumer.json'), pool = resolve(directory, 'credits.json');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  assert(!existsSync(config) || existsSync(pool), 'Shared provider ledger missing; restore/reconcile before setup, never replenish it');
  if (existsSync(config)) consumerConfiguration();
  const readiness = await withLock(`${pool}.lock`, () => {
    if (existsSync(pool)) assert(lstatSync(pool).isFile() && !lstatSync(pool).isSymbolicLink() && lstatSync(pool).nlink === 1, 'Shared provider state must be a local file');
    const d = validateCredits(JSON.parse(readFileSync(existsSync(pool) ? pool : resolve(source, 'config/credits.example.json'), 'utf8')));
    assert(Object.values(d.state.runs).every(r => r.state === 'finished' && r.usage_credits !== null), 'Reconcile active or unknown shared runs before enabling global funding');
    d.volume.enabled = true; d.volume.wait_for_reset = true; d.volume.token_price_fallback ??= true;
    for (const [model, evidence] of Object.entries(documentedAllowances())) {
      const previous = d.volume.allowances[model];
      if (!previous || previous.source === evidence.source && previous.verified_at < evidence.verified_at) d.volume.allowances[model] = evidence;
    }
    // Preserve account binding, telemetry, reservations, limits, conversions and
    // billing period. Setup never manufactures capacity or clears spending.
    validateCredits(d); atomicJSON(pool, d, 2);
    return { verified_go_allowance_models: Object.values(d.volume.allowances).filter(a => Date.now() <= Date.parse(`${a.valid_until}T23:59:59.999Z`)).length,
      extra_credit_budget_micro_usd: d.extra_credit_budget_micro_usd };
  });
  if (!existsSync(config)) writeFileSync(config, readFileSync(resolve(source, 'config/consumer.example.json')), { flag: 'wx', mode: 0o600 });
  else {
    const g = JSON.parse(readFileSync(config, 'utf8'));
    if (g.emergency_families === undefined) { g.emergency_families = JSON.parse(readFileSync(resolve(source, 'config/consumer.example.json'))).emergency_families; atomicJSON(config, g, 2); }
  }
  consumerConfiguration();
  let catalogStatus = 'missing', qualified = 0, emergency = 0;
  if (existsSync(globalCatalogPath())) {
    try {
      const c = catalog(JSON.parse(readFileSync(globalCatalogPath(), 'utf8')));
      qualified = c.entries.filter(e => ['free', 'go'].includes(e.billing)).length;
      emergency = [...c.entries, ...c.unassessed].filter(e => emergencyApproved(e, consumerConfiguration().emergency_families)).length;
      catalogStatus = 'valid';
    }
    catch { catalogStatus = 'invalid'; }
  }
  return { status: 'configured', scope: 'all-consumers', pool, routing: 'free-first-with-approved-emergency', project_budget: 'optional-restriction',
    catalog_status: catalogStatus, qualified_models: qualified, approved_emergency_combinations: emergency, emergency_families: consumerConfiguration().emergency_families, ...readiness };
}
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(process.argv.length === 2, 'Use configure-consumer.mjs without arguments');
    writeSync(1, JSON.stringify(await configureConsumer()) + '\n');
  } catch { writeSync(2, 'Shared setup failed; inspect local configuration or unresolved runs; no account data printed.\n'); process.exitCode = 65; }
}
