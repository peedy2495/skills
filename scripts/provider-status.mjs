import { writeSync } from 'node:fs';
import { consumerConfiguration } from '../skills/opencode-executor/scripts/consumer-config.mjs';
import { withCredits } from '../skills/opencode-executor/scripts/credits.mjs';
import { assert } from '../skills/opencode-executor/scripts/routing-schema.mjs';

try {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 1 && args[0] === '--refresh'), 'Use provider-status.mjs [--refresh]');
  const g = consumerConfiguration(); assert(g, 'Set up the shared consumer configuration first');
  await withCredits(process.cwd(), g.credits, async ctx => {
    if (args.length) await Promise.all([ctx.refresh(), ctx.refreshCodex()]);
    const codex = ctx.data.state.codex ?? { status: 'unavailable', buckets: null };
    const freshGo = ctx.live && !ctx.unavailable;
    writeSync(1, JSON.stringify({ scope: 'all-projects; separate provider accounts', refreshed: !!args.length,
      opencode: { status: args.length && !freshGo ? 'unavailable' : ctx.data.state.snapshot ? 'observed' : 'unavailable', snapshot: ctx.data.state.snapshot,
        last_error: ctx.data.state.last_error ?? null, unsettled_runs: Object.values(ctx.data.state.runs).filter(r => r.state !== 'finished' || r.usage_credits === null).length }, codex }, null, 2) + '\n');
    if (args.length && (!freshGo || codex.status !== 'ok')) process.exitCode = 75;
  });
} catch { writeSync(2, 'Shared provider status unavailable; configuration/account details suppressed.\n'); process.exitCode = 75; }
