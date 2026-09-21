# Skill library maintenance

When connecting a new consuming project or repairing its integration, follow [README.md](README.md), section “Connect a project”. Read this setup guidance only for integration work; it is the single source for links, profile configuration and preflight.

Keep reusable guidance application-, language- and model-independent. Product rules and commands belong in consuming projects. Minimize context with Progressive Disclosure, SSOT and precise task routing; anchors never replace explicit safety/authorization contracts.

Maintain this workflow directly. Preserve existing work. No real model calls for script tests; use isolated fake-CLI fixtures. Validate with `bash scripts/check.sh`; document remaining model-behavior uncertainty rather than claiming token or quality equivalence from word counts. Never copy credentials or application data into this library.
