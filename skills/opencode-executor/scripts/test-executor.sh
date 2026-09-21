#!/usr/bin/env bash
set -euo pipefail

# Only isolated fixtures and a fake CLI; never call a model or alter user work.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$script_dir/../../.." && pwd -P)"
mkdir -p -- "$repo_root/artifacts/opencode/tmp"
fixture="$(mktemp -d "$repo_root/artifacts/opencode/tmp/executor-test.XXXXXXXX")"
trap 'rm -rf -- "$fixture"' EXIT
repo="$fixture/repo with spaces"
mkdir -p "$repo/.agents/skills/testing" "$fixture/bin" "$fixture/shared"
cp -a "$script_dir/.." "$fixture/shared/opencode-executor"
ln -s "$fixture/shared/opencode-executor" "$repo/.agents/skills/opencode-executor"
printf '# Fixture testing skill\n\nStable fixture instructions.\n' > "$repo/.agents/skills/testing/SKILL.md"
printf '# Local invariant\nKeep fixture data intact.\n' > "$repo/AGENTS.md"
printf '%s\n' '{"model":"fixture/model","effort":"high","instructions":["AGENTS.md"]}' > "$repo/.agents/executor.json"
git init -q "$repo"
runner="$repo/.agents/skills/opencode-executor/scripts/execute-plan.sh"
bash_bin="$(command -v bash)"
cat > "$fixture/bin/opencode" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "${TMPDIR:-}" == "$PWD/artifacts/opencode/tmp" && -d "$TMPDIR" ]] || exit 98
printf '%s\0' "$PWD" "${OPENCODE_DISABLE_PROJECT_CONFIG:-}" "$@" >> "$EXECUTOR_TEST_CAPTURE"
case "${EXECUTOR_TEST_REPORT:-SUCCESS}" in
  absent) rm -f .agents/IMPLEMENTATION_REPORT.md ;;
  unchanged) : ;;
  malformed) printf '# Status\n\nSUCCESS\n' > .agents/IMPLEMENTATION_REPORT.md ;;
  *)
    cat > .agents/IMPLEMENTATION_REPORT.md <<REPORT
# Status

${EXECUTOR_TEST_REPORT:-SUCCESS}

# Implemented

- Fixture task.

# Changed Files

- fixture.txt

# Verification

- Fixture check: passed; self-review: passed.

# Plan Deviations

${EXECUTOR_TEST_DEVIATIONS:-- none}

# Blockers

${EXECUTOR_TEST_BLOCKERS:-- none}
REPORT
    ;;
esac
if [[ -n "${EXECUTOR_TEST_OUTPUT:-}" ]]; then
  node -e '
    const fs = require("node:fs");
    const text = fs.readFileSync(process.env.EXECUTOR_TEST_OUTPUT, "utf8");
    const type = process.env.EXECUTOR_TEST_EVENT || "text";
    console.log(JSON.stringify({type, part: {type, text}}));
    if (process.env.EXECUTOR_TEST_TRAILING) console.log(JSON.stringify({type:"text", part:{type:"text", text:"SUCCESS: report path"}}));
  '
fi
if [[ -n "${EXECUTOR_TEST_STDERR:-}" ]]; then printf '%s\n' "$EXECUTOR_TEST_STDERR" >&2; fi
exit "${EXECUTOR_TEST_EXIT:-0}"
MOCK
chmod +x "$fixture/bin/opencode"
export EXECUTOR_TEST_CAPTURE="$fixture/invocations"
export PATH="$fixture/bin:$PATH"
cd "$fixture"
expect_exit() {
  local expected="$1" actual=0
  shift
  "$@" > "$fixture/output" 2>&1 || actual=$?
  if [[ "$actual" != "$expected" ]]; then
    cat "$fixture/output" >&2
    printf 'Expected exit %s, got %s\n' "$expected" "$actual" >&2
    exit 1
  fi
}
expect_exit 0 "$bash_bin" "$runner" --project "$repo" --help
# Root PLAN.md alone is deliberately not sufficient.
printf '# Goal\nReady: obsolete root fixture.\n' > "$repo/PLAN.md"
expect_exit 66 "$bash_bin" "$runner" --project "$repo" --check
[[ ! -e "$EXECUTOR_TEST_CAPTURE" ]]
cat > "$repo/.agents/PLAN.md" <<'PLAN'
# Goal

