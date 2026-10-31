# Published evidence during catalog updates

Read only for explicit catalog updates. CLI capture/fingerprints/publication: [catalog-update.md](catalog-update.md); project controls: [model-routing.md](model-routing.md). Codex maintenance research is separate from selection; router/importer never fetch publications/call evaluators. Changing the procedure alone never refreshes/reassesses catalog.

## Update workflow

1. Capture eligible IDs/effective variants using [catalog-update.md](catalog-update.md), then run `assessment-work.mjs --global`. Work only on its pending combinations; retain existing valid assessments verbatim, including partial/source-gap reviews. Map publication reasoning settings against actual variant/agent settings in memory; never expose raw config/credentials.
2. Research official model cards/technical reports/provider docs/primary benchmark reports for exact versions, Free first, then Go, paid and unknown billing. Publications provide evidence, never candidates/variants/local availability/replacement prices. Search once per underlying model; share across aliases only with established identity/relevant config. Reuse sources within this update rather than searching per axis/variant.
3. Assess pending variants on seven dimensions using rubric below. Record URLs/access dates/tested config/applicability/positive scope evidence/limits. Unsupported dimensions/other-release family claims/unresolved aliases stay unknown. Mark `research` as `reviewed`, or `blocked` with checked sources/identity gap in evidence. A completed review may legitimately leave null axes; do not repeatedly research it on routine updates. Newly changed bindings need only an applicability review using retained sources where valid, not a blanket new search. Later source-gap retries/replacement judgments require an explicit reassessment request.
4. Publications → `provisional`; actual local acceptance/tool/repair evidence → `observed`. Published pass rates never create local `outcomes`, success probabilities or claimed executions. No paid evaluation authorized.
5. Prepare assessments JSON containing pending combinations only; preserve compatible observations. Publication entries need matching current CLI-backed `variant_hash`; changed settings require applicability reassessment. Import replaces a pending combination as a whole, never merges dimensions; protects already assessed combinations and preserves omitted ones.
6. Import `--update --global --assessments /path/to/assessments.json` with new revision. Script rechecks availability/settings bindings/schema/publication metadata, publishes atomically, removes obsolete catalog artifacts per [catalog-update.md](catalog-update.md). Current catalog embeds evidence; persistent input sources belong outside disposable catalog scratch. Report provisional/unknown changes/reasons and cleanup outcome; never incidentally enable `allow_provisional`/alter project approvals.

Explicit metadata-only requests and first connection skip research. Inaccessible/insufficient sources: record the checked source URLs and concrete limitation, keep unsupported scores null; never invent operational ratings or equate a failed search with proof that no sources exist. Complete an ordinary update only after pending combinations have assessments or documented research blockers; report their counts separately from routing qualification. Bare capture adds no research, retains compatible evidence, and reports remaining work.

## Applying evidence

Capability and provenance differ: no local runs means provisional, never score ≤1. No default 1/missing-evidence grade or model-wide copy across dimensions/variants. Null = insufficient evidence, not failure. Curated suitability is no probability/mechanical benchmark-percentage conversion.

| Dimension | Relevant published evidence |
| --- | --- |
| Plan following | Instruction/constraint/multi-step requirement adherence; separate claims/results. |
| Implementation | Code generation/repository results; benchmark scope/environment. |
| Debugging | Fault localization/repair/verification; generation alone insufficient. |
| Refactoring | Behavior preservation/repository maintenance/comparable evaluations; exclude unrelated results. |
| Tool use | Tool interface/agentic evaluations; tested harness limits. |
| Complexity fit | Demonstrated scope/dependencies/sustained work; context capacity alone insufficient. |
| Cost efficiency | Local CLI prices/relevant resource-performance evidence; estimated usage versus actual end-to-end cost/success. |

Variant mapping: `exact` = demonstrably matching relevant effective config; `general` = setting-independent claim, conservatively justified; `unmapped` = applicability unestablished. Maximum-reasoning benchmark grades never copy to low/base/custom under `general`; variant-dependent scores stay null until supported. Never infer strength from name/monotonic improvement across variants.

