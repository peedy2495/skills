# Explicit catalog update

Read only for user-requested catalog updates; [model-routing.md](model-routing.md) defines configuration scope. Never discover on missing data/startup/timer/failure/budget exhaustion. Follow [catalog-assessments.md](catalog-assessments.md) for publication enrichment/variant assessments and publish together. Codex researches only during requested maintenance; no extra evaluator/review call/runtime research. Collector/importer is deterministic: no browsing/rating generation. Metadata-only capture supports initial inventory/preparation/explicit metadata-only requests. Use actual installed shared path:

```sh
node /path/to/skills/opencode-executor/scripts/refresh-model-catalog.mjs --update --global
```

Initial capture needs no project/profile: metadata commands run from user home, capture global execution config, publish general facts only. Without quality evidence, confirmed tool-capable model/variants enter `unassessed` with null scores/no invented successes; router uses `entries` only. Missing effective variants/capability/limits go to `exclusions`, never guesses. Supported namespaces establish billing independently of quality; other billing stays unknown. Preserve advertised base/context-tier prices separately from conservative routing rates; unsupported conditions/prices stay unknown.

Curated import: `--update --global --assessments /path/to/assessments.json`, optional `--revision new-id` matching assessment revision. Overlay complete supplied entries onto current eligible CLI inventory; omitted combinations retain compatible curation or remain unassessed, unavailable models disappear. Unknown/duplicate supplied combinations fail, never add candidates. Without supplied assessments, unchanged parameter/config fingerprints retain curation; changed ones become unassessed. No automatic project-log import/export. Explicit general aggregate evidence is allowed; app data/raw usage stay local. Metadata capture makes no inference and proves no quality.

Legacy project interface, with imports confined to project:

```sh
node .agents/skills/opencode-executor/scripts/refresh-model-catalog.mjs --update --project . --assessments .agents/model-assessments.json
```

Only installed/configured CLI supplies candidates/effective variants/prices: `--version`, `debug config`, `debug agent build`, `models --verbose`. Disable project-config discovery as runner does and implicit models.dev fetching. Never `models --refresh`, external candidate APIs or inference; never unilaterally enable `--pure`. CLI metadata may depend on configured providers/plugins; external lists never add candidates.

Inspected CLI 1.18.31: `models --verbose` yields resolved objects after built-in/custom variant merging/disabled removal; parse ID-plus-JSON structurally. `debug config`/`debug agent` add context, not effective variants. `debug v2` equivalence is unproven, never a guessed fallback. Missing/unreliable variants abort update, preserve prior catalog. `variant=null` is observed base configuration without variant flag, never guessed strength/missing metadata.

Assessments require `schema_version`, new `revision`, `credit_unit`, `entries`. Entry: exact `model`, `variant`, `billing` (`free`, `go`, `paid`, `unknown`), `evidence`, `assessment`, `outcomes`. Optional `variant_hash` binds effective CLI model/variant/agent settings; mandatory with publication `sources`. Missing/changed required binding aborts publication. CLI availability, variants, tool capability and valid limits are mandatory; annotations never establish candidates.

Seven independent assessment objects: `plan_following`, `implementation`, `debugging`, `refactoring`, `tool_use`, `complexity_fit`, `cost_efficiency`; each `score` (0 unsuitable/1 bounded-simple/2 moderate/3 demanding/null), `basis` (`observed`, `provisional`, `unknown`), concise `evidence`. Optional `sources`/versioned `review` preserve provenance/scope rule/source indices/limits per [catalog-assessments.md](catalog-assessments.md). Recorded review must reproduce score; older entries remain valid. Publications stay provisional/unknown, never local observations; provisional does not cap score at 1. Null/unknown must agree. Use actual native acceptance/repair evidence; unsupported dimensions unknown, names never quality evidence. Unassessed/unqualified placeholders never route.

Refresh-only billing adapters: `opencode-go/` → `go`; `opencode/` plus complete explicit zero input/output/cache prices → `free`. If present, `providerID` must match namespace. Record `billing_evidence`; Go overrides `-free` suffix/zero prices. Never mark every `opencode/` model Free or extend adapters to similar/custom providers. Others retain explicitly curated billing/`unknown`; zero rates alone do not classify. Reject contradictory supplied billing. Unsupported prices/conditions remain unknown regardless of class; missing rates are null, never zero. Billing proves no quota/subscription balance/invoice/quality; never make live entitlement-test requests.

`outcomes`: actual cumulative `{task_class,attempts,successes,credits}` array, empty absent evidence. `task_class`: JSON string `[[sorted_unique_operations],complexity,risk,validation]`. Never synthesize runs/probabilities/cost superiority. Catalog generation/library tests authorize no paid A/B calls.

Catalog retains source/version, context/metadata hashes, timestamps, exact variant/agent hashes, per-combination ratings/conditions/limits; never raw debug config/headers/transcripts. Respect separate input/combined-context limits. Unsupported tiered routing rates stay unknown, never cheap base substitution. Schema-validated atomic replacement preserves old catalog on failure. Read-only old/new snapshots: global `revisions/`, legacy `artifacts/opencode/catalog-revisions/`; revision IDs never reused. No concrete catalog ships here.