Ready: fixture-only test.

# Relevant Instructions

- `.agents/skills/testing/SKILL.md`

# Context

- Fixture context.
PLAN
printf 'Existing report must survive --check.\n' > "$repo/.agents/IMPLEMENTATION_REPORT.md"
cp "$repo/.agents/IMPLEMENTATION_REPORT.md" "$fixture/original-report"
expect_exit 0 "$bash_bin" "$runner" --project "$repo" --check
cmp "$repo/.agents/IMPLEMENTATION_REPORT.md" "$fixture/original-report"
[[ ! -e "$EXECUTOR_TEST_CAPTURE" ]]
expect_exit 64 "$bash_bin" "$runner" --project "$repo" --effort
expect_exit 64 "$bash_bin" "$runner" --project "$repo" --effort default
expect_exit 64 "$bash_bin" "$runner" --project "$repo" --model
expect_exit 64 "$bash_bin" "$runner" --project "$repo" --model invalid
expect_exit 0 "$bash_bin" "$runner" --project "$repo" --check --model other/model
expect_exit 64 "$bash_bin" "$runner" --project "$repo" --effort xhigh
expect_exit 0 "$bash_bin" "$runner" --project "$repo" --check --effort xhigh --allow-xhigh
[[ ! -e "$EXECUTOR_TEST_CAPTURE" ]]
export TMPDIR="$fixture/external-temp-must-not-be-used"
expect_exit 0 "$bash_bin" "$runner" --project "$repo"
[[ ! -e "$TMPDIR" ]]
mapfile -d '' -t invocation < "$EXECUTOR_TEST_CAPTURE"
[[ "${#invocation[@]}" == 12 ]]
[[ "${invocation[0]}" == "$repo" && "${invocation[1]}" == 1 && "${invocation[2]}" == run ]]
[[ "${invocation[3]}" == --agent && "${invocation[4]}" == build ]]
[[ "${invocation[5]}" == --model && "${invocation[6]}" == fixture/model ]]
[[ "${invocation[7]}" == --variant && "${invocation[8]}" == high ]]
[[ "${invocation[9]}" == --format && "${invocation[10]}" == json ]]
[[ "${invocation[11]}" == *'# Fixture testing skill'* && "${invocation[11]}" == *'# Task plan'* && "${invocation[11]}" == *'Ready: fixture-only test.'* ]]
[[ "${invocation[11]}" == *'# Fixture testing skill'* && "${invocation[11]%%# Task plan*}" == *'# Fixture testing skill'* ]]
[[ "${invocation[11]}" != *'Read AGENTS.md, .agents/AGENTS.md'* ]]
[[ "${invocation[11]}" == *'Never use hard-coded /tmp paths'* ]]
[[ "${invocation[11]}" == *'Perform Git delivery only when the task plan records user authorization'* ]]
[[ "${invocation[11]}" == *'Update .agents/PLAN.md immediately after each completed implementation step or check'* ]]
while IFS= read -r rule; do
  [[ "$rule" == '- '* ]] || continue
  [[ "${invocation[11]}" == *"$rule"* ]] || { printf 'Missing injected rule: %s\n' "$rule" >&2; exit 1; }
