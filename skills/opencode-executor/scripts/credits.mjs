import { readFileSync, realpathSync, statSync, existsSync, writeSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, object, integer, text, digest } from './routing-schema.mjs';
import { atomicJSON, withLock } from './budget.mjs';

export const usageURL = 'https://opencode.ai/zen/go/v1/usage';
export const windows = ['rolling', 'weekly', 'monthly'];
const units = fn => Object.fromEntries(windows.map(w => [w, fn(w)]));
const percent = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
const date = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s).toISOString().slice(0, 10) === s;
const instant = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(s) && Number.isFinite(Date.parse(s));

export function validateCredits(d) {
  object(d, ['schema_version', 'billing', 'volume', 'extra_credit_budget_micro_usd', 'state']);
  assert(d.schema_version === 1 && d.extra_credit_budget_micro_usd === 0, 'Extra balance must not fund planned starts');
  const b = d.billing, v = d.volume;
  object(b, ['enabled', 'period', 'limit_micro_usd', 'per_run_limit_micro_usd', 'reserves_micro_usd']);
  assert(typeof b.enabled === 'boolean' && text(b.period) && integer(b.limit_micro_usd) && integer(b.per_run_limit_micro_usd), 'Invalid shared billing limits');
  object(b.reserves_micro_usd, ['repair', 'validation']);
  assert(Object.values(b.reserves_micro_usd).every(integer), 'Invalid shared billing reserves');
  object(v, ['enabled', 'max_percent', 'reserves_percent', 'rounding_margin_percent', 'timeout_ms', 'allowances'], ['wait_for_reset']);
  assert(v.wait_for_reset === undefined || typeof v.wait_for_reset === 'boolean', 'Invalid quota wait control');
  assert(typeof v.enabled === 'boolean' && percent(v.rounding_margin_percent) && v.rounding_margin_percent >= 1 && integer(v.timeout_ms) && v.timeout_ms >= 100 && v.timeout_ms <= 15000, 'Invalid Go volume controls');
  object(v.max_percent, windows); assert(Object.values(v.max_percent).every(percent), 'Invalid Go window limits');
  object(v.reserves_percent, ['repair', 'validation']);
  assert(Object.values(v.reserves_percent).every(percent) && Object.values(v.reserves_percent).reduce((n, p) => n + p, 0) <= 100, 'Invalid Go volume reserves');
  assert(v.allowances && typeof v.allowances === 'object' && !Array.isArray(v.allowances), 'Invalid Go allowances');
  for (const [model, a] of Object.entries(v.allowances)) {
    assert(/^opencode-go\/[A-Za-z0-9_.:-]+$/.test(model), 'Go allowance needs an exact CLI model ID');
    object(a, ['limits_micro_usd', 'cost_multiplier', 'source', 'verified_at', 'valid_until']);
    object(a.limits_micro_usd, windows);
    assert(Object.values(a.limits_micro_usd).every(n => integer(n) && n > 0) && Number.isFinite(a.cost_multiplier) && a.cost_multiplier >= 1, 'Invalid Go allowance conversion');
    assert(text(a.source) && a.source.startsWith('https://') && date(a.verified_at) && date(a.valid_until) && a.valid_until >= a.verified_at, 'Go allowance requires dated evidence');
  }
  object(d.state, ['period', 'account_hash', 'snapshot', 'runs'], ['last_error']);
  if (d.state.last_error != null) {
    object(d.state.last_error, ['code', 'at']);
    assert(/^(?:usage_key|usage_account|usage_network|usage_http_\d{3}|usage_schema)$/.test(d.state.last_error.code) && instant(d.state.last_error.at), 'Invalid usage failure record');
  }
  assert(d.state.period === b.period, 'Shared billing period changed; reconcile explicitly');
  assert(d.state.account_hash === null || /^[a-f0-9]{64}$/.test(d.state.account_hash), 'Invalid shared usage account');
  assert(d.state.runs && typeof d.state.runs === 'object' && !Array.isArray(d.state.runs), 'Invalid shared reservations');
  if (d.state.snapshot !== null) {
    object(d.state.snapshot, ['observed_at', 'usage']);
    assert(instant(d.state.snapshot.observed_at), 'Invalid Go snapshot timestamp');
    normalizeUsage({ usage: d.state.snapshot.usage }, Date.parse(d.state.snapshot.observed_at));
  }
  for (const r of Object.values(d.state.runs)) {
    object(r, ['project_hash', 'decision_hash', 'model', 'variant', 'phase', 'state', 'reservation', 'window_resets', 'cost_multiplier', 'usage_credits', 'finished_at']);
    assert(text(r.project_hash) && text(r.decision_hash) && text(r.model) && ['implementation', 'fallback', 'repair', 'validation', 'specialist'].includes(r.phase), 'Invalid shared run identity');
    assert(r.variant === null || text(r.variant), 'Invalid shared variant');
    assert(['admitted', 'started', 'finished'].includes(r.state) && (r.usage_credits === null || integer(r.usage_credits)), 'Invalid shared run state');
    object(r.reservation, ['credits', 'volume']); object(r.reservation.volume, windows); object(r.window_resets, windows);
    assert(integer(r.reservation.credits) && Object.values(r.reservation.volume).every(n => Number.isFinite(n) && n >= 0) && Number.isFinite(r.cost_multiplier) && r.cost_multiplier >= 1, 'Invalid shared run reservation');
    assert(Object.values(r.window_resets).every(s => s === null || instant(s)) && (r.finished_at === null || instant(r.finished_at)), 'Invalid shared window identity');
  }
  return d;
}
export function normalizeUsage(payload, now = Date.now()) {
  object(payload, ['usage']); object(payload.usage, windows);
  return { observed_at: new Date(now).toISOString(), usage: units(w => {
    const v = payload.usage[w]; object(v, ['status', 'percent', 'resetsAt']);
    assert(['ok', 'rate-limited'].includes(v.status) && percent(v.percent) && instant(v.resetsAt) && Date.parse(v.resetsAt) > now, 'Unknown or expired Go window; admission denied');
    return { status: v.status, percent: v.percent, resetsAt: v.resetsAt };
  }) };
}
function tokenFromDotenv(directory) {
  const path = resolve(directory, '.env');
  assert(existsSync(path) && statSync(path).isFile() && realpathSync(path) === path, 'Go usage requires a local .env with OPENCODE_GO_API_KEY');
  const matches = readFileSync(path, 'utf8').split(/\r?\n/).filter(s => /^\s*(?:export\s+)?OPENCODE_GO_API_KEY\s*=/.test(s));
  assert(matches.length === 1, 'Configure exactly one OPENCODE_GO_API_KEY in .env');
  let value = matches[0].replace(/^\s*(?:export\s+)?OPENCODE_GO_API_KEY\s*=\s*/, '').trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    const quote = value[0], end = value.indexOf(quote, 1);
    assert(end > 1 && /^\s*(?:#.*)?$/.test(value.slice(end + 1)), 'Invalid Go usage key in .env');
    value = value.slice(1, end);
  } else value = value.replace(/\s+#.*$/, '').trim();
  assert(value.length > 0 && value.length <= 2048 && /^[A-Za-z0-9_.:-]+$/.test(value), 'Set OPENCODE_GO_API_KEY in .env; substitutions are unsupported');
  return value;
}
export function creditsPath(root, reference) {
  const path = realpathSync(resolve(root, reference));
  assert(basename(path) === 'credits.json' && statSync(path).isFile() && statSync(path).nlink === 1, 'Shared credits must resolve to one canonical credits.json');
  return path;
}
const configHash = d => digest({ schema_version: d.schema_version, billing: d.billing, volume: d.volume, extra_credit_budget_micro_usd: d.extra_credit_budget_micro_usd });
export const readCredits = (root, reference) => validateCredits(JSON.parse(readFileSync(creditsPath(root, reference), 'utf8')));

// Future capacity is only a wake-up estimate. No reservation or start is granted
// until a fresh provider response and all current budgets actually pass.
export function checkVolume(d, held, volume, phase, now) {
  const snap = d.state.snapshot, v = d.volume;
  for (const w of windows) {
    assert(Date.parse(snap.usage[w].resetsAt) > now, 'Go usage window expired; refresh required');
    assert(!held.some(r => r.model.startsWith('opencode-go/') && r.reservation.credits > 0 && r.reservation.volume[w] === 0 && (r.state !== 'finished' || r.usage_credits === null)), 'Reconcile unbounded Go runs before enabling volume limits');
  }
  function at(time) {
    return units(w => {
      const current = snap.usage[w], reset = Date.parse(current.resetsAt);
      const inWindow = held.filter(r => r.state !== 'finished' || r.usage_credits === null || (r.window_resets[w] !== null && Date.parse(r.window_resets[w]) > time));
      const heldPercent = inWindow.reduce((n, r) => n + r.reservation.volume[w], 0);
      const protection = ['repair', 'validation'].filter(p => p !== phase).reduce((n, p) => n + Math.max(0, v.reserves_percent[p] - inWindow.filter(r => r.phase === p).reduce((s, r) => s + r.reservation.volume[w], 0)), 0);
      const usedPercent = time >= reset ? 0 : current.percent;
      return { percent: usedPercent, held_percent: heldPercent, reservation_percent: volume[w], protected_percent: protection,
        rounding_margin_percent: v.rounding_margin_percent, limit_percent: v.max_percent[w], resets_at: current.resetsAt,
        fits: (time >= reset || current.status === 'ok') && usedPercent + heldPercent + volume[w] + protection + v.rounding_margin_percent <= v.max_percent[w] };
    });
  }
  const current = at(now), blocked = windows.filter(w => !current[w].fits);
  if (blocked.length === 0) return units(w => { const { fits, ...evidence } = current[w]; return evidence; });
  const events = [...new Set([...windows.map(w => Date.parse(snap.usage[w].resetsAt)), ...held.filter(r => r.state === 'finished' && r.usage_credits !== null).flatMap(r => Object.values(r.window_resets).filter(Boolean).map(Date.parse))])].filter(t => t > now).sort((a, b) => a - b);
  const next = events.find(t => Object.values(at(t)).every(w => w.fits));
  assert(next !== undefined, 'Go volume budget or protected reserves exceeded; known resets cannot free enough capacity');
  throw Object.assign(Error('Go volume exhausted; wait for the relevant reset and recheck'), { safe: true, code: 'credits_wait',
    retry_at: new Date(next + 1000).toISOString(), blocking_windows: blocked, windows: current,
    credits_config_hash: configHash(d), wait_for_reset: v.wait_for_reset === true });
}

export async function withCredits(root, reference, fn, { fetch: request = globalThis.fetch, now = () => Date.now() } = {}) {
  if (reference === undefined || reference === null) return fn(null);
  const path = creditsPath(root, reference);
  return withLock(`${path}.lock`, async () => {
    const d = validateCredits(JSON.parse(readFileSync(path, 'utf8'))), hash = configHash(d);
    const ctx = { path, hash, data: d, live: false, unavailable: false,
      persist() { atomicJSON(path, d, 2); },
      async refresh() {
        if (ctx.live) return;
        let stage = 'usage_key';
        try {
          const token = tokenFromDotenv(dirname(path)), account = digest(token);
          stage = 'usage_account';
          assert(d.state.account_hash === null || d.state.account_hash === account, 'Go usage key changed account binding; reconcile shared state explicitly');
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), d.volume.timeout_ms);
          try {
            stage = 'usage_network';
            const response = await request(usageURL, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', cache: 'no-store', signal: controller.signal });
            if (!response.ok && Number.isInteger(response.status) && response.status >= 100 && response.status <= 599) stage = `usage_http_${response.status}`;
            assert(response.ok, 'Go usage unavailable; admission denied');
            const body = await response.text();
            stage = 'usage_schema';
            assert(Buffer.byteLength(body) <= 16384, 'Go usage response exceeds supported size');
            d.state.snapshot = normalizeUsage(JSON.parse(body), now());
            d.state.account_hash = account; d.state.last_error = null; ctx.live = true;
          } finally { clearTimeout(timer); }
        } catch { ctx.unavailable = true; d.state.last_error = { code: stage, at: new Date(now()).toISOString() }; }
        // Retain even a denied start's normalized telemetry/failure. It never
        // turns a failed request into zero usage or refreshes a model catalog.
        ctx.persist();
      },
      check(entry, reservation, phase, without = null, preview = false) {
        const a = d.volume.allowances[entry.model];
        const multiplier = entry.billing === 'go' ? a?.cost_multiplier ?? 1 : 1;
        const credits = Math.ceil(reservation.credits * multiplier);
        assert(integer(credits), 'Shared credit arithmetic overflow');
        const held = Object.entries(d.state.runs).filter(([id]) => id !== without).map(([, r]) => r);
        const used = r => r.usage_credits ?? r.reservation.credits;
        let billing = null, volume = units(() => 0), evidence = null;
        if (d.billing.enabled) {
          const spent = held.reduce((n, r) => n + used(r), 0);
          const protectedCredits = ['repair', 'validation'].filter(p => p !== phase).reduce((n, p) => n + Math.max(0, d.billing.reserves_micro_usd[p] - held.filter(r => r.phase === p).reduce((s, r) => s + used(r), 0)), 0);
          assert(integer(spent) && integer(protectedCredits) && credits <= d.billing.per_run_limit_micro_usd && spent + credits + protectedCredits <= d.billing.limit_micro_usd, 'Shared billing budget or protected reserves exceeded');
          billing = { before: spent, reservation: credits, protected: protectedCredits, limit: d.billing.limit_micro_usd, period: d.billing.period, enforcement: 'estimated' };
        }
        if (d.volume.enabled && entry.billing === 'go') {
          assert(a && now() <= Date.parse(`${a.valid_until}T23:59:59.999Z`), 'No current verified Go allowance for selected model');
          volume = units(w => credits / a.limits_micro_usd[w] * 100);
          if (!preview) {
            assert(ctx.live && !ctx.unavailable, 'Fresh Go usage required; admission denied');
            try { evidence = checkVolume(d, held, volume, phase, now()); }
            catch (e) {
              assert(e.code !== 'credits_wait' || Date.parse(e.retry_at) <= Date.parse(`${a.valid_until}T23:59:59.999Z`), 'Go allowance expires before the relevant reset; explicit verification required');
              throw e;
            }
          }
        }
        return { path, config_hash: hash, billing, volume: evidence, observed_at: evidence ? d.state.snapshot.observed_at : null,
          enforcement: 'estimated-start-admission', reservation: { credits, volume }, cost_multiplier: multiplier };
      },
      reserve(decision) {
        assert(!Object.hasOwn(d.state.runs, decision.run_id), 'Shared run ID already used');
        const shared = decision.shared_credits;
        d.state.runs[decision.run_id] = { project_hash: digest(realpathSync(root)), decision_hash: digest(decision), model: decision.model, variant: decision.variant,
          phase: decision.phase, state: 'admitted', reservation: shared.reservation,
          window_resets: units(w => shared.volume?.[w].resets_at ?? null), cost_multiplier: shared.cost_multiplier, usage_credits: null, finished_at: null };
        // Write-ahead: a crash may strand a reservation, but cannot grant the same
        // balance twice. Never release it automatically on an interrupted commit.
        ctx.persist();
      },
      claim(decision) {
        const r = d.state.runs[decision.run_id];
        assert(r?.state === 'admitted' && r.project_hash === digest(realpathSync(root)) && r.decision_hash === digest(decision), 'Shared start permission missing or already used');
        assert(decision.shared_credits.config_hash === hash, 'Shared credit configuration changed after admission');
        r.state = 'started'; ctx.persist();
      },
      settle(decision, usage) {
        const r = d.state.runs[decision.run_id];
        assert(r?.state === 'started' && r.decision_hash === digest(decision), 'Shared settlement missing or already used');
        const actual = usage.credits === null ? null : Math.ceil(usage.credits * r.cost_multiplier);
        assert(actual === null || integer(actual), 'Invalid shared usage');
        if (actual !== null && actual > r.reservation.credits) {
          const ratio = r.reservation.credits === 0 ? null : actual / r.reservation.credits;
          assert(ratio !== null, 'Unexpected shared zero-cost overrun; reconcile explicitly');
          r.reservation.volume = units(w => r.reservation.volume[w] * ratio);
        }
        r.usage_credits = actual; r.finished_at = new Date(now()).toISOString(); r.state = 'finished'; ctx.persist();
      }
    };
    return fn(ctx);
  });
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    const [command, file, refresh] = process.argv.slice(2);
    assert(command === 'status' && file && (refresh === undefined || refresh === '--refresh'), 'Usage: credits.mjs status /path/to/credits.json [--refresh]');
    await withCredits(process.cwd(), file, async ctx => {
      if (refresh) await ctx.refresh();
      const failed = !!refresh && !ctx.live;
      writeSync(1, JSON.stringify({ status: failed ? 'unavailable' : 'ok', refreshed: ctx.live,
        billing_enabled: ctx.data.billing.enabled, volume_enabled: ctx.data.volume.enabled,
        wait_for_reset: ctx.data.volume.wait_for_reset === true,
        snapshot: ctx.data.state.snapshot, last_error: ctx.data.state.last_error ?? null, managed_runs: Object.keys(ctx.data.state.runs).length, extra_credit_budget_micro_usd: 0 }, null, 2) + '\n');
      if (failed) process.exitCode = 75;
    });
  } catch {
    writeSync(1, JSON.stringify({ status: 'unavailable', refreshed: false, error: 'invalid_configuration_or_arguments', snapshot: null }) + '\n');
    process.exitCode = 75;
  }
}
