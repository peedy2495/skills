import { readFileSync } from 'node:fs';
import { integer, digest } from './routing-schema.mjs';
import { runtimeVersion } from './opencode-runtime.mjs';

// A versioned, deliberately narrow adapter. Text/stderr are never error classifiers.
export function collectUsage(file, entry, cliVersion) {
  const raw = readFileSync(file, 'utf8');
  let events = [], complete = raw.endsWith('\n');
  try { events = raw.split('\n').filter(s => s.trim()).map(s => JSON.parse(s)); }
  catch { complete = false; }
  let v2 = false;
  try { v2 = runtimeVersion(cliVersion).major === 2; } catch { /* unsupported telemetry stays unknown */ }
  const supported = cliVersion === '1.18.31' || v2;
  const sessions = new Set(events.map(e => e.sessionID));
  let valid = complete && supported && (!v2 || (sessions.size === 1 && typeof events[0]?.sessionID === 'string' && events[0].sessionID.length > 0));
  const counts = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  const seen = new Map(); let steps = 0;
  for (const e of events) {
    if (!['step_finish', 'step_start', 'tool_use', 'text', 'reasoning', 'error'].includes(e.type)) valid = false;
    if (e.type !== 'step_finish') continue;
    const p = e.part, t = p?.tokens;
    if (!p?.id || p.type !== 'step-finish' || !t || ![t.input, t.output, t.reasoning, t.cache?.read, t.cache?.write].every(integer)) { valid = false; continue; }
    if (v2 && [t.input, t.output, t.reasoning, t.cache.read, t.cache.write].every(n => n === 0)) valid = false;
    const hash = digest(p);
    if (seen.has(p.id)) { if (seen.get(p.id) !== hash) valid = false; continue; }
    seen.set(p.id, hash); steps++;
    // OpenCode step-finish separates noncached input, text output and reasoning.
    counts.input += t.input; counts.output += t.output + t.reasoning;
    counts.cache_read += t.cache.read; counts.cache_write += t.cache.write;
  }
  const errors = events.filter(e => e.type === 'error');
  const technical = valid && errors.length > 0 && errors.every(e => v2
    ? (e.error?.type === 'provider.rate-limit' && e.error.status === 429) ||
      (['provider.internal', 'provider.transport'].includes(e.error?.type) && [500, 502, 503, 504].includes(e.error.status))
    : e.error?.name === 'APIError' && e.error.data?.isRetryable === true &&
      [429, 500, 502, 503, 504].includes(e.error.data.statusCode));
  // The CLI emits completed tools, not all pending tools. Therefore NO step-start,
  // text, tool, unknown or other events are allowed for an automatic restart.
  const beforeWork = technical && events.every(e => e.type === 'error');
  // V2 normalizes absent provider usage to zeros; all-zero steps do not prove no spend.
  // Keep them unknown rather than returning an invented zero-token execution.
  const measured = valid && steps > 0 && errors.length === 0 && Object.values(counts).every(integer) && (!v2 || Object.values(counts).some(n => n > 0));
  const tokenTotal = measured ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
  const tokens = integer(tokenTotal) ? tokenTotal : null;
  const creditTotal = entry.billing === 'free' ? 0 : measured && entry.rates
    ? Math.ceil(Object.entries(counts).reduce((sum, [k, n]) => sum + n * entry.rates[k] / 1_000_000, 0)) : null;
  const credits = integer(creditTotal) ? creditTotal : null;
  const errorType = v2 && errors.length && /^provider\.(?:rate-limit|internal|transport|go-limit|free-limit|quota|budget-limit|model-budget-limit|auth|no-route|timeout|invalid-request|invalid-output|unsupported-operation|content-filter|unknown)$/.test(errors[0].error?.type)
    ? errors[0].error.type : null;
  const retryAfter = v2 && integer(errors[0]?.error?.retryAfterMs) ? errors[0].error.retryAfterMs : null;
  return {
    ...(v2 ? { session_id: sessions.size === 1 && typeof events[0]?.sessionID === 'string' ? events[0].sessionID : null,
      error_type: errorType, retry_after_ms: retryAfter } : {}),
    usage: { tokens, credits }, counts: measured ? counts : null,
    accounting: { tokens: measured ? 'cli-reported' : 'unknown', credits: entry.billing === 'free' ? 'catalog-free' : credits === null ? 'unknown' : 'estimated-from-catalog' },
    error: errors.length ? (technical ? `provider_http_${v2 ? errors[0].error.status : errors[0].error.data.statusCode}` : errorType ?? 'unclassified_error') : null,
    before_work: beforeWork, complete: valid,
  };
}
