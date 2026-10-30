---
name: opencode-executor
description: Transport an authorized consumer task through an economical OpenCode path with selected context, budgets and compact results. No product, language, architecture or testing conventions.
---

# Economical execution

Load only after the [efficiency entrypoint](../../SKILL.md) selects delegation. Consumer instructions own implementation and checks. Preserve acceptance and authorization; never infer commit, push, deployment, model switching or permission bypass.

Prepare Ready `.agents/PLAN.md` with the [task template](references/plan-template.md) and exact project-owned rules/skills. `.agents/executor.json` names model/effort/project instructions. Resolve applicable ancestor/nested rules explicitly. No shared domain catalogue or default implementation stack.

Use [event/delta supervision](references/supervision.md). Enabled routing needs [task features](references/routing-task.md); model/catalog/budget administration stays in [routing](references/model-routing.md). Load [runtime details](references/opencode-v2.md) only for migration/failure. Ordinary tasks skip setup/administration.

From consumer root: `bash skills/skills/opencode-executor/scripts/execute-plan.sh`; elsewhere `--project path`. `--check` is read-only without inference. Legacy CLI overrides profile; routed mode rejects overrides. xhigh requires user request and `--allow-xhigh`.

Runner injects execution/report contracts and selected constraints once, stable content before task data. Keep supervisor/setup/account context outside the handoff. Reuse valid evidence; repeat successful checks only for changed inputs/concrete concerns. External router alone owns one configured safe technical Free-to-Go fallback.

Await existing pending/waiting commands under supervision. At completion assess compact report, acceptance and relevant changed paths once. PARTIAL/BLOCKED/invalid needs concrete triage. Recovery cannot override a written report or failed CLI. Briefly report result, verification and limits.
