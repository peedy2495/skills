# OpenCode quota/balance

Use the shared status command in [usage](../SKILL.md); it resolves the installation-wide pool, including an explicit `SKILLS_STATE_DIR`.

Returns observed Go rolling/weekly/monthly usage/reset windows; remaining percentage is `100 - percent`, not a wallet balance. Missing configuration/API failure remains unknown; no manual quota fallback. Execution refreshes both shared observations automatically. [Credits](../../opencode-executor/references/credits.md) owns documented conversions, token-price fallback and account setup; only its script may read `.env`, never the agent or shell-source. Token prices rank models when conversion is unavailable; they never establish remaining quota.

For missing wallet/plan values, use a connected read-only account tool or [Billing view](https://opencode.ai/v2/docs/console/billing/), subject to account role. The documented [Console API](https://opencode.ai/v2/docs/console/api/) does not establish a general wallet-balance endpoint. The adapter's legacy Go endpoint is implementation-specific; failures stay unknown. BYOK bills its actual provider.

`opencode stats` reports local session costs/tokens, not remaining account capacity. Neither zero cost, model lists/free labels nor invoices prove balance. No model discovery/update for quota queries. Documentation checked 2026-10-30; interfaces may change.
