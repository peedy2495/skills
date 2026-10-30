---
name: llm-usage
description: Read-only ChatGPT/Codex and OpenCode quota checks on explicit request or the consumer's first working turn each day. Exclude model-catalog and spending-policy changes.
---

# Available LLM quotas

Read only requested/required account routes: [ChatGPT/Codex](references/codex.md), [OpenCode](references/opencode.md); [OpenAI API organization](references/api-organization.md) only if that separate account is explicitly in scope. Prefer read-only APIs; no inference, credential inspection, login, purchases or settings changes.

For unavailable required values, bundle one question. Immediately before asking, run from consumer root:

```sh
node skills/skills/llm-usage/scripts/daily-prompt.mjs claim --timezone Europe/Berlin
```

Use the user's IANA timezone (omit flag only if host timezone matches). Ask only on `ask=true`: at most once per local calendar day across this checkout, including unanswered attempts. A refresh request may refresh APIs; another same-day question needs an explicit request to ask again. No background scheduler.

Report source/time/scope, returned quota windows, remaining percentages and directly reported balances in provider units. Failed/stale/missing values stay unknown; costs/token statistics imply no remaining balance or daily allowance. Shared `.quota-prompt.json` stores only reminder date/timezone/instant; keep any saved manual values consumer-local and ignored. These checks grant no spending/model approval and never replace fresh executor admission/claim checks.
