# Coding skills

A shared, application-independent reference for coding agents. Token economy is a design constraint: precise routing, semantic anchors with explicit local contracts, one autonomous executor run, event/delta supervision and one focused quality check. No language, framework, UI, provider or model is mandated.

## Skills

- `skills/opencode-executor`: substantial implementation and authorized delivery; small changes and workflow maintenance stay direct. Optional testing, UI and architecture references load only for relevant work.
- `skills/skill-maintenance`: explicit skill/workflow changes; not ordinary feature implementation.

Project behavior, languages/versions, CI commands and credentials do not belong here. Use existing project tools. Runner dependencies are Bash, Git, Node.js (18+) and OpenCode; these do not constrain implementation languages. Library tests need no OpenCode service, network or model credentials.

## Connect a project

Keep this checkout alongside consuming repositories. From a consuming Git root with no existing skill at the destination:

```sh
mkdir -p .agents/skills
ln -s ../../../skills/skills/opencode-executor .agents/skills/opencode-executor
```

The example target is relative to `.agents/skills/`; adjust for your layout. Do not overwrite an existing skill without reviewing/backing up local changes. A relative link is one reference, not a second source copy. Symlink-capable checkout/filesystem is required; tools must be allowed to read the shared checkout. No automatic permission bypass or implicit download. For portable CI/reproducibility, provision the shared checkout at an agreed revision before running consumers; missing links fail clearly. Ordinary application builds need not load these skills.

Create `.agents/executor.json` (no secrets):

```json
{"model":"your-provider/your-model","effort":"medium","instructions":["AGENTS.md"]}
```

List exact existing Markdown constraint files within the consumer. Applicable nested/ancestor rules must be resolved by the supervisor and included explicitly in local instructions/plan. Unknown fields, traversal, external symlinks and invalid profiles fail closed. A profile with an explicit `instructions` list is required even with CLI model selection; use an empty list only when the plan already supplies all applicable project constraints. Model can be selected using `--model`; no provider fallback. Host/user authorization applies to model changes; the script cannot infer approval from a string. Keep secrets in normal project credential mechanisms, never in this profile.

Add one routing line to the consumer AGENTS.md: use `.agents/skills/opencode-executor/SKILL.md` for substantial delegated coding/delivery; direct work for trivial changes/workflow maintenance. Keep local product invariants and required test/build commands in that AGENTS.md. Do not duplicate generic rules.

Create a Ready `.agents/PLAN.md` from the shared template. Under Relevant Instructions use exact project-visible skill/reference paths, e.g. `.agents/skills/opencode-executor/references/testing.md`; add `ui.md` only for UI work. The runner injects core contracts and profile instructions automatically. The report belongs to the consumer at `.agents/IMPLEMENTATION_REPORT.md`.

```sh
bash .agents/skills/opencode-executor/scripts/execute-plan.sh --check
bash .agents/skills/opencode-executor/scripts/execute-plan.sh
```

From another directory supply `--project /path/to/consumer`. CLI model/effort overrides profile values; `xhigh` additionally needs explicit authorization and `--allow-xhigh`. Ignore `artifacts/opencode/` in the consumer. Logs/temp files stay there, not in this shared checkout. Keep stable instruction sources before task content; never inject a supervisor transcript/catalog. Report schemas/recovery and nonzero CLI failures are validated; no retries or model fallback.

## Language and interface routing

A Python service uses its Python toolchain; a Rust CLI uses its Rust toolchain; mixed-language changes check affected boundaries. Web/desktop/mobile/terminal UI changes may load the optional UI reference; headless tasks skip it. No automatic new libraries, browser suite, TDD skill cascade or full technology scan. Existing required project gates remain authoritative.

## Validate changes

```sh
bash scripts/check.sh
```

Tests use isolated external consuming repositories, linked skills and a fake CLI. They exercise selected instructions, model/effort forwarding, failure isolation and report recovery. Word/byte reduction is not model quality evidence. Before claiming behavioral equivalence, compare representative implementation/bugfix/delivery tasks with identical model/budget and objective acceptance checks. No paid model A/B run is implied by library validation.

Semantic anchors name methods; explicit contracts carry operational constraints. Sources: [Semantic Anchors](https://llm-coding.github.io/Semantic-Anchors/) and [Semantic Contracts](https://llm-coding.github.io/Semantic-Anchors/contracts/). The library does not install or send their full catalog to agents.
