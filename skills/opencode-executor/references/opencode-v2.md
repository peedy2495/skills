# OpenCode runtime adapters

Read for runtime migration/configuration/troubleshooting only; never inject into executor handoffs. Supervisor/executor contracts, native project checks, deterministic routing and budgets remain authoritative.

## Native V2 execution

Supported adapter releases: **2.2.2 and 2.2.3**. Runner probes `opencode --version` once before starts/report writes; other V2 releases/majors fail closed pending explicit adapter verification. V1 invocation remains compatible; structured usage/fallback support is limited to 1.18.31. `--check` stays offline: local prerequisites only, no version/credentials/service/model validation.

V2 invocation: `opencode run --standalone --agent build --model provider/model#variant --title Executor --format json`, exact handoff on stdin. Base combination omits `#variant`; configured base/agent settings remain fingerprint-bound. Explicit selection avoids root-model variant loss. No session reuse/continue, shared background-service attachment, `--auto` or permission bypass.

Use V2's existing client/server implementation: authenticated private server on an ephemeral port, process-owned stdin lease, event subscription, native session wait and persisted-message reconciliation. Client death closes the lease; native signal handling interrupts the session. No duplicate server lifecycle, SDK dependency, AI polling or auxiliary review service. Private process does not isolate credentials, database, workspace or external effects; interrupted reservations/locks require existing recovery procedures.

Native overlay preserves restrictions, appends build permission/policy denies for `subagent` and `experimental_image_generate`, disables `title`/`summary`/`compaction` agents, automatic compaction and warming keep-alive requests. Reject mixed legacy inline `agent`/`permission`/`small_model`/`tools` fields before admission; migrate user configuration explicitly rather than silently discarding restrictions. Managed policies/configuration and trusted plugins remain host authority; an overlay is no sandbox or proof against arbitrary plugin behavior.

Force both `OPENCODE_CONFIG_PROJECT_DISABLE=1` and legacy `OPENCODE_DISABLE_PROJECT_CONFIG=1`: V2's newer flag takes precedence. Disable automatic model metadata fetching. Selected project constraints already arrive in the handoff. Global/explicit/managed instructions and plugin behavior may remain; never infer full ambient-context isolation.

## Events and compatibility

Usage accepts one V2 `sessionID`, deduplicates completed steps, includes reasoning tokens. V2 normalizes missing provider usage to zero: any all-zero step leaves usage unknown/reserved. CLI `cost` may be a catalog calculation, not an invoice; credits remain estimated from admitted rates. Outcome retains session ID, bounded typed error and supplied retry delay; no error text/response bodies in compact records.

Automatic Free-to-Go restart requires [routing-safety.md](routing-safety.md): complete technical error-only stream, unchanged workspace/report, atomic fallback entitlement and protected budgets. Typed quota/authentication/timeout/unknown failures never trigger replay. Native CLI may retry the same provider request internally; router still starts at most two invocations and never changes an active invocation's selection. Project budgets are admission estimates, not provider-enforced token/credit caps.

Recovery accepts only the final assistant message, including multiple native text parts; reject mixed sessions/conflicting parts/tool text. Written report and nonzero CLI exit retain authority. Native session reconciliation supplements this existing contract; it grants no automatic session continuation.

Normal routing reads stored JSON, compares catalog configuration/runtime binding and never discovers models. Migration does not refresh catalogs or grant approvals. Old CLI/config fingerprints block routed starts until a separately requested compatible catalog update. V2 metadata commands/retained assessment rules: [catalog-update.md](catalog-update.md).

## Verified interfaces

Public release sources: [native run](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/cli/src/run/run.ts), [event wait/reconciliation](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/cli/src/run/noninteractive.ts), [server lease](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/cli/src/services/standalone.ts), [environment binding](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/cli/src/server-process.ts), [usage normalization](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/core/src/session/usage.ts), [model schema](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/schema/src/model.ts). [V2 CLI documentation](https://opencode.ai/v2/docs/cli/) describes standalone/service modes.

Library verification uses isolated fake CLIs and exact release contracts, never real inference. It establishes runner behavior, not model quality, actual provider accounting or arbitrary plugin safety.

2.2.3 compatibility: installed `opencode v2.2.3` and native `run/models/api --help` inspected on 2026-10-30; the required standalone, `provider/model#variant`, agent, JSON and API-operation interfaces remain advertised. Version-specific fingerprints keep 2.2.2 curation from silently carrying across the upgrade. Isolated fake-CLI tests cover metadata/schema validation and execution contracts for both accepted releases. Public 2.2.3 release source was unavailable during this check; CLI help plus fakes do not prove native server internals, real inference behavior or provider-account correctness. Runtime errors still fail through existing gates; never expand support to all 2.x from a major version alone.
