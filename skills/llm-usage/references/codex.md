# ChatGPT/Codex limits

From consumer root, with an installed, already signed-in Codex CLI:

```sh
node skills/skills/llm-usage/scripts/codex-usage.mjs
```

The helper reads `account/rateLimits/read` through a short-lived local app server; no thread/turn/model call or reset-credit redemption. It emits normalized buckets, suppresses raw account errors and stops. Missing CLI/authentication, unsupported schema, expired windows or timeout: `status=unavailable`, exit 75; apply the skill's daily fallback. Never inspect/copy CLI credentials.

Keep each returned bucket separate. `codex` describes that CLI account's Codex allowance, not every ChatGPT web-model limit or OpenAI API balance. Optional workspace credits retain provider units, not assumed USD. Missing ChatGPT scopes require the visible account view or manual fallback. Token-activity summaries do not establish remaining allowance; private web-session endpoints are unsupported here.

Documentation checked 2026-10-30: [App Server account limits](https://learn.chatgpt.com/docs/app-server), [usage dashboard/windows](https://learn.chatgpt.com/docs/pricing). Interfaces and account coverage may change; helper behavior is defined in [codex-usage.mjs](../scripts/codex-usage.mjs), not inferred from model answers.
