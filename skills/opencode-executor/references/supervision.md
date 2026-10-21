# Local contract: event-driven supervision

Governs Codex, not executor. Event-Driven Architecture is an anchor; explicit wake-up conditions follow.

Analyze NEW completion, failure, blocker, input request, test/build/compile error, unexpected plan change, safety-critical/destructive operation or predefined milestone completion. Running/busy/testing/executing and wait timeouts require no decision. Executor owns ordinary errors; intervene for failed independent repairs, conflicting requirements, architecture change, unexpected risk or required human input. Existing authorization persists.

Prefer completion notifications/event-driven waits. Never tail logs/invoke AI merely to confirm activity. If monitoring is necessary, filter outside AI: invocation-specific event ID/sequence/byte cursor, new complete records only, buffer partials, deduplicate state/error fingerprints, batch relevant deltas. Reset cursor per invocation. No relevant delta: no model payload. Longest host-permitted wait; communication/tool limits prevail without implying progress.

Example: `phase=browser_tests state=completed tests=28 failed=0`. Raw logs local; bounded new failure excerpts only. Never reprocess full transcripts, unchanged files or known results; never expose secrets.

Configured router owns safe technical Free-to-Go fallback, returning one final outcome/bounded audit. Codex neither selects models nor refreshes catalog. Unsafe/unknown/terminal failures need domain evaluation, never unchanged retry.

`state=waiting_for_credits` is a pending start. With reset waiting enabled, keep authorized task active; await existing runner via host tools, resuming on completion/new concrete blocker without asking user to resubmit. No repeated AI checks/API polling during timer. At predicted reset router refreshes all windows, rechecks eligibility/budgets/unchanged inputs/execution state; later resets may require further waiting. Monetary caps/missing evidence/unknown side effects need triage. In-flight quota failure: inspect delta/report/side effects, plan safe remaining work with new task ID; never blind restart. Host/session lifetime bounds continuation. Configure in [credits.md](credits.md); inspect [credit-wait.md](credit-wait.md) for wait/recovery details only when needed.

No activity prose/continuous checkbox inspection or rewriting. Apply skill's Definition of Done once at completion. Decision test: has a new event occurred requiring a decision?
