# Optional architecture decisions

Read only for material interface/data/concurrency/migration/security/technology decisions. Inspect current boundaries/tests first. KISS/YAGNI: smallest sufficient change; no pattern tourism, universal framework scan or speculative abstraction.

Design by Contract: affected inputs/outputs/invariants/failure semantics. A short Nygard ADR (context, decision, consequences) requires a durable actual decision; diagrams require usefulness. Compare alternatives/official sources only for necessary new technology choices, not routine edits. Thin Vertical Slice bounds implementation while retaining end-to-end value.

Accidental legacy behavior need not be frozen. A demonstrably false approved-plan assumption blocks: explain evidence/required decision, never silently redesign. Destructive migrations/external actions require user authorization.
