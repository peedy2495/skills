# Optional UI contract

Load only for a task changing a user interface (web, desktop, mobile or terminal); omit for headless services/libraries/CLI internals. Use current implementation, established components and design tokens as reference. Historical screenshots/mockups are not requirements unless the user explicitly selects them.

Reuse existing interaction patterns; preserve applicable keyboard/focus/accessibility, responsive and theme behavior. No broad redesign during a focused functional change. Verify actual rendered behavior for layout/interaction risks using the project's available tools; do not mandate a browser for non-web UI.

Exercise relevant empty/loading/error/success states, cancellation and retries. For overlays check visible placement, clipping, focus and dismissal. For multiple views/windows define shared-state/resource ownership and cleanup. Persist meaningful regressions with isolated fixtures when they protect recurring failures. No new UI library solely to satisfy this guidance.
