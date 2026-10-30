# Cost-efficient prompts

One reusable [skill](SKILL.md) for economical prompt execution: minimal relevant context, semantic compression, Progressive Disclosure, scoped context reuse, deduplication, model routing, budgets and quota checks. The executor transports the consumer's task and rules. Product behavior, specialist skills, architecture, language/toolchain and check commands stay in that project.

## Connect a project

Clone this repository beside the consumer, then run from the consumer Git root:

```sh
node ../skills/scripts/connect-project.mjs
```

Creates only relative consumer links: `./skills -> ../skills` and `.agents/skills/cost-efficient-prompts -> ../../skills`. Existing project files, instructions, profiles and project-owned skills are preserved; conflicts stop setup. Reconnection removes only old discovery aliases with the former library-link format. No Home skill installation, imported catalogue or private source checkout is needed. The library itself contains no symlinks.

Manual loading: create the absent root link with `ln -s ../skills skills` and add `For economical prompt execution, read skills/SKILL.md; project rules remain authoritative.` to consumer AGENTS.md. A root link alone does not guarantee host discovery; the helper supplies that separately. The selected skill can complete first setup with `node skills/scripts/connect-project.mjs`. Elsewhere use `--project /path/to/consumer`.

**Explicit first connection authorizes metadata-only OpenCode catalog capture**, even if another project initialized the global catalog. Success writes consumer-local `.agents/skills-setup.json`; failure leaves retryable links. Later connections skip capture. No inference, quality guesses, model approval or spending authorization; new combinations remain unassessed. This updates routing metadata, not OpenCode itself/cache. [Catalog maintenance](skills/opencode-executor/references/catalog-update.md) owns further explicit updates; missing/stale data never authorizes refresh.

The helper appends ignores for `/skills`, `/artifacts/opencode/`, `/.agents/skills-setup.json`. Generated links derive from the actual checkout; cloning/moving the sibling layout keeps them portable. CI provisions its own runtime state. Runner dependencies: Bash, Git, Node.js 18+ and supported OpenCode; account adapters document optional tools. No credentials/account state are distributed.

## Delegate only when economical

Direct work needs no executor profile. For delegation create secret-free consumer `.agents/executor.json`:

```json
{"model":"your-provider/your-model","effort":"medium","instructions":["AGENTS.md"]}
```

List exact existing consumer Markdown constraints; resolve applicable ancestor/nested rules explicitly through project-owned files. Empty instructions only when the plan supplies all constraints. Domain skills live under consumer `.agents/skills/`; this library never creates them. Invalid fields/traversal/external profile links fail closed. Model/effort choices stay local; names grant no approval.

Create Ready `.agents/PLAN.md` from the [task template](skills/opencode-executor/references/plan-template.md), then:

```sh
bash skills/skills/opencode-executor/scripts/execute-plan.sh --check
bash skills/skills/opencode-executor/scripts/execute-plan.sh
```

`--check` is read-only without inference. xhigh requires explicit authorization and `--allow-xhigh`. Stable selected constraints are injected once before changing task data. Current report: `.agents/IMPLEMENTATION_REPORT.md`; scratch/logs: consumer `artifacts/opencode/`. Preserve accounting/audit state. Enabled routing alone owns one verified safe technical fallback; never retry work with unknown effects.

Administration only: [model routing/budgets](skills/opencode-executor/references/model-routing.md), [V1/V2 runtime](skills/opencode-executor/references/opencode-v2.md), [usage](skills/llm-usage/SKILL.md), [shared OpenCode credits](skills/opencode-executor/references/credits.md). Keep checkout-local `credits.json`, `.env`, locks and `.quota-prompt.json` ignored. Independent clones share neither reservations nor daily reminders. Account checks never replace fresh admission.

## Validate changes

Extending/maintaining this workflow uses the repository-only [maintenance skill](skills/skill-maintenance/SKILL.md). It requires a final whole-context pass for intelligent routing, lossless semantic compression, Progressive Disclosure, context-sensitive caching and consistent deduplication. It is not added to consumer discovery.

```sh
bash scripts/check.sh
```

Isolated fake CLIs cover a fresh Git clone elsewhere, relative consumer links, first setup, instruction deduplication/cache invalidation, exact variants, budgets, usage and failure recovery. No real inference/network/credentials. Word/byte reductions prove neither token savings nor quality equivalence; measurements and representative acceptance tasks are required for such claims. No paid evaluation implied.
