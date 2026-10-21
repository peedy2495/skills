# Goal

Ready: exact observable end state in a few sentences.

# Relevant Instructions

Only necessary task-specific skills/references, exact paths. Stable/minimal list; executor sorts paths for a reusable prompt prefix. Use `none` if plan supplies all constraints.

- `.agents/skills/.../SKILL.md`

Project-wide Markdown rules come from profile; do not repeat them here. Record applicable nested instructions explicitly.

# Context

- Relevant files/symbols/current behavior.
- Preserve dirty/staged/untracked user work, if any.
- Material constraints, risks, baseline failures.

Task-local only; no unrelated product requirements.

# Implementation

- [ ] `path/to/file`: concrete change and intended behavior.
- [ ] `path/to/file`: concrete change and intended behavior.

Specify interfaces/types/state/persistence only when constraining implementation. Local details without architecture/public-contract impact may be left to executor.

# Milestones

Decision-relevant completion events warranting supervisor attention, or `none`. Running/testing are not milestones; executor owns routine repairs.

# Verification

Meaningful checks only, in order. Executor owns ordinary repair/reruns in the same execution; one focused supervisor review afterward, no automatic test reruns.

- [ ] Smallest check/test proving changed behavior.
- [ ] Broader build/test only for scope/risk, never "just in case".
- [ ] `git diff --check` when applicable.
- [ ] Self-review actual changes against plan; preserve unrelated user work.

# Acceptance Criteria — Given–When–Then where useful

- [ ] Concrete observable requirement.
- [ ] Relevant checks pass or documented baseline exceptions remain unchanged.
- [ ] `.agents/IMPLEMENTATION_REPORT.md`: actual status, verification, deviations, blockers.

# Progress — Hemingway Bridge

Check completed steps immediately. Record concise verification/next unfinished action before long checks/interruption; preserve evidence on continuation.

# Out of Scope

Only important boundaries otherwise mistaken for task scope.

# Optional Architecture Detail

Include only for cross-cutting architecture, persistence/migration, security/concurrency boundaries or materially different implementation choices.

- Required interfaces/contracts/ownership.
- Data/control flow; lifecycle/cancellation.
- Error/rollback/persistence behavior.
- Chosen design/materially rejected alternatives.
