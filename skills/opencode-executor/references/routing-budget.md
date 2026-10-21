# Project routing budgets

Read for budget setup/admission failures; [model-routing.md](model-routing.md) owns policy/catalog setup. `.agents/budget.json` is independent of strategy/catalog. Schema example, never spending advice:

```json
{
  "schema_version":1,"period":"project-period-id","credit_unit":"microUSD","enforcement":"estimated",
  "project":{"tokens":1000000,"credits":10000000},
  "per_run":{"tokens":100000,"credits":1000000},
  "phases":{
    "implementation":{"tokens":600000,"credits":6000000},
    "fallback":{"tokens":100000,"credits":1000000},
    "repair":{"tokens":100000,"credits":1000000},
    "validation":{"tokens":100000,"credits":1000000},
    "specialist":{"tokens":100000,"credits":1000000}
  },
  "reserves":{"repair":{"tokens":100000,"credits":1000000},"validation":{"tokens":100000,"credits":1000000}},
  "specialist_limits":[]
}
```

Project/phase caps accumulate per period; `per_run` caps each reservation. Specialist phase also requires exact `{"model":"provider/id","variant":null,"limit":{"tokens":100000,"credits":1000000}}` in `specialist_limits`, cumulative per combination.

Reserve whole estimated execution × `reserve_multiplier`. Unspent repair/validation reserves exclude implementation/fallback/specialist starts. Each protected phase may spend its own reserve while preserving the other. Free consumes token caps. Unknown usage retains reservations per unit. Rates/credits need a common explicit unit; updater converts CLI USD/million to integer microUSD. Estimates prove neither charged credits, Go balance nor provider invoice. OpenCode events exclude supervisor/other-tool spend.

Only `enforcement=estimated` works: reservations technically gate managed starts, never cap individual requests/stop in-flight spend. Overruns reduce later availability. Hard enforcement fails closed pending a proven adapter. Phase reserves cannot make an autonomous model postpone spending until testing.

Optional [shared credits](credits.md) adds account checks, never replaces project limits. Recovery/period changes require [routing-safety.md](routing-safety.md); no automatic ledger reset.
