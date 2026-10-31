# ChatGPT/Codex limits

From consumer root, with an installed, already signed-in Codex CLI:

```sh
node skills/skills/llm-usage/scripts/codex-usage.mjs
```

The helper reads `account/rateLimits/read` through a short-lived local app server; no thread/turn/model call or reset-credit redemption. It emits normalized buckets, suppresses raw account errors and stops. Missing CLI/authentication, unsupported schema, expired windows or timeout: `status=unavailable`, exit 75. Keep values unknown; no manual quota maintenance. Never inspect/copy CLI credentials. The shared pool stores one dated account observation for all projects; it does not manufacture per-project Codex balances or reserve host-owned Codex turns.

Keep each returned bucket separate. `codex` describes that CLI account's Codex allowance, not every ChatGPT web-model limit or OpenAI API balance. Optional workspace credits retain provider units, not assumed USD. Missing ChatGPT scopes remain unavailable. Token-activity summaries do not establish remaining allowance; private web-session endpoints are unsupported here.

Documentation checked 2026-10-30: [App Server account limits](https://learn.chatgpt.com/docs/app-server), [usage dashboard/windows](https://learn.chatgpt.com/docs/pricing). Interfaces and account coverage may change; helper behavior is defined in [codex-usage.mjs](../scripts/codex-usage.mjs), not inferred from model answers.
