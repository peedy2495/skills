# Routed task contract

Read for enabled-routing planning; keep this reference/catalog out of executor prompt. Codex owns domain plan, task features, acceptance/final delta supervision; deterministic router owns model/variant selection/budget admission. No routine price/provider ranking, refresh or model overrides.

Beside Ready plan, create `.agents/executor-task.json` with exactly:

```json
{"schema_version":1,"task_id":"unique-work-package-id","operations":["implementation"],"complexity":1,"risk":1,"validation":3,"context_tokens":8000,"output_tokens":2000,"estimated_tokens":{"input":20000,"output":4000,"cache_read":0,"cache_write":0},"phase":"implementation"}
```

Numbers illustrate schema, not recommended budgets/measured tokens. Derive needs from actual scope/evidence, never word-to-token equivalence or assumed cache hits. `context_tokens`: required input/context capacity; `output_tokens`: one-response capacity. `estimated_tokens`: whole autonomous execution, repeated requests/native checks/ordinary repairs included. Four disjoint categories; output includes reasoning. Record uncertainty; estimate conservatively.

- `operations`: one or more `implementation`, `debugging`, `refactoring`; no language/framework routing.
- `complexity`, `risk`: 0–3 (lowest–highest), grounded in dependencies/uncertainty and consequences/reversibility.
- `validation`: 0 (weak/unavailable evidence)–3 (strong native acceptance checks).
- `phase`: `implementation`, `repair`, `validation`, `specialist`; authorized work, never model preference/reserve bypass.
- `task_id`: unique approved work package; fallback retains ID. Terminal failure requires deliberate supervisor replan/new ID, never automatic ID/retry loops.

Use existing runner without `--model`/`--effort`. `--check`: eligibility/budget preview, no model discovery/ledger writes/inference. xhigh still requires user request in plan and `--allow-xhigh`.

Runner alone owns the legacy no-fallback exception: one budgeted Free-to-default_go restart after verified technical rejection before any model step, unchanged workspace/report. Any step/tool/text, ambiguous error, unsafe state or insufficient budget returns to Codex for domain evaluation. No executor retry; report schema/focused final review unchanged.

Enabled `waiting_for_credits` keeps existing command/task pending until earliest relevant reset and successful fresh admission. Await per [supervision.md](supervision.md); never finish solely for waiting, invent IDs to bypass reservations or choose models.

Administration only: [model-routing.md](model-routing.md) for catalog/strategy/budget setup or explicit updates. Missing/stale catalog blocks; never implies update authorization.
