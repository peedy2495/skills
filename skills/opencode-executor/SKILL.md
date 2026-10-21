---
name: opencode-executor
description: Delegate substantial coding or authorized Git delivery to OpenCode with compact handoff, event-driven supervision, focused final review. Edit trivial changes/workflow maintenance directly.
---

# Coding executor

Supervisor plans/checks; executor implements/repairs. One handoff, one focused review. User/consumer constraints govern scope; never infer commit, push, deployment or permission-bypass authorization. Legacy: one run, no fallback. Opt-in routing: at most one controlled technical Free-to-Go restart.

## Progressive Disclosure

Initial integration or broken/missing links/profiles: [README.md](../../README.md), “Connect a project”; skip setup in configured projects.

Delegation: read [supervision.md](references/supervision.md). Runner injects execution contract, seven rules and report schema; never reinject this supervisor skill/reference. Plan references: [testing.md](references/testing.md) for substantive implementation, [ui.md](references/ui.md) for actual interfaces, [architecture.md](references/architecture.md) for boundary/technology decisions. Never load whole catalogs, unrelated languages or adjacent skills as background.

## Design by Contract

Inspect relevant code/user changes. Prepare a Ready `.agents/PLAN.md` using [plan-template.md](references/plan-template.md): files, scope/invariants, acceptance, checks, risks, authorization. Current code/tests establish behavior, not historical requirements. Preserve patterns unless authorized change requires otherwise (KISS/YAGNI). Given–When–Then clarifies nontrivial acceptance without mandating a framework.

Consumer `.agents/executor.json` supplies legacy model/effort and exact project instructions. Resolve applicable local/ancestor rules; list only necessary paths. No implicit language/UI/framework/model defaults; Node/Bash/Git are runner tools, not product requirements.

Enabled routing: read [routing-task.md](references/routing-task.md). Codex supplies domain features; router selects exact model/variant and admits budgets from stored data. [model-routing.md](references/model-routing.md) is for configuration/explicit catalog updates only: global general metadata, local approvals/strategy/budgets/detailed usage, optional shared credits, legacy catalogs, publication-enriched assessments versus observations. Fingerprint incompatibility blocks; never refresh/discover models or analyze prices routinely.

From consumer root: `bash .agents/skills/opencode-executor/scripts/execute-plan.sh`; elsewhere add `--project /path/to/consumer`. Legacy authorized `--model provider/model`/`--effort` override profile; routed mode rejects overrides. xhigh needs `--allow-xhigh`. `--check`: no inference, budget/report writes. Missing checkout/profile blocks; never restore a copied runner.

## SSOT and supervision

One linked installation; app rules/toolchains local. Prompt order: stable contracts, sorted selected instructions, task plan. Runner disables project-config discovery because rules are supplied explicitly; other ambient instructions may remain. Preserve user work/secrets; scratch in consumer's ignored `artifacts/opencode/`.

Follow event/delta supervision: running/testing alone needs no decision; executor owns ordinary failures. No routine second review agent/full transcript reread. Host interaction limits prevail. Enabled `waiting_for_credits`: keep task active and await the existing runner's reset check/completion per [supervision.md](references/supervision.md); never replay a failed executor or finish early.

## Definition of Done

Review outcome/report, changed paths and relevant diff for acceptance, checks, regressions and scope. Reuse valid evidence; rerun for new changes/failure/missing checks only. Delivery-only: verify commit/status without repeating implementation review. PARTIAL/BLOCKED/invalid: inspect concrete gap; no unchanged retry/fallback. Recovery never overrides written report/failed CLI.

BLUF: result, changes, verification, unresolved limits. Unless user specifies otherwise, English Git titles/short bullets. Stage intended paths only; never infer push authorization. Maintain shared workflow directly with library fake-CLI tests; no recursive delegation.