Cards/descriptions can justify provisional grades without local tests; marketing alone justifies neither demanding grades nor unrelated dimensions. Separate reported facts/curator inference in `evidence`/`applicability`. Reflect conflicting results/harnesses/token budgets/revisions in ratings/limits. Native checks remain project acceptance authority.

## Reproducible review: capability-scope-v1

Frozen rule IDs: changed meanings require new rubric version. Choose highest scope supported for dimension/effective config, considering contrary evidence. Record reasoning; never infer scope from name/price/effort/release date.

| Rule | Score | Required positive evidence |
| --- | --- | --- |
| U | null | Insufficient applicable dimension/config evidence; record gap, never numeric default. |
| S0 | 0 | Applicable unsuitability: documented restriction/relevant failure. |
| S1 | 1 | Explicit bounded-work support; explain dimension's task scope. |
| S2 | 2 | Specific technical descriptions/evaluations support multi-step/interdependent/repository-level work; explain broader-than-bounded scope and config applicability. |
| S3 | 3 | Config-matched evaluations demonstrate demanding sustained work; record difficulty/verification/results/limits. Generic claims/large context insufficient. |

Cost efficiency: S1 limited resource/cost advantage; S2 substantial advantage on relevant documented workload; S3 robust end-to-end advantage on representative demanding workloads. Token price proves no cost/success. CLI pricing stays authoritative; unknown repair/validation/retry costs remain unknown, no invented probabilities.

Each dimension's `review`: `rubric`, `rule`, `support` (`none`, `description`, `evaluation`), zero-based `source_indices` into its `sources`, `limits`. `evidence`: facts/curator inference; `limits`: gaps/contrary evidence/why broader scope unsupported. Supporting sources must apply. U: no indices, `support=none`; sources may explain gap. S3: evaluation/exact config reference. Schema checks mapping/references, never judgment truth.

Immutable readable catalog retains complete review input: model/version/exact variant/parameter hash, sources/short facts, scope judgment/score/provenance/limits; never leave sole explanation in temporary scripts. [routing-schema.mjs](../scripts/routing-schema.mjs) exports `scoreFromReview(review, sources)` for replay without CLI/network/AI. Import/retention preserves whole review. Replay is deterministic; new research/AI reassessment need not agree. Changed evidence/judgment requires explicit new revision.

## Structured publication evidence

Keep `score`, `basis`, `evidence`; optional `sources`: 1–10 public references. Schema example, never an installed-model rating:

```json
{
  "score": 1,
  "basis": "provisional",
  "evidence": "The documented tasks support bounded implementation; broader workflow reliability is untested.",
  "review": {
    "rubric": "capability-scope-v1",
    "rule": "S1",
    "support": "description",
    "source_indices": [0],
    "limits": "The source describes bounded work; no applicable evidence supports a broader scope."
  },
  "sources": [
    {
      "url": "https://provider.example/model-card#evaluation",
      "title": "Official model card, evaluation section",
      "accessed_at": "2026-10-21",
      "model_version": "Exact published model/version matched to the local ID",
      "tested_configuration": "Published reasoning settings, harness and resource limits",
      "variant_match": "exact",
      "applicability": "The relevant published settings match the local variant parameters.",
      "limitations": "Provider-reported evaluation; the local executor workflow has not been tested."
    }
  ]
}
```

Undisclosed `tested_configuration` → null. `variant_match`: `exact`, `general`, `unmapped`; numeric scores require ≥1 applicable source. Unknown may retain gap references. Reject `sources` on `observed`: local results belong in concise `evidence`, never publications as local verification. Public HTTPS URLs, no embedded credentials; valid `YYYY-MM-DD` access dates. Short paraphrases/public provenance only; no articles/transcripts/secrets/app data.

Older source/review-free catalogs/imports remain valid, never silently reassessed. New publication assessments require parameter binding. Schema checks completeness/allowed values, not page truth/model identity/judgment; explicit research/review owns those. Importer/router never fetch URLs/inject source content into executor.
