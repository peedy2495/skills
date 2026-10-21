# Optional UI contract

Read only for web/desktop/mobile/terminal UI changes, not headless services/libraries/CLI internals. Reference current code/components/design tokens; historical screenshots/mockups govern only if user-selected.

Reuse interaction patterns; preserve applicable keyboard/focus/accessibility, responsive/theme behavior. No broad redesign during focused functional work. Verify actual rendering for layout/interaction risks with available project tools; non-web UI needs no mandated browser.

Exercise relevant empty/loading/error/success, cancellation/retry states. Overlays: placement/clipping/focus/dismissal. Multiple views/windows: shared-state/resource ownership/cleanup. Preserve meaningful recurring-failure regressions with isolated fixtures. No new UI library solely for this guidance.
