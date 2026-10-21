# Admission, execution and recovery

Read for execution/fallback/audit changes or recovery; [model-routing.md](model-routing.md) owns selection/policy.

Selector, reservations, fallback counter and single-use start entitlement share one locked ledger transaction; claim before inference. Decisions bind task/plan/catalog/strategy/budget/workspace snapshots. One consumer Git root owns ledger/canonical plan/report; reject concurrent managed workspace writers. Ledger lock also serializes independent admissions. Local-filesystem coordination only, not distributed multi-host/worktree accounting.

Persist `artifacts/opencode/budget/state.json`. Exclusive read-only `artifacts/opencode/runs/<run_id>/decision.json`/`outcome.json` provide reproducible application audit; decision hashes never change during settlement. Owning OS user can still tamper. Reject reused task IDs/double entitlement claims.

CLI 1.18.31 adapter recognizes only structured retryable APIError HTTP 429/500/502/503/504. Free-to-default_go fallback additionally requires complete error-only stream (no step-start/text/tool/unknown events), unchanged tracked/untracked/index/HEAD snapshot and untouched current report placeholder. Even read-only tools disqualify: completed-tool events cannot prove no pending tool. Never classify stderr wording. Unsafe/unknown/functional/Go-first failures return to supervision, no automatic retry.

Before fallback recheck task identity/eligibility/all budgets, open unknown usage/protected reserves included. Atomically commit sole fallback slot with second reservation; interruptions never replenish it. Invocation retains implementation/report logic, exact variant, restrictive Task permission, disabled automatic title/summary/compaction calls and existing permissions. Executor never delegates/switches models; parent returns final outcome/compact fallback evidence without AI decision.

Known-version step-finish token categories sum once per event-part ID; output includes reasoning. Partial/missing/inconsistent/unsupported-version usage stays unknown/reserved. Estimate credits from admitted rates. Failure events/stderr private/local; remove successful raw logs after settlement. No new report sections.

Interruptions retain reservations/workspace/transaction locks. Never steal timed-out locks, auto-reset periods or delete ledger. Before explicit recovery verify no process/external action remains active, preserve records, reconcile actual/unknown spend. New period needs deliberate archival/reconciliation; merely changing ID fails closed. Host/provider restrictions still govern. Runtime overrides are neither process sandbox nor proof of ambient-plugin safety; never enable automatic fallback with untrusted behavior.
