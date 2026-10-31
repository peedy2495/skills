---
name: llm-usage
description: Refresh shared Codex and OpenCode account observations before a work package or on quota requests. Provider balances are global across projects; never maintain per-project allowances or request manual quota values.
---

# Available LLM quotas

All consumers use the [shared configuration/pool](../../references/provider-pool.md). Before a direct work package, or for an explicit refresh, run from consumer root:

```sh
node skills/scripts/provider-status.mjs --refresh
```

Delegated work refreshes both observations automatically at admission/start; do not duplicate those requests. Cached status omits `--refresh` and never authorizes a start. No model calls, credential inspection/copying, login, purchases or account-setting changes. Missing APIs/authentication/schema return unavailable, never a manual balance question or invented zero.

Keep provider accounts/units separate. Report dated source, returned windows and directly reported balances only. Provider usage already includes other projects/clients; shared reservations conservatively protect managed pending work. Projects receive no additional balance. Unknown/stale data stays unknown; statistics/prices imply no remaining allowance.

Load adapters only for setup/failure: [Codex](references/codex.md), [OpenCode](references/opencode.md). [OpenAI API organization](references/api-organization.md) is a separate account, only when explicitly requested. These observations grant no extra spending and never replace atomic admission/claim checks. Codex host requests are outside this runner's reservation control; provider-reported account limits remain authoritative.
