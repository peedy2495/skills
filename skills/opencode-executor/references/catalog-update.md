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

Only installed/configured CLI supplies candidates/effective variants/prices. Probe `--version`; use its validated adapter. Disable project-config discovery as runner does and implicit model metadata fetching. Never `models --refresh`, external candidate APIs or inference; never unilaterally enable `--pure`. CLI metadata may depend on configured providers/plugins; external lists never add candidates.

V1 (inspected 1.18.31): `models --verbose` yields resolved objects after built-in/custom variant merging/disabled removal; parse ID-plus-JSON structurally. `debug config`/`debug agent build` add context, not effective variants. Never guess a `debug v2` fallback.

V2 2.2.2: `models --standalone` supplies IDs; `api --standalone model.list` supplies effective model records, complete `variants[]` (exact IDs/settings/headers/body), capabilities/limits and price tiers. `api --standalone provider.list`/`agent.list` bind effective providers/build agent; `debug config --standalone` lists configuration sources, not a merged V1 object. Validate API location against capture directory and inventory consistency. Hash sensitive metadata in memory only. Use local native CLI APIs, never contact model providers for entitlement/quality tests. Adapter/details: [opencode-v2.md](opencode-v2.md).

Missing/unreliable variants abort update, preserve prior catalog. `variant=null` is observed base configuration without explicit variant, including fingerprint-bound agent settings; never guessed strength/missing metadata. New runtime/configuration bindings invalidate prior curation unless explicitly reviewed; migration never silently republishes/promotes it.

Assessments require `schema_version`, new `revision`, `credit_unit`, `entries`. Entry: exact `model`, `variant`, `billing` (`free`, `go`, `paid`, `unknown`), `evidence`, `assessment`, `outcomes`. Optional `variant_hash` binds effective CLI model/variant/agent settings; mandatory with publication `sources`. Missing/changed required binding aborts publication. CLI availability, variants, tool capability and valid limits are mandatory; annotations never establish candidates.

Seven independent assessment objects: `plan_following`, `implementation`, `debugging`, `refactoring`, `tool_use`, `complexity_fit`, `cost_efficiency`; each `score` (0 unsuitable/1 bounded-simple/2 moderate/3 demanding/null), `basis` (`observed`, `provisional`, `unknown`), concise `evidence`. Optional `sources`/versioned `review` preserve provenance/scope rule/source indices/limits per [catalog-assessments.md](catalog-assessments.md). Recorded review must reproduce score; older entries remain valid. Publications stay provisional/unknown, never local observations; provisional does not cap score at 1. Null/unknown must agree. Use actual native acceptance/repair evidence; unsupported dimensions unknown, names never quality evidence. Unassessed/unqualified placeholders never route.

Refresh-only billing adapters: `opencode-go/` → `go`; `opencode/` plus complete explicit zero input/output/cache prices → `free`. If present, `providerID` must match namespace. Record `billing_evidence`; Go overrides `-free` suffix/zero prices. Never mark every `opencode/` model Free or extend adapters to similar/custom providers. Others retain explicitly curated billing/`unknown`; zero rates alone do not classify. Reject contradictory supplied billing. Unsupported prices/conditions remain unknown regardless of class; missing rates are null, never zero. Billing proves no quota/subscription balance/invoice/quality; never make live entitlement-test requests.

`outcomes`: actual cumulative `{task_class,attempts,successes,credits}` array, empty absent evidence. `task_class`: JSON string `[[sorted_unique_operations],complexity,risk,validation]`. Never synthesize runs/probabilities/cost superiority. Catalog generation/library tests authorize no paid A/B calls.

Catalog retains source/version, context/metadata hashes, timestamps, exact variant/agent hashes, per-combination ratings/conditions/limits; never raw debug config/headers/transcripts. Respect separate input/combined-context limits. Unsupported tiered routing rates stay unknown, never cheap base substitution. No concrete catalog ships here.

## Current state only

Every explicit update reconciles against current CLI inventory: unavailable models/variants disappear; incompatible ratings are not retained. Keep only readable `catalog.json` (legacy `.agents/model-catalog.json`) with a new revision distinct from the current one; no revision snapshots/history. Catalog publication lock rejects concurrent/stale captures, never steals interrupted locks. Validation/capture failure preserves current catalog/artifacts; atomic replacement precedes cleanup.

After publication remove updater-owned `catalog-revisions/`, `catalog-update/`, `catalog-update-*` and orphan `catalog.json.<UUID>` files beside the target (legacy filename accordingly); global mode also removes its old `revisions/` archive. Also remove `catalog-revisions/`, `catalog-update/`, `catalog-update-*` under the invoking workspace's `artifacts/opencode/` (global mode: invocation cwd; legacy mode: selected project). These names are disposable catalog scratch; place persistent assessment sources elsewhere. Never scan other projects/follow artifact symlinks. Preserve policies/approvals, budgets/credits, executor audits, unrelated artifacts and external assessment sources. Current catalog embeds retained evidence; no history needed for routing.

Cleanup failure after publication reports partial maintenance explicitly: new catalog remains current, cleanup is incomplete; never claim rollback/success. Changing this procedure alone neither updates the catalog nor deletes installation artifacts. Normal routing never cleans/refreshes.
