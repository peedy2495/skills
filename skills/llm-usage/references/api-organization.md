# Separate OpenAI API accounting

Read only when this API organization is explicitly in scope; never load for ordinary ChatGPT/Codex subscription checks.

The [Usage and Costs API](https://platform.openai.com/docs/api-reference/usage) requires appropriate existing organization/admin access. Totals describe API usage/costs, not ChatGPT/Codex allowance or spendable prepaid balance. This skill neither provisions access nor inspects/copies keys. Query only through an already authorized account tool; unavailable access remains unknown under the skill's fallback contract.

Documentation checked 2026-10-30; verify current official interfaces when implementing a new adapter. No generic billing endpoint or balance inferred from model replies, prices or token counts.