done < "$repo/.agents/skills/opencode-executor/references/implementation-rules.md"
[[ "${invocation[11]}" == *'Keep fixture data intact.'* ]]
[[ "${invocation[11]%%# Task plan*}" == *'Keep fixture data intact.'* ]]
# Explicit configuration reaches the CLI unchanged; no copied runner needed.
: > "$EXECUTOR_TEST_CAPTURE"
expect_exit 0 "$bash_bin" "$runner" --project "$repo" --model other/model --effort low
mapfile -d '' -t custom < "$EXECUTOR_TEST_CAPTURE"
[[ "${custom[6]}" == other/model && "${custom[8]}" == low ]]
# A language/UI profile is local data, not a shared framework mandate.
cp "$repo/.agents/executor.json" "$fixture/base-profile"
cp "$repo/.agents/PLAN.md" "$fixture/base-plan"
printf '# Python-only checks\nUse the existing Python gates; no UI.\n' > "$repo/python.md"
printf '%s\n' '{"model":"fixture/python","instructions":["python.md","AGENTS.md","python.md"]}' > "$repo/.agents/executor.json"
: > "$EXECUTOR_TEST_CAPTURE"
expect_exit 0 "$bash_bin" "$runner" --project "$repo"
mapfile -d '' -t headless < "$EXECUTOR_TEST_CAPTURE"
[[ "${headless[6]}" == fixture/python && "${headless[8]}" == medium ]]
[[ "${headless[11]}" == *'Python-only checks'* && "${headless[11]}" != *'# Optional UI contract'* ]]
[[ "${headless[11]%%# Task plan*}" == *'Python-only checks'* ]]
# Shared references are routed explicitly and sorted, not load-all.
printf '# Mixed-language gates\nUse both affected toolchains.\n' > "$repo/mixed.md"
printf '%s\n' '{"model":"fixture/mixed","effort":"low","instructions":["mixed.md","AGENTS.md"]}' > "$repo/.agents/executor.json"
sed '/# Relevant Instructions/a\
- `.agents/skills/opencode-executor/references/ui.md`\
- `.agents/skills/opencode-executor/references/testing.md`' "$fixture/base-plan" > "$repo/.agents/PLAN.md"
: > "$EXECUTOR_TEST_CAPTURE"
expect_exit 0 "$bash_bin" "$runner" --project "$repo"
mapfile -d '' -t mixed < "$EXECUTOR_TEST_CAPTURE"
[[ "${mixed[6]}" == fixture/mixed && "${mixed[11]}" == *'# Optional UI contract'* && "${mixed[11]}" == *'Mixed-language gates'* ]]
[[ "${mixed[11]%%# Optional UI contract*}" == *'# Testing contract'* ]]
[[ "${mixed[11]}" != *'# Local contract: event-driven supervision'* ]]
cp "$fixture/base-plan" "$repo/.agents/PLAN.md"
# Invalid consumer configuration never calls the model or alters the last report.
cp "$repo/.agents/IMPLEMENTATION_REPORT.md" "$fixture/config-report"
cp "$EXECUTOR_TEST_CAPTURE" "$fixture/config-capture"
for bad in '{broken' '{"model":"bad model"}' '{"model":"fixture/model","instructions":["../outside.md"]}' '{"model":"fixture/model","instructions":["missing.md"]}' '{"model":"fixture/model","token":"PRIVATE_CONFIG_SENTINEL"}'; do
  printf '%s\n' "$bad" > "$repo/.agents/executor.json"
  expect_exit 65 "$bash_bin" "$runner" --project "$repo"
  ! grep -q PRIVATE_CONFIG_SENTINEL "$fixture/output"
  cmp "$fixture/config-report" "$repo/.agents/IMPLEMENTATION_REPORT.md"
  cmp "$fixture/config-capture" "$EXECUTOR_TEST_CAPTURE"
