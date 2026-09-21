#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
bash -n "$root/skills/opencode-executor/scripts/execute-plan.sh"
bash "$root/skills/opencode-executor/scripts/test-executor.sh"
node "$root/scripts/check-library.mjs"
