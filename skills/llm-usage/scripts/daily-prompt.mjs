import { existsSync, lstatSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { atomicJSON, withLock } from '../../opencode-executor/scripts/budget.mjs';
import { assert, object } from '../../opencode-executor/scripts/routing-schema.mjs';

export async function claimPrompt(file, { now = new Date(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone } = {}) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return withLock(`${file}.lock`, async () => {
    let prior = null;
    // lstat also detects a dangling symlink; never follow a foreign state file.
    let info;
    try { info = lstatSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (info) {
      assert(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'Reminder state must be a local file');
      prior = JSON.parse(readFileSync(file, 'utf8'));
      object(prior, ['schema_version', 'day', 'timezone', 'prompted_at']);
      assert(prior.schema_version === 1 && /^\d{4}-\d{2}-\d{2}$/.test(prior.day) && typeof prior.timezone === 'string' && Number.isFinite(Date.parse(prior.prompted_at)), 'Invalid reminder state');
    }
    // Reinterpret the previous instant in the current user timezone. A timezone
    // change alone must not generate another reminder for the same local day.
    const previousDay = prior && new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(prior.prompted_at));
    const ask = !prior || (previousDay < day && Date.parse(prior.prompted_at) < now.getTime());
    if (ask) atomicJSON(file, { schema_version: 1, day, timezone, prompted_at: now.toISOString() }, 2);
    return { ask, day, timezone };
  });
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    assert(args[0] === 'claim' && (args.length === 1 || (args.length === 3 && args[1] === '--timezone')), 'Use daily-prompt.mjs claim [--timezone IANA-zone]');
    const file = fileURLToPath(new URL('../../../.quota-prompt.json', import.meta.url));
    writeSync(1, JSON.stringify(await claimPrompt(resolve(file), { ...(args.length === 3 ? { timezone: args[2] } : {}) })) + '\n');
  } catch {
    writeSync(1, JSON.stringify({ ask: false, status: 'unavailable', error: 'reminder_state_or_timezone_invalid' }) + '\n');
    process.exitCode = 75;
  }
}
