# Coding skills

Shared, application-independent coding guidance. Token economy: precise routing, semantic anchors with explicit contracts, one autonomous executor run, event/delta supervision, one focused quality check. No mandated language/framework/UI/provider/model.

## Skills

- `skills/opencode-executor`: substantial implementation/authorized delivery; trivial changes/workflow maintenance stay direct. Testing/UI/architecture references load only when relevant.
- `skills/skill-maintenance`: explicit skill/workflow changes, not ordinary features.

Product behavior, languages/versions, CI commands and credentials stay in consumers. Reuse project tools. Runner requires Bash/Git/Node.js 18+/OpenCode, without constraining product languages. Library tests need no OpenCode service/network/credentials.

## Connect a project

Keep checkout beside consuming repositories. From consumer Git root, only if destination is absent:

```sh
mkdir -p .agents/skills
ln -s ../../../skills/skills/opencode-executor .agents/skills/opencode-executor
```

Target is relative to `.agents/skills/`; adapt to layout. Review/back up local changes before replacing an existing skill. Relative symlink preserves one source; checkout/filesystem must support symlinks and tools must have read permission. No permission bypass/implicit download. For portable, reproducible CI, provision shared checkout at agreed revision; missing links fail clearly. Ordinary app builds need not load skills.

Create secret-free `.agents/executor.json`:

```json
{"model":"your-provider/your-model","effort":"medium","instructions":["AGENTS.md"]}
```

List exact existing consumer Markdown constraints. Supervisor resolves applicable nested/ancestor rules and explicitly includes them in local instructions/plan. Unknown fields/traversal/external symlinks/invalid profiles fail closed. Explicit `instructions` list is required even with CLI model selection; empty only if plan supplies all project constraints. `--model` selects a model without provider fallback; host/user authorization governs changes, never inferred from a string. Use normal credential mechanisms, never profile secrets.

Add one consumer AGENTS.md routing line: `.agents/skills/opencode-executor/SKILL.md` for substantial delegated coding/delivery; trivial/workflow changes direct. Keep product invariants/test/build commands there; no generic-rule duplication.

Create Ready `.agents/PLAN.md` from shared template. Relevant Instructions: exact project-visible paths, e.g. `.agents/skills/opencode-executor/references/testing.md`; `ui.md` only for UI. Runner injects core contracts/profile instructions. Report: consumer `.agents/IMPLEMENTATION_REPORT.md`.

```sh
bash .agents/skills/opencode-executor/scripts/execute-plan.sh --check
bash .agents/skills/opencode-executor/scripts/execute-plan.sh
```

Elsewhere add `--project /path/to/consumer`. Legacy CLI model/effort overrides profile; `xhigh` also requires explicit authorization/`--allow-xhigh`. Ignore consumer `artifacts/opencode/`; logs/temp files stay there. Stable instructions precede task data; never inject supervisor transcript/catalog. Report schema/recovery/nonzero CLI failures are validated; legacy never retries/falls back.

Opt-in [deterministic routing](skills/opencode-executor/references/model-routing.md): global installation catalog holds general model/variant metadata; approvals/strategy/budgets/usage stay project-local. Legacy catalogs remain supported; disabled routing preserves consumers. Codex supplies [task features](skills/opencode-executor/references/routing-task.md); runner chooses exact model/variant and atomically admits starts. Qualified Free precedes default_go; one budgeted Go restart requires proven safe technical Free failure. Normal routing never discovers/updates models; explicit updates use installed CLI candidates/variants/prices and cited publications for assessments. Fingerprint incompatibility blocks, never refreshes. Preserve persistent budget/audit state separately from temporary logs.

Optional shared [billing/Go-volume pool](skills/opencode-executor/references/credits.md): embed same checkout at `./skills`; ignore `/skills/` in consumer `.gitignore`. Fresh destination: `ln -s /path/to/shared/skills skills`; `.agents/skills/` skill link then targets `../../skills/skills/opencode-executor`. Consumer policy: `"credits":"skills/credits.json"`. Ignore checkout-local `credits.json`, `.env`, `credits.json.lock/`; templates contain no credentials. Independent clones do not share accounting. Shared file holds account telemetry/minimal reservations; approvals/task features/budgets/detailed logs stay local.

## Language and interface routing

Python service: Python toolchain; Rust CLI: Rust toolchain; mixed-language changes: affected boundaries. UI reference only for web/desktop/mobile/terminal interfaces; headless skips it. No automatic libraries/browser suite/TDD skill cascade/full technology scan. Required native gates remain authoritative.

## Validate changes

```sh
bash scripts/check.sh
```

Isolated external consumers/linked skills/fake CLI test selected instructions, model/effort forwarding, failure isolation and report recovery. Word/byte reductions prove no model quality. Behavioral-equivalence claims require representative implementation/bugfix/delivery tasks, identical model/budget, objective acceptance checks. Library validation authorizes no paid A/B calls.

Semantic anchors name methods; explicit contracts carry constraints. Sources: [Semantic Anchors](https://llm-coding.github.io/Semantic-Anchors/), [Semantic Contracts](https://llm-coding.github.io/Semantic-Anchors/contracts/). The library never installs/sends their full catalog to agents.
