---
name: skill-maintenance
description: Maintain shared and project-local coding skills, routing and execution contracts when explicitly requested. Keep task history and application behavior out of reusable instructions.
---

# Skill maintenance

Use only for explicit instruction/workflow maintenance, not as a side effect of feature work. Perform directly; use the executor skill only to understand its interfaces when changing that workflow.

Progressive Disclosure: keep discovery metadata precise and the entrypoint small. Route only materially relevant references; no load-all rules or reference catalogs. Create a separate skill only for recurring distinct work, not each language or transient feature.

SSOT/DRY: one normative source per rule, shared runner not copied scripts. Application behavior, toolchain commands, model choices and user language belong to consumer profiles/instructions. Current implementation/tests establish behavior; history resolves concrete uncertainty, not default requirements. Do not maintain appended context diaries or snapshots as active guidance.

When creating or revising shared or project-local skills, prefer established semantic anchors wherever they meaningfully shorten instructions without ambiguity or loss of required behavior. Keep project-specific rules, safety/authorization boundaries, verifiable requirements, events, paths and machine schemas explicit. Prefer removing/narrowing overlapping instructions. KISS/YAGNI is not authority to discard safeguards. Use Definition of Done for completion, Hemingway Bridge for resumable task state, BLUF for reports. Explain a new anchor briefly when ambiguous; do not inject an external catalog or assume all models interpret it identically.

Keep stable prompt content before dynamic task data, sorted deterministically. Do not load irrelevant text merely for cache hits; fewer calls and less context take priority. Host communication/tool requirements still apply.

Validate actual script behavior with isolated fakes, not real paid model calls by default. Check consumer compatibility, exact instruction delivery, failure/status semantics and scope. Compare word/byte counts separately from model quality. For quality claims evaluate representative tasks on the selected model with identical budgets and objective acceptance checks; do not mistake a shorter prompt for proven equivalence. Update documentation only for material setup/contract changes, not every edit.