done
printf '# External\n' > "$fixture/outside.md"
ln -s "$fixture/outside.md" "$repo/outside.md"
printf '%s\n' '{"model":"fixture/model","instructions":["outside.md"]}' > "$repo/.agents/executor.json"
expect_exit 65 "$bash_bin" "$runner" --project "$repo"
# The profile itself cannot be an external symlink either.
cp "$fixture/base-profile" "$fixture/external-profile.json"
rm "$repo/.agents/executor.json"
ln -s "$fixture/external-profile.json" "$repo/.agents/executor.json"
expect_exit 65 "$bash_bin" "$runner" --project "$repo" --check
rm "$repo/.agents/executor.json"
# --check validates routed files without replacing the previous report.
cp "$fixture/base-profile" "$repo/.agents/executor.json"
sed 's@.agents/skills/testing/SKILL.md@.agents/skills/missing/SKILL.md@' "$fixture/base-plan" > "$repo/.agents/PLAN.md"
expect_exit 66 "$bash_bin" "$runner" --project "$repo" --check
cmp "$fixture/config-report" "$repo/.agents/IMPLEMENTATION_REPORT.md"
cp "$fixture/base-plan" "$repo/.agents/PLAN.md"
# Profile and explicit instruction selection are mandatory, model may be supplied by CLI.
rm "$repo/.agents/executor.json"
expect_exit 65 "$bash_bin" "$runner" --project "$repo" --check
expect_exit 65 "$bash_bin" "$runner" --project "$repo" --check --model fixture/explicit
printf '%s\n' '{"instructions":[]}' > "$repo/.agents/executor.json"
expect_exit 64 "$bash_bin" "$runner" --project "$repo" --check
expect_exit 0 "$bash_bin" "$runner" --project "$repo" --check --model fixture/explicit
cp "$fixture/base-profile" "$repo/.agents/executor.json"
# Relative shared link and cwd discovery are both exercised from the consumer.
ln -s ../shared/opencode-executor "$repo/relative-runner"
(cd "$repo" && expect_exit 0 "$bash_bin" relative-runner/scripts/execute-plan.sh --check)

# Old SUCCESS must not survive a run which fails to produce a report.
export EXECUTOR_TEST_REPORT=unchanged
expect_exit 3 "$bash_bin" "$runner" --project "$repo"
for mode in absent malformed INVALID; do
  export EXECUTOR_TEST_REPORT="$mode"
  expect_exit 65 "$bash_bin" "$runner" --project "$repo"
done
export EXECUTOR_TEST_REPORT=PARTIAL
expect_exit 2 "$bash_bin" "$runner" --project "$repo"
export EXECUTOR_TEST_REPORT=BLOCKED
expect_exit 3 "$bash_bin" "$runner" --project "$repo"
export EXECUTOR_TEST_REPORT=SUCCESS
export EXECUTOR_TEST_DEVIATIONS='- Changed an unspecified API.'
expect_exit 2 "$bash_bin" "$runner" --project "$repo"
unset EXECUTOR_TEST_DEVIATIONS
export EXECUTOR_TEST_BLOCKERS='- Missing verification.'
expect_exit 2 "$bash_bin" "$runner" --project "$repo"
unset EXECUTOR_TEST_BLOCKERS
: > "$EXECUTOR_TEST_CAPTURE"
export EXECUTOR_TEST_EXIT=42
expect_exit 42 "$bash_bin" "$runner" --project "$repo" --effort high
mapfile -d '' -t invocation < "$EXECUTOR_TEST_CAPTURE"
[[ "${#invocation[@]}" == 12 && "${invocation[8]}" == high && "${invocation[1]}" == 1 ]]
# CLI failures retain private diagnostics without streaming arbitrary transcript text.
printf 'PRIVATE_EVENT_SENTINEL\n' > "$fixture/private-events"
export EXECUTOR_TEST_OUTPUT="$fixture/private-events"
export EXECUTOR_TEST_STDERR=PRIVATE_STDERR_SENTINEL
expect_exit 42 "$bash_bin" "$runner" --project "$repo"
! grep -q 'PRIVATE_STDERR_SENTINEL' "$fixture/output"
! grep -q 'PRIVATE_EVENT_SENTINEL' "$fixture/output"
grep -q 'state=failed cli_exit=42 events_file=' "$fixture/output"
node - "$repo/artifacts/opencode/tmp" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
const logs = fs.readdirSync(dir).filter(n => n.startsWith('executor-events.'));
if (!logs.some(n => fs.readFileSync(path.join(dir,n),'utf8').includes('PRIVATE_EVENT_SENTINEL'))) process.exit(1);
const errors = fs.readdirSync(dir).filter(n => n.startsWith('executor-stderr.'));
if (!errors.some(n => fs.readFileSync(path.join(dir,n),'utf8').includes('PRIVATE_STDERR_SENTINEL'))) process.exit(1);
NODE
unset EXECUTOR_TEST_OUTPUT EXECUTOR_TEST_STDERR
# Recover only complete final assistant reports from this invocation.
unset EXECUTOR_TEST_EXIT
export EXECUTOR_TEST_REPORT=SUCCESS
expect_exit 0 "$bash_bin" "$runner" --project "$repo"
cp "$repo/.agents/IMPLEMENTATION_REPORT.md" "$fixture/recovery-report"
export EXECUTOR_TEST_OUTPUT="$fixture/recovery-report"
for mode in unchanged absent; do
  export EXECUTOR_TEST_REPORT="$mode"
  expect_exit 0 "$bash_bin" "$runner" --project "$repo"
  cmp "$fixture/recovery-report" "$repo/.agents/IMPLEMENTATION_REPORT.md"
