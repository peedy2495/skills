# Shared account funding

Read only for shared billing/Go-volume setup or admission failures. Optional adapter supplements consumer `.agents/budget.json`; token/phase/specialist/protected-reserve limits remain. Without `credits`, behavior is unchanged. Account data never enters catalog/executor prompt.

## One local file across consumers

Ignored shared-root `credits.json`/`.env`; adapter requires `OPENCODE_GO_API_KEY`. **Only script processes `.env`; agents use sanitized output, never open/display/load it into context.** Preserve configured dotenv. Use inference provider's Go account/key; adapter never inspects/copies CLI credentials and cannot prove independent CLI auth matches. Never shell-source dotenv/export it into catalog refresh. Quotes/optional comment supported; substitutions/duplicate keys/external dotenv symlinks rejected. No token in arguments/audit/status/errors.

Initial setup: copy [credits.example.json](../../../credits.example.json)/[.env.example](../../../.env.example) only if local files are absent. Set key locally; restrict both files to owner. Configure account limits/evidence before enabling checks. Committed example enables neither, authorizes no spending.

Consumer `.agents/routing-policy.json`: `"credits":"skills/credits.json"` for `./skills` embedding; this repository: `"credits":"credits.json"`. All consumers must resolve the **same canonical file**; clones/copies share no reservations. Embedding/ignores: [README.md](../../../README.md), “Connect a project”.

`credits.json`: readable two-space JSON, config plus compact persistent `state`, atomically replaced; never edit during managed runs. Schema/API adapter: [credits.mjs](../scripts/credits.mjs). Retain normalized telemetry even on denied starts. Optional `state.last_error`: fixed code/timestamp only; previous successful snapshot stays dated, never becomes invented zero.

- `billing.enabled`: independent shared estimated cap: `limit_micro_usd`, `per_run_limit_micro_usd`, protected `reserves_micro_usd.repair/validation`. USD = 1,000,000 microUSD. Settle CLI usage at admitted rate/multiplier; unknown retains reservation. `period` is manual ledger ID, never calendar reset; reconcile/archive complete state before changing.
- `volume.enabled`: independent live Go checks. Go admission and **every** start claim, including Free, fetch `GET https://opencode.ai/zen/go/v1/usage` with Bearer token; refresh percentages/resets per actual start. Refresh failures recorded, block Go; qualified Free may proceed without Go capacity. `--check` validates local files/ordinary eligibility/budget only: no network/current-funding certification.
- `volume.wait_for_reset`: opt-in; omitted/false keeps immediate rejection. Otherwise eligible Go blocked solely by resettable volume waits for earliest relevant reset, refreshes/rechecks all admission/start conditions. Codex supervises pending command; no executor at gate, AI call or model discovery while waiting. Qualified Free continues when available. Details: [credit-wait.md](credit-wait.md).
- `max_percent`: `rolling`, `weekly`, `monthly` caps; all must pass. `reserves_percent.repair/validation` protect each window; phase may use own reserve, others preserve it; held phase charges reduce remaining reserve. `rounding_margin_percent` ≥1 percentage point for rounded API usage.
- `allowances`: exact CLI-catalog-approved model IDs with three `limits_micro_usd`, conservative `cost_multiplier`, public `source`, `verified_at`/`valid_until`. Account-plan quota conversions, never candidates/quality scores. Multiplier adjusts admitted cost for known conditions (e.g. peak prices), never catalog. Unknown/expired conversion blocks Go; no automatic research/quota/catalog update.
- `extra_credit_budget_micro_usd`: **zero**. Extra balance is emergency buffer, never planned capacity; subscription fee is no usage allowance.

Both enabled methods and project budget must pass. Disabling shared billing preserves project monetary cap; enabled zero billing caps forbid positive-cost reservations. Config changes after admission block start; telemetry does not alter config hash. Before enabling volume, reconcile active/unresolved Go runs from disabled-volume periods.

## Measured usage and estimated projections

API: `usage.{rolling,weekly,monthly}`, each `status` (`ok`/`rate-limited`), numeric `percent`, ISO UTC `resetsAt`. No absolute allowance/wallet/per-run settlement acknowledgment; reject earlier flat `rollingUsage`. Contract: [OpenCode source](https://github.com/anomalyco/opencode/blob/dev/packages/console/app/src/routes/zen/go/v1/usage.ts). Model-dependent allowance/price conditions: [Go documentation](https://opencode.ai/v2/docs/console/go/); verify subscription/date/exact CLI IDs when curating conversions.

Projection: `reserved_catalog_microUSD × cost_multiplier / window_limit_microUSD × 100`; reservations already include project `reserve_multiplier`. Admission sums observed usage, held reservations, proposed run, remaining protected reserves, rounding margin. Unknown/incomplete/expired/failed responses block Go. Valid rate-limited windows may permit waiting; reset grants nothing without fresh successful recheck. Never invent zero/use emergency wallet.

Rounded provider totals may include managed usage without identifying runs. Hold completed known-volume charges until recorded window reset passes **and** fresh response arrives; deliberately overcount rather than release unproven capacity. Active/interrupted/unknown charges persist across resets; reset never proves process stopped. Reconcile stranded/unknown charges only after execution/side-effect checks. Known billing settles separately; volume shadows may remain.

## Waiting for usable Go capacity

Read [credit-wait.md](credit-wait.md) only for wait/recovery behavior: earliest jointly usable reset, revalidation, persistent wait state, safe resumption/host lifetime. Waiting never authorizes replay with unknown effects or budget/task/fallback resets.

## Coordination and limits

Canonical `credits.json.lock/` serializes consumers, then consumer budget lock. Fsync shared reservation/start entitlement **before** local ledger commit: interruption may strand reservation, never expose capacity to competing start. Never steal locks/delete state/auto-refund interrupted transactions. Claim rechecks fresh Go usage/all project/shared caps/immutable config/single-use entitlement. Technical Free-to-Go fallback uses same checks; max one safe restart/task, one model/exact variant per invocation.

Shared file: hashed consumer ID, run/model/variant/phase references, reservations, settlement estimates, normalized telemetry only. Detailed task/audit/error logs stay local. Immutable run decisions bind shared config hash/observed windows/projections/reserves; outcomes retain actual start check. Preserve state/config file during embedding/upgrades.

**Estimated start controls** cannot stop in-flight requests, synchronize unmanaged clients/other machines, prove accounting freshness or enforce hard token/billing caps. Provider Extra Usage may consume emergency wallet on overruns; disabling it is separate provider-side protection. Usage endpoint changes no settings. Checks use no model calls/evaluations.

Cached status or explicit telemetry refresh:

```sh
node skills/opencode-executor/scripts/credits.mjs status credits.json
node skills/opencode-executor/scripts/credits.mjs status credits.json --refresh
```

Refresh queries usage only, never inference/catalog update. Both emit agent-readable JSON; `refreshed=false` means cached. API failure: `status=unavailable`, fixed `last_error`, dated previous snapshot if any, exit 75. Invalid config/arguments: fixed JSON error, never local-input dump.
