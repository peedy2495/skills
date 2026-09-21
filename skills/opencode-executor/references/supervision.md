# Local contract: event-driven supervision

This contract governs Codex, not the executor. Event-Driven Architecture is only the conceptual anchor; these wake-up conditions remain explicit.

Analyze a NEW completion, failure, blocker, input request, test/build/compile error, unexpected plan change, safety-critical/destructive operation, or predefined milestone completion. Running/busy/testing/executing and wait timeouts are not decision events. Ordinary errors remain with the executor; intervene after independent failed repairs, conflicting requirements, architecture change, unexpected risk or required human input. Existing authorization persists.

Prefer completion notifications/event-driven waits. Do not tail event logs or invoke the model simply to confirm activity. If monitoring is necessary, filter outside the model: retain an invocation-specific event ID/sequence/byte cursor, consume only new complete records, buffer partial records, deduplicate state/error fingerprints, batch relevant deltas. Reset cursors for a new invocation. No relevant delta means no model-facing payload. Use the longest host-permitted wait; host communication/tool limits take precedence without implying new progress.

Status example: `phase=browser_tests state=completed tests=28 failed=0`. Keep raw logs local; return bounded new failure excerpts only. Never reprocess full transcripts, unchanged files or known results. Do not expose secrets.

No activity prose. Supervisor does not continuously inspect/rewrite executor checkboxes. Use the skill's Definition of Done once at completion. Ask only: has a new event occurred that needs a decision?
