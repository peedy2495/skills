# Testing contract

Use meaningful regression checks for behavior/risk, not a test for every reversible layout edit. Red–Green–Refactor is useful for logic/bugs; Chicago-style state assertions prefer real objects and isolated local stores, with fakes at external I/O. No mandatory refactor or automatic commit. Given–When–Then states outcomes; property tests are optional for invariants without implying a new dependency.

Discover languages, versions and commands from the consuming repository's instructions/manifests/CI. Use its existing toolchain, fixtures and libraries. Multi-language changes get checks for affected languages and their boundaries. Do not install a universal test/lint stack, mandate browser tests for headless projects, or research unrelated ecosystems.

Run smallest relevant checks after logical sections; repair compiler/type/lint/test failures. Run consuming-project required gates before completion. Repeat successful gates only after relevant changes/failure/remaining risk. Delivery-only tasks reuse valid evidence.

For persistence/ingestion, cover pertinent failure, cancellation, rollback, preservation and boundary cases. For UI changes select ui.md as needed and check observable interaction rather than incidental markup. Keep reusable regressions in the project's established tests/scripts; scratch probes are not durable coverage.

Use isolated data/profiles: no destructive tests against live systems. Definition of Done records commands/counts, skipped checks with reasons, unresolved failures and self-review. No whole-repository audit or technology scan unless task/risk requires it.
