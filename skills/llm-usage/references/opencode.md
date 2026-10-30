# OpenCode quota/balance

From consumer root, with the existing shared Go adapter configured:

```sh
node skills/skills/opencode-executor/scripts/credits.mjs status skills/credits.json --refresh
```

Returns observed Go rolling/weekly/monthly usage/reset windows; remaining percentage is `100 - percent`, not a wallet balance. Missing configuration/API failure: daily fallback per the skill. Do not enable spending gates or invent allowance conversions just to query status. Account binding and credential setup only: [credits](../../opencode-executor/references/credits.md); only its script may read `.env`, never the agent or shell-source.

For missing wallet/plan values, use a connected read-only account tool or [Billing view](https://opencode.ai/v2/docs/console/billing/), subject to account role. The documented [Console API](https://opencode.ai/v2/docs/console/api/) does not establish a general wallet-balance endpoint. The adapter's legacy Go endpoint is implementation-specific; failures stay unknown. BYOK bills its actual provider.

`opencode stats` reports local session costs/tokens, not remaining account capacity. Neither zero cost, model lists/free labels nor invoices prove balance. No model discovery/update for quota queries. Documentation checked 2026-10-30; interfaces may change.
