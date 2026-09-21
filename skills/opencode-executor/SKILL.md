---
name: opencode-executor
description: Delegate substantial coding or authorized Git delivery to OpenCode with compact handoffs, event-driven supervision and focused final review. Use direct edits for trivial changes and workflow maintenance.
---

# Coding executor

Supervisor plans/checks; executor implements/repairs. One handoff, one autonomous run, one focused review. User instructions and consuming-project constraints govern scope; no automatic commits, push, deployment, model fallback or permission bypass.

## Progressive Disclosure

Read [supervision.md](references/supervision.md) for delegation. Runner injects the execution contract, seven rules and report schema. Do not inject this supervisor skill/supervision reference again. Select only needed references in the plan: [testing.md](references/testing.md) for substantive implementation; [ui.md](references/ui.md) only for actual interfaces; [architecture.md](references/architecture.md) only for boundary/technology decisions. Never load whole catalogs, unrelated languages or adjacent skills as background.

## Design by Contract

Inspect relevant implementation and user changes. Use [plan-template.md](references/plan-template.md) for a Ready `.agents/PLAN.md`: files, scope/invariants, acceptance, checks, risks and authorization. Current code/tests establish behavior, not historical requirements. Keep existing patterns unless the authorized task requires change (KISS/YAGNI). Given–When–Then clarifies nontrivial acceptance without requiring a framework.

The consumer owns `.agents/executor.json`: model, effort and exact project instruction files. Resolve applicable local/ancestor instructions before handoff and list only necessary paths. No implicit language, UI, framework or model defaults. Node/Bash/Git are runner tools, not product requirements.

Run from the consumer root: `bash .agents/skills/opencode-executor/scripts/execute-plan.sh`; from elsewhere add `--project /path/to/consumer`. Explicit authorized `--model provider/model` and `--effort` override the profile. xhigh requires `--allow-xhigh`. `--check` performs no model call or report write. Missing shared checkout/profile is a concrete blocker, never permission to resurrect a copied runner.

## SSOT and supervision

Link to one shared skill installation; keep app rules and toolchains local. Stable contracts, sorted selected instructions, then task plan form the prompt. The runner disables project config discovery because applicable rules are explicitly supplied; do not assume other ambient instructions are disabled. Preserve user work/secrets. Scratch stays in the consumer's ignored `artifacts/opencode/`.

Use the event/delta supervision contract. Running/testing alone is not a decision event; normal failures remain with executor. No routine second review agent or full transcript reread. Host-required interaction limits take precedence.

## Definition of Done

Inspect outcome/report, changed paths and relevant diff: acceptance, checks, regression risk and scope. Reuse valid evidence; rerun only for new changes/failure/missing checks. Delivery-only tasks verify commit/status without repeating implementation review. PARTIAL/BLOCKED/invalid outcome: inspect only the concrete gap, no unchanged retry or fallback. Report recovery never overrides a written report or failed CLI.

BLUF closeout: result, changes, verification, unresolved limits. English Git titles with short bullets unless user specifies otherwise; stage intended paths and never infer push authorization. Shared workflow maintenance is direct and tested with the library's fake CLI, not delegated recursively.
