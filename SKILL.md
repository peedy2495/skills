---
name: cost-efficient-prompts
description: Reduce tokens, paid model work and repeated context when executing prompts. Route only efficiency, model-budget and quota decisions; project behavior and specialist skills remain in the consuming project.
---

# Cost-efficient prompts

Preserve the user's goal, acceptance, project rules and authorization. Minimize total expected effort including repairs; price or “free” alone does not establish suitability. Handle small tasks directly with existing tools. Delegate only when the approved path is likely economical; never create routine extra agents, reviews or polling loops.

Select the smallest relevant project files/instructions. Reuse unchanged applicable context and check evidence; reload changed/lost context. Compress losslessly: preserve goals, priorities, conditions, exceptions and explicit constraints; keep the original wording when equivalence is uncertain. Canonical sources own rules; aliases do not add payloads. [Context policy](references/context.md) supplies cache boundaries only when maintaining selection/handoffs.

Load one conditional route:

- Missing/broken integration: [setup](README.md#connect-a-project); first connection captures only OpenCode model metadata once.
- Substantial authorized delegation: [executor](skills/opencode-executor/SKILL.md); configured routing selects eligible model/variant within budgets.
- Requested quota/billing information or first working turn each local day: [usage](skills/llm-usage/SKILL.md); bundle unavailable values into at most one daily question.

Implementation methods, domain skills and check commands come exclusively from the consumer. Keep setup, account and routing administration out of execution prompts. Report outcomes/check evidence/limits briefly; no guaranteed cache hits, measured savings or extra spending implied.
