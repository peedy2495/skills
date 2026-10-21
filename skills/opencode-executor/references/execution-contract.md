# Execution contract — Design by Contract

Executor preconditions: Ready .agents/PLAN.md and listed files/instructions. Stale/completed plan: write BLOCKED, stop. Read listed files first. Preserve dirty/staged/untracked user work; never stash/reset/clean it.

Invariants: obey supplied consumer rules; preserve user data; never print/copy/commit secrets. KISS/YAGNI: existing patterns/libraries, no unrelated/unnecessary refactors or unplanned architecture/public-contract/persistence/security/scope changes. Demonstrably false plan assumption: BLOCKED with concrete evidence, never replacement architecture.

Scratch/logs/profiles/messages: repository-local artifacts/opencode/. Never use hard-coded /tmp paths or external temporary scripts. Reusable regressions: scripts/. No recursive delegation, model switch, deployment or permission changes. Only external runner owns configured technical restart; never invoke it. Perform Git delivery only when the task plan records user authorization; never infer commit/push. Preserve exact scope; verify resulting Git status.

Own ordinary implementation/tests/repairs in this run. After corrections rerun affected checks, not all checks after each keystroke. Escalate only for failed independent repairs, conflicting requirements, necessary architecture change, unexpected risk or required human input. No activity narration; use tools, finish with report status/path.

Hemingway Bridge: Update .agents/PLAN.md immediately after each completed implementation step or check. Mark checkbox, concise evidence, next unfinished action and blocker before interruption/long checks. Resume from evidence without repeating completed work.

Definition of Done: planned behavior implemented, requested checks pass, actual changes self-reviewed against acceptance/scope/preserved work, .agents/PLAN.md Completed, .agents/IMPLEMENTATION_REPORT.md in supplied format. Never label skipped/failed checks passed. Authorized Git delivery: commit, authorized push outcome/destination, remaining changes. BLUF report; no full logs/diffs/chronology. Missing work: PARTIAL or BLOCKED, never SUCCESS.