done
# Tool output and non-final report text are not recovery sources.
export EXECUTOR_TEST_REPORT=unchanged EXECUTOR_TEST_EVENT=tool_use
expect_exit 3 "$bash_bin" "$runner" --project "$repo"
unset EXECUTOR_TEST_EVENT
export EXECUTOR_TEST_TRAILING=1
expect_exit 3 "$bash_bin" "$runner" --project "$repo"
unset EXECUTOR_TEST_TRAILING
# Existing reports remain authoritative, including malformed/blocked ones.
export EXECUTOR_TEST_REPORT=BLOCKED
expect_exit 3 "$bash_bin" "$runner" --project "$repo"
export EXECUTOR_TEST_REPORT=malformed
expect_exit 65 "$bash_bin" "$runner" --project "$repo"
# Recovery does not bypass status or deviation checks.
export EXECUTOR_TEST_REPORT=absent
sed 's/^SUCCESS$/PARTIAL/' "$fixture/recovery-report" > "$fixture/partial-report"
export EXECUTOR_TEST_OUTPUT="$fixture/partial-report"
expect_exit 2 "$bash_bin" "$runner" --project "$repo"
sed 's/^SUCCESS$/BLOCKED/' "$fixture/recovery-report" > "$fixture/blocked-report"
export EXECUTOR_TEST_OUTPUT="$fixture/blocked-report"
expect_exit 3 "$bash_bin" "$runner" --project "$repo"
sed 's/^- none$/- Unresolved item./' "$fixture/recovery-report" > "$fixture/deviation-report"
export EXECUTOR_TEST_OUTPUT="$fixture/deviation-report"
expect_exit 2 "$bash_bin" "$runner" --project "$repo"
printf '# Status\n\nSUCCESS\n' > "$fixture/short-report"
export EXECUTOR_TEST_OUTPUT="$fixture/short-report"
expect_exit 65 "$bash_bin" "$runner" --project "$repo"
export EXECUTOR_TEST_OUTPUT="$fixture/recovery-report" EXECUTOR_TEST_EXIT=42
expect_exit 42 "$bash_bin" "$runner" --project "$repo"
[[ ! -e "$repo/.agents/IMPLEMENTATION_REPORT.md" ]]
unset EXECUTOR_TEST_OUTPUT EXECUTOR_TEST_EXIT
mkdir "$fixture/no-cli"
ln -s "$(command -v git)" "$fixture/no-cli/git"
ln -s "$(command -v dirname)" "$fixture/no-cli/dirname"
previous_path="$PATH"
export PATH="$fixture/no-cli"
expect_exit 69 "$bash_bin" "$runner" --project "$repo" --check
export PATH="$previous_path"
printf '%s\n' 'PASS: shared symlink/cwd isolation, Python headless and mixed-language UI routing, required safe profiles, preflight reference checks, private stderr, focused canonical plan, project AGENTS discovery disabled, stable task instructions precede dynamic plan, arbitrary cwd/spaces, check-only preservation, configured model/effort forwarding, xhigh gate, current reports, SUCCESS/PARTIAL/BLOCKED, malformed reports, deviation/blocker triage, structured final-report recovery with authoritative-file preservation and CLI failure propagation without retries (mock only).'
