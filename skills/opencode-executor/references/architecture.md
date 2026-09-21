# Optional architecture decisions

Load only for material interface, data, concurrency, migration, security or technology decisions. Inspect current boundaries and tests first. KISS/YAGNI: choose the smallest change that meets the task; no pattern tourism, universal framework scan or speculative abstraction.

Use Design by Contract for affected inputs/outputs/invariants/failure semantics. Use a short Nygard ADR (context, decision, consequences) only for a durable actual decision; a diagram only if useful. Compare alternatives and official sources when a new technology choice is necessary, not for routine edits. Thin Vertical Slice can bound implementation while retaining end-to-end value.

Do not freeze accidental legacy behavior, but a demonstrably false approved-plan assumption is a blocker: explain evidence and required decision rather than redesigning silently. User authorization governs destructive migrations and external actions.
