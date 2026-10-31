# Shared deterministic model routing

Read for integration/policy maintenance; normal planning needs only [routing-task.md](routing-task.md). Conditional details: [routing-budget.md](routing-budget.md) for budgets, [catalog-update.md](catalog-update.md) for explicitly requested updates, [routing-safety.md](routing-safety.md) for admission/fallback/audit/recovery. Node/Bash/Git serve the runner, not product requirements. No new AI classifier/reviewer, provider service or product test framework.

## Global catalog and separate consumer inputs

Project JSON: schema 1; global catalog: schema 2. Unknown fields/invalid values fail closed; executable SSOT: [routing-schema.mjs](../scripts/routing-schema.mjs). General facts/confirmed variants/curated assessments/advertised prices: ignored `catalog.json` at the shared library root (`skills/catalog.json` through consumer links). Only current versioned JSON persists; successful explicit updates prune old artifacts per [catalog-update.md](catalog-update.md). Private shared defaults and provider funding live in the [installation pool](../../../references/provider-pool.md), never in distributed Git data or per-project copies. Consumers own instructions/task features/run logs and optional tighter limits. Routed mode ignores legacy model/effort and rejects CLI overrides.

Run `node scripts/configure-consumer.mjs` once from the library. Ignored `config/consumer.json` supplies standing shared approvals without per-project model IDs. Qualification and account capacity are independent gates.

`emergency_families:["deepseek","muse","glm"]` records the user's baseline approval separately from measured quality. Only CLI-present `opencode`/`opencode-go` IDs matching these families, verified billing/prices, tools, context/output limits and existing authorization qualify. Keep all original scores/provenance; explicit required-axis failure (0) excludes a model. Eligible candidates order Free → Go → authorized paid Console; within each billing class, assessed candidates precede emergency candidates. Approved emergency Free therefore precedes assessed Go. Paid emergency starts require an enabled shared monetary cap; this does not enable extra Go wallet usage, purchase credits or change account privacy/authentication. Local `emergency_families:[]` disables emergency routing; subsets only. Audit marks `user-approved-emergency`; unknown quality is never called locally verified. No catalogue or no matching eligible CLI entry still prevents execution; no IDs/variants are invented.

Optional consumer `.agents/routing-policy.json` may only restrict shared defaults, for example:

```json
{"schema_version":1,"minimum_score":2,"auto_fallback":false}
```

Exact `allowed_combinations`/`default_go` overrides must be subsets of shared approved catalog candidates, including emergency approvals. A project cannot disable shared routing, change catalog/credit pool, lower qualification/reservation margins or expand provisional/fallback authorization. No project allocation increases provider remainder. Optional [project budgets](routing-budget.md) are extra caps; absent budgets use provider-only admission, retaining local execution/audit ledgers without inventing project credit.

Without shared setup, the existing explicit project-policy/catalog/budget interface remains compatible. Shared setup never silently falls back to it on malformed/missing funding or incompatible catalogs. No automatic discovery/refresh.

Global fingerprint binds CLI executable, global/managed/explicit config, relevant environment and potential `opencode.json`, `opencode.jsonc`, `.opencode` overrides; V2 also binds ancestor configuration, `.agents`/`.claude` agent definitions and runtime adapter. Excludes profiles/tasks/budgets/audits/catalog/revisions. Equivalent OpenCode inputs reuse snapshots despite different instructions/budgets. Potential project overrides conservatively conflict even with project-config discovery disabled; relative explicit paths may vary by cwd. Incompatibility aborts before inference, never updates/switches catalog. Ambient plugin cwd behavior is unprovable by hashes: require trusted deterministic configuration. Hash credentials/config in memory, never copy into catalog.

Assessed-path required scores: `max(minimum_score, complexity, risk, 3-validation)` for plan following/tool use/complexity fit/task operations. Provisional needs explicit permission. Context must fit required input plus output; respect known input limits separately. Exclude null scores, unknown billing/rates, unauthorized xhigh.

Use the billing/evidence order above. Free has no monetary ranking: compare the weakest required task-axis score, then the sum of required scores, then exact lexical order. Keep missing scores unknown; no source or success probability is invented. Ignore Free monetary history and `cost_efficiency` grades; record zero credits and retain token/eligibility limits. Within a Go tier use comparable documented allowance fractions when every candidate has a current conversion; otherwise use comparable observed total credits/success, or estimated token costs including funding multipliers. Mixed conversion/price estimates use token costs, never percentages versus dollars. Funded ties use stored efficiency and lexical order. Include failed/repaired-task costs in funded observations; never automatically promote ratings.

The shared pool is mandatory in common routing. Free requires no Go funding; Go checks fresh windows/reservations using documented conversions or the explicit token-price fallback. Paid Console uses its shared monetary cap. Optional local caps also apply. Both provider observations refresh at admission/start. [Funding](credits.md) owns accounting and script-only dotenv. Codex host requests are observed, not reserved by this runner. Account APIs never discover models/refresh the catalog.

## Explicit catalog update only

[catalog-update.md](catalog-update.md) owns discovery authorization. An explicit catalog update includes public research for missing assessments, equally for Free and paid; first connection or explicit metadata-only capture skips it. Reuse existing valid assessments. Publications remain provisional and need policy permission. Normal routing reads stored JSON only.

## Atomic admission, execution and audit

Read [routing-safety.md](routing-safety.md) for execution/fallback changes or interrupted-state recovery. The policy hash binds the selection-rules revision as well as policy JSON; old pending authorizations require re-evaluation after selection semantics change. Admission atomically reserves budgets/fallback slot/single-use start; one model/variant per invocation, no executor delegation/switching. Automatic fallback requires proven technical failure and unchanged safe state. Preserve persistent ledgers/audits/locks; never reset/steal them automatically.
