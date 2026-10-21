# Skill library maintenance

For new/repairing consumer integration, read [README.md](README.md), “Connect a project”: the SSOT for links, profiles and preflight. Skip setup guidance otherwise.

Keep reusable guidance application-, language- and model-independent; product rules/commands stay in consumers. Minimize context through Progressive Disclosure, SSOT and precise routing. Anchors never replace explicit safety/authorization contracts.

Maintain this workflow directly; preserve existing work. Script tests use isolated fake CLIs, never real model calls. Validate with `bash scripts/check.sh`. Document model-behavior uncertainty; word counts prove neither token nor quality equivalence. Never copy credentials/application data into this library.
