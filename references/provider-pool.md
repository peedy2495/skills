# One provider pool across projects

Read for shared setup, funding failures or local restrictions; ordinary work uses the selected execution path. Provider accounts own available capacity. A project is a consumer, never a new balance. Codex buckets, Go quota percentages and monetary caps retain separate units.

Run once from the shared checkout:

```sh
node scripts/configure-consumer.mjs
node scripts/provider-status.mjs --refresh
```

Ignored `catalog.json` in the shared checkout owns model metadata/assessments; ignored `config/consumer.json` owns common routing defaults and ignored `config/credits.json` owns provider observations/shared Go reservations. Configuration layout/examples/migration: [README](../README.md#connect-a-project). Setup enables live Go checks/reset waiting and preserves balances, binding, conversion evidence, budgets, periods and all run records. Active/unknown runs require reconciliation first. It never copies credentials or grants emergency-wallet spending. Examples are schemas, not evidence of available credit.

Consumers linked to this checkout inherit common routing and the exact same pool automatically. No project routing/budget file is required. Eligible Free precedes Go/paid, including user-approved DeepSeek/Muse/GLM emergency Free with unknown scores. Within each billing class, assessed candidates precede emergency candidates. Optional local policy may narrow model choices/emergency families, raise thresholds/reservation margin or disable fallback; it cannot change pools/catalogs or broaden approvals. Optional project budgets are additional ceilings, never capacity allocations. Project instructions and task metadata remain local.

Every managed consumer/process must link this checkout and resolve the same canonical `config/credits.json`; copies share no reservations. `SKILLS_STATE_DIR` is limited to absolute paths inside the checkout for isolated fixtures (configuration under their `config/`, catalog at their root); external paths and symlink escapes are rejected. Missing ledger after setup requires restoration/reconciliation, never automatic replenishment. Independent machines require shared coordination beyond these local filesystem locks. Provider observations include externally reported consumption, but cannot reserve against uncoordinated clients or guarantee hard in-flight caps.

Admission/start refresh shared Codex and Go observations without inference. Go checks fresh provider windows minus all projects' reservations/protected reserves/margin, using the estimation modes below. Local budgets only restrict capacity. Unknown Go funding cannot authorize Go; approved Free may proceed. Codex observations are account-wide and dated; this OpenCode runner does not allocate/reserve Codex host turns or convert Codex credit units into Go capacity. Unavailable telemetry remains unknown; no manual balance questions.

[Funding](../skills/opencode-executor/references/credits.md) owns documented Go conversions and token-price fallback when evidence is missing/expired. The latter checks fresh quota headroom and serializes Go work across projects, but cannot prove a whole package fits before execution. Unknown/exhausted provider funding is never replaced with invented credit. [Routing](../skills/opencode-executor/references/model-routing.md) owns emergency approval and ordering; [reset waiting](../skills/opencode-executor/references/credit-wait.md) owns pending starts/recovery. Already-interrupted work is never blindly replayed.
