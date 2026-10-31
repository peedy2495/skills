import { readFileSync } from 'node:fs';

// Public dated conversion evidence, separate from account data and CLI prices.
export function documentedAllowances(now = Date.now()) {
  const d = JSON.parse(readFileSync(new URL('../../../references/opencode-go-allowances.json', import.meta.url)));
  if (now < Date.parse(d.verified_at) || now > Date.parse(`${d.valid_until}T23:59:59.999Z`)) return {};
  return Object.fromEntries(Object.entries(d.models).map(([model, value]) => [model, {
    limits_micro_usd: Object.fromEntries(Object.entries(d.window_fractions).map(([window, fraction]) => [window, Math.floor(value.monthly_usd * 1000000 * fraction)])),
    cost_multiplier: value.cost_multiplier, source: d.source, verified_at: d.verified_at, valid_until: d.valid_until,
  }]));
}
