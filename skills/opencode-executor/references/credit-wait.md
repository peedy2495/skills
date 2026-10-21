# Waiting for Go quota

Read for enabled reset waiting, wait diagnostics or recovery. Setup/account safety: [credits.md](credits.md); supervisor behavior: [supervision.md](supervision.md).

With `wait_for_reset=true`, evaluate future provider resets/known completed-reservation expiries. For each qualified, project-budgeted combination find earliest fit across **all three windows**, then earliest across combinations; multiple blocked windows may require last relevant reset. Add one-second boundary margin. Wake-up estimate guarantees no capacity: other clients may spend; fresh usage may require later reset.

Only otherwise admissible resettable volume shortages wait. Monetary/project/per-run/token caps imply no reset. Unknown API/auth failure, stale allowance evidence, unreconciled runs or protected reserves unable to fit after known resets block supervision. Evidence must remain valid through predicted reset; never auto-update, add emergency balance or reset budget period/task/fallback counter.

Emit one compact `state=waiting_for_credits` JSON event per new deadline; persist `artifacts/opencode/credit-wait.json`: `retry_at`, blocking windows, input/workspace/shared-config hashes, optional admitted `run_id`. Timer slices ≤60 seconds, interruptible; no provider polls before deadline. Release shared-credit/project-budget locks while waiting; retain runner workspace ownership lock. Codex awaits through host tools, never finishes solely for quota waiting; native wait/interaction limits prevail.

On wake, task/plan/catalog/policy/budget/config fingerprints and workspace must match. Admission reroutes/rechecks all budgets. Waiting claim retains original reservation/single-use entitlement/exact model/variant; never reroutes admitted run. Safe Free-to-Go fallback retains task/one-fallback limit while waiting. `released` means gate passed, not completed executor/report validation. Changed inputs → `blocked`, Codex reassesses.

In-flight exhaustion: Codex inspects compact report/delta/native checks/possible side effects; plans safe remaining work with new task ID. Next start uses same gates; never replay unknown effects. Unknown usage/reservations stay protected.

Wait lives in existing runner process: host/session must keep it alive. No persistent OS/cloud scheduler or waking closed app. Interruption leaves wait record/existing reservations/locks for explicit recovery. Never promise automatic wake-up without host support. [credits.md](credits.md) governs conservative held charges across resets.
