# Optional deterministic model routing

Read for integration/policy maintenance; normal planning needs only [routing-task.md](routing-task.md). Conditional details: [routing-budget.md](routing-budget.md) for budgets, [catalog-update.md](catalog-update.md) for explicitly requested updates, [routing-safety.md](routing-safety.md) for admission/fallback/audit/recovery. Node/Bash/Git serve the runner, not product requirements. No new AI classifier/reviewer, provider service or product test framework.

## Global catalog and separate consumer inputs

Project JSON: schema 1; global catalog: schema 2. Unknown fields/invalid values fail closed; executable SSOT: [routing-schema.mjs](../scripts/routing-schema.mjs). General facts/confirmed variants/curated assessments/advertised prices: `${XDG_CONFIG_HOME:-~/.config}/opencode/model-routing/catalog.json`, immutable snapshots in `revisions/`. Never ship installation data here. Consumer owns strategy/approvals/budgets/task features/all run/usage logs. Required `.agents/executor.json` still supplies exact instructions; routed mode ignores legacy model/effort and rejects CLI overrides.

Opt in via `.agents/routing-policy.json`:

```json
{"schema_version":1,"enabled":true,"catalog":"global","allowed_combinations":[],"minimum_score":1,"default_go":[],"specialists":[],"allow_provisional":false,"auto_fallback":true,"reserve_multiplier":1.5}
```

Populate `allowed_combinations`, `default_go`, `specialists` with exact `{"model":"provider/id","variant":null}` references to qualified entries. Global routing requires explicit local approvals: publication grants no project authorization. References add no candidates. `default_go` requires verified `go` billing. No built-in model/technology.

Omitted `catalog` or explicit `project` preserves existing schema-1 `.agents/model-catalog.json`; absent local catalog defaults global. Explicit `global` never falls back on missing/incompatible data. No automatic migration/discovery; disabled routing preserves legacy behavior.

Global fingerprint binds CLI executable, global/managed/explicit config, relevant environment and potential `opencode.json`, `opencode.jsonc`, `.opencode` overrides; excludes profiles/tasks/budgets/audits/catalog/revisions. Equivalent OpenCode inputs reuse snapshots despite different instructions/budgets. Potential project overrides conservatively conflict even with project-config discovery disabled; relative explicit paths may vary by cwd. Incompatibility aborts before inference, never updates/switches catalog. Ambient plugin cwd behavior is unprovable by hashes: require trusted deterministic configuration. Hash credentials/config in memory, never copy into catalog.

Required scores: `max(minimum_score, complexity, risk, 3-validation)` for plan following/tool use/complexity fit/task operations. Provisional needs explicit permission. Context must fit required input plus output; respect known input limits separately. Exclude null scores, unknown billing/rates, unauthorized xhigh.

Order: qualified Free, qualified default_go, other configured specialists only for `phase=specialist` (never automatic failure fallback). Within tier, use observed end-to-end credits/success only if every candidate has comparable matching-task-class evidence; else estimated cost/stored efficiency, exact lexical tie-break. Include failed/repaired-task costs in observations. Missing evidence yields no invented probability/success claim. Record raw outcomes without automatic rating promotion.

Budgets are separate: [routing-budget.md](routing-budget.md). Optional shared `"credits":"skills/credits.json"`: [credits.md](credits.md) for independently enabled billing/Go-volume, script-only dotenv, live usage/resets, cross-consumer reservations. Project budgets still apply; account API never discovers models/refreshes catalog.

## Explicit catalog update only

Only explicit user requests authorize discovery/reassessment: follow [catalog-update.md](catalog-update.md) and [catalog-assessments.md](catalog-assessments.md). Missing data/startup/timers/failure/exhaustion never authorize updates. Normal routing reads stored JSON only.

## Atomic admission, execution and audit

Read [routing-safety.md](routing-safety.md) for execution/fallback changes or interrupted-state recovery. Admission atomically reserves budgets/fallback slot/single-use start; one model/variant per invocation, no executor delegation/switching. Automatic fallback requires proven technical failure and unchanged safe state. Preserve persistent ledgers/audits/locks; never reset/steal them automatically.
