# Goal

Ready: state the exact observable end state in a few sentences.

# Relevant Instructions

List only task-specific skills/references the executor needs, using exact paths. Keep this list stable and minimal; the executor sorts paths before composing the handoff so identical skill sets form a reusable prompt prefix. Use `none` when the plan itself contains all required constraints.

- `.agents/skills/.../SKILL.md`

Project-wide Markdown constraints come from the consumer profile, not a repeated plan entry. Record applicable nested instructions explicitly.

# Context

- Relevant files/symbols and current behavior.
- Dirty/staged/untracked user work that must be preserved, if any.
- Material constraints, known risks and baseline failures.

Keep this section task-local; do not restate unrelated product requirements.

# Implementation

- [ ] `path/to/file`: concrete change and intended behavior.
- [ ] `path/to/file`: concrete change and intended behavior.

Name exact interfaces/types/state/persistence details only when they constrain the implementation. Local implementation details not affecting architecture/public contracts may be left to the executor.

# Milestones

List only decision-relevant completion events that justify supervisor attention, or `none`. Running/testing states are not milestones. Executor owns routine repairs without supervisor intervention.

# Verification

Run only checks meaningful for this change, in order. The executor owns ordinary repair and reruns within the same execution; reserve only one focused supervisor quality check afterward, not automatic test reruns.

- [ ] Smallest focused check/test that proves the changed behavior.
- [ ] Broader build/test only when scope or risk warrants it; avoid broad suites "just in case".
- [ ] `git diff --check` when applicable.
- [ ] Self-review actual changes against this plan and preserve unrelated user work.

# Acceptance Criteria — Given–When–Then where useful

- [ ] Concrete observable requirement.
- [ ] Relevant checks pass or documented baseline exceptions remain unchanged.
- [ ] `.agents/IMPLEMENTATION_REPORT.md` records actual status, verification, deviations and blockers.

# Progress — Hemingway Bridge

Update checked steps as soon as completed. Record concise verification results and the next unfinished action here before long checks or interruption; preserve this evidence on continuation.

# Out of Scope

List only important boundaries that could otherwise be mistaken as part of the task.

# Optional Architecture Detail

Include this section only when needed for cross-cutting architecture, persistence/migration semantics, security/concurrency boundaries, or materially different implementation choices.

- Required interfaces/contracts and ownership boundaries.
- Data/control flow and lifecycle/cancellation semantics.
- Error/rollback/persistence behavior.
- Chosen design and materially rejected alternatives.
