#!/usr/bin/env bash
set -euo pipefail

# One shared runner. Optional deterministic routing; legacy selection stays intact.
model=''
project=''
readonly plan='.agents/PLAN.md'
readonly report='.agents/IMPLEMENTATION_REPORT.md'
effort=''
check_only=false
allow_xhigh=false
explicit_selection=false

fail() { printf 'Executor: %s\n' "$2" >&2; exit "$1"; }
usage() {
  printf '%s\n' 'Usage: execute-plan.sh [--check] [--project path] [--model provider/model] [--effort minimal|low|medium|high|xhigh] [--allow-xhigh]' \
    'Runs the detailed .agents/PLAN.md with the consumer profile or explicit model/effort.' \
    '--check validates local prerequisites only; no model call or report write.' \
    '--allow-xhigh requires an explicit user request recorded in .agents/PLAN.md.'
}
while (($#)); do
  case "$1" in
    --check) check_only=true; shift ;;
    --project) (($# >= 2)) || fail 64 '--project requires a path'; project="$2"; shift 2 ;;
    --model) (($# >= 2)) || fail 64 '--model requires provider/model'; model="$2"; explicit_selection=true; shift 2 ;;
    --effort) (($# >= 2)) || fail 64 '--effort requires a value'; effort="$2"; explicit_selection=true; shift 2 ;;
    --allow-xhigh) allow_xhigh=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail 64 "Unknown argument: $1" ;;
  esac
done
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly implementation_rules="$script_dir/../references/implementation-rules.md"
readonly execution_contract="$script_dir/../references/execution-contract.md"
readonly report_template="$script_dir/../references/implementation-report-template.md"
command -v git >/dev/null 2>&1 || fail 69 'git is not available on PATH'
repo_root="$(git -C "${project:-$PWD}" rev-parse --show-toplevel 2>/dev/null)" || fail 66 'Select a consuming Git project with --project or cwd'
cd -- "$repo_root"
for required in "$plan" "$report_template" "$implementation_rules" "$execution_contract"; do
  [[ -f "$required" && -r "$required" && -s "$required" ]] || fail 66 "Missing, empty or unreadable $required"
done
command -v opencode >/dev/null 2>&1 || fail 69 'opencode is not available on PATH; no implementation fallback will run'
command -v awk >/dev/null 2>&1 || fail 69 'awk is required for report validation'
command -v node >/dev/null 2>&1 || fail 69 'node is required for structured report recovery'
profile_output="$(node "$script_dir/load-profile.mjs" "$repo_root")" || fail 65 'Invalid consumer profile'
mapfile -t profile_values <<< "$profile_output"
model="${model:-${profile_values[0]:-}}"
effort="${effort:-${profile_values[1]:-medium}}"
project_instructions=("${profile_values[@]:2}")
mode="$(node "$script_dir/route-plan.mjs" mode "$repo_root")" || fail 65 'Invalid routing activation'
if [[ "$mode" == routed ]]; then
  [[ "$explicit_selection" == false ]] || fail 64 'Routed execution selects model/variant deterministically; remove CLI model/effort overrides'
  node "$script_dir/route-plan.mjs" check "$repo_root" "$allow_xhigh" || fail 75 'Routing preflight failed'
else
[[ "$model" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.:-]+$ ]] || fail 64 'Select a valid provider/model in .agents/executor.json or --model'
case "$effort" in minimal|low|medium|high|xhigh) ;; *) fail 64 "Unsupported effort: $effort" ;; esac
if [[ "$effort" == xhigh && "$allow_xhigh" != true ]]; then
  fail 64 'xhigh requires an explicit user request and --allow-xhigh'
fi
printf 'Repository: %s\nPlan: %s\nModel: %s\nEffort: %s\n' "$repo_root" "$plan" "$model" "$effort"
fi
# Build one deterministic handoff prompt. Stable executor rules and stable task skills
# precede the changing plan so providers can reuse the longest possible prompt prefix.
# Project AGENTS discovery is disabled for the delegated run because Codex has already
# routed and distilled the applicable instructions into this handoff.
mapfile -t relevant_instructions < <(
  awk '
    /^# Relevant Instructions[[:space:]]*$/ { active=1; next }
    /^# / && active { exit }
    active {
      line=$0
      if (line ~ /^-[[:space:]]+`[^`]+`[[:space:]]*$/) {
        sub(/^-[[:space:]]+`/, "", line)
        sub(/`[[:space:]]*$/, "", line)
        print line
      }
    }
  ' "$plan" 2>/dev/null | LC_ALL=C sort -u
)
for instruction in "${relevant_instructions[@]}"; do
  [[ "$instruction" == .agents/skills/* ]] || fail 65 "Relevant instruction must be below .agents/skills/: $instruction"
  [[ "$instruction" != *'..'* ]] || fail 65 "Relevant instruction may not contain '..': $instruction"
  [[ -f "$instruction" && -r "$instruction" && -s "$instruction" ]] || fail 66 "Missing, empty or unreadable relevant instruction: $instruction"
done
if [[ "$check_only" == true ]]; then
  printf '%s\n' 'Local prerequisites OK. No model call or report write; credentials and service availability are untested.'
  exit 0
fi
run_once() (
set -e
# A subshell reuses the existing report/failure contract for each execution.
# Do not allow a previous run's SUCCESS to survive a failed/aborted invocation.
cat > "$report" <<'REPORT'
# Status

BLOCKED

# Implemented

- Executor started; the executor has not written the current report.

# Changed Files

- Not yet reported.

# Verification

- Not yet reported.

# Plan Deviations

- none

# Blockers

- Current invocation has not produced an implementation report.
REPORT
scratch_dir="$repo_root/artifacts/opencode/tmp"
mkdir -p -- "$scratch_dir"
export TMPDIR="$scratch_dir"
prompt_file="$(mktemp "$TMPDIR/executor-handoff.XXXXXXXX")"
events_file="$(mktemp "$TMPDIR/executor-events.XXXXXXXX")"
stderr_file="$(mktemp "$TMPDIR/executor-stderr.XXXXXXXX")"
placeholder_file="$(mktemp "$TMPDIR/executor-placeholder.XXXXXXXX")"
if [[ "$mode" == routed ]]; then
  rm -f -- "$events_file" "$stderr_file" "$placeholder_file"
  events_file="$route_dir/events.jsonl"
  stderr_file="$route_dir/stderr.log"
  placeholder_file="$route_dir/placeholder.md"
fi
cp -- "$report" "$placeholder_file"
status=0
cleanup() {
  rm -f -- "$prompt_file"
  if [[ "$mode" == routed ]]; then return; fi
  rm -f -- "$placeholder_file"
  # Retain failed CLI events locally for targeted diagnosis; never dump transcripts.
  if ((status == 0)); then rm -f -- "$events_file" "$stderr_file"; fi
}
trap cleanup EXIT
cat "$execution_contract" > "$prompt_file"
cat "$implementation_rules" >> "$prompt_file"
printf '\n# Implementation report format\n' >> "$prompt_file"
cat "$report_template" >> "$prompt_file"
printf '\n# Consuming-project constraints\n' >> "$prompt_file"
for instruction in "${project_instructions[@]}"; do
  printf '\n## Instruction: %s\n' "$instruction" >> "$prompt_file"
  cat "$instruction" >> "$prompt_file"
  printf '\n' >> "$prompt_file"
done
printf '\n# Task instructions\n' >> "$prompt_file"
if ((${#relevant_instructions[@]} == 0)); then
  printf '%s\n' 'No additional task skill/reference was supplied.' >> "$prompt_file"
else
  for instruction in "${relevant_instructions[@]}"; do
    if [[ "$instruction" -ef "$execution_contract" || "$instruction" -ef "$implementation_rules" || "$instruction" -ef "$report_template" ]]; then continue; fi
    printf '\n## Instruction: %s\n' "$instruction" >> "$prompt_file"
    cat "$instruction" >> "$prompt_file"
    printf '\n' >> "$prompt_file"
  done
fi
printf '\n# Task plan\n' >> "$prompt_file"
cat "$plan" >> "$prompt_file"
prompt="$(cat "$prompt_file")"
status=0
variant_args=()
if [[ -n "$effort" ]]; then variant_args=(--variant "$effort"); fi
if [[ "$mode" == routed ]]; then
  OPENCODE_CONFIG_CONTENT="$route_overlay" OPENCODE_DISABLE_PROJECT_CONFIG=1 opencode run --agent build --model "$model" "${variant_args[@]}" --format json "$prompt" </dev/null >"$events_file" 2>"$stderr_file" || status=$?
else
  OPENCODE_DISABLE_PROJECT_CONFIG=1 opencode run --agent build --model "$model" "${variant_args[@]}" --format json "$prompt" </dev/null >"$events_file" 2>"$stderr_file" || status=$?
fi
printf '\nExecutor CLI exit: %s. Report: %s\n' "$status" "$report"
if ((status != 0)); then
  printf 'state=failed cli_exit=%s events_file=%s stderr_file=%s\n' "$status" "$events_file" "$stderr_file" >&2
  if [[ "$mode" != routed ]]; then printf 'Executor: OpenCode failed; no retry or model fallback. Inspect the error and report, not a second full code review.\n' >&2; fi
  exit "$status"
fi
if [[ ! -s "$report" ]] || cmp -s -- "$report" "$placeholder_file"; then
  if node "$script_dir/recover-report.mjs" "$events_file" "$report"; then
    printf '%s\n' 'Executor: recovered report from final assistant output; validating it normally.'
  fi
fi
[[ -f "$report" && -s "$report" ]] || fail 65 'Current implementation report is missing or empty'
section() {
  awk -v heading="# $1" '
    /^# / { active = ($0 == heading); next }
    active && NF { sub(/\r$/, ""); print }
  ' "$report"
}
for heading in Status Implemented 'Changed Files' Verification 'Plan Deviations' Blockers; do
  count="$(awk -v heading="# $heading" '$0 == heading { n++ } END { print n+0 }' "$report")"
  [[ "$count" == 1 && -n "$(section "$heading")" ]] || fail 65 "Malformed report section: $heading"
done
report_status="$(section Status)"
case "$report_status" in
  SUCCESS)
    if [[ "$(section 'Plan Deviations')" != '- none' || "$(section Blockers)" != '- none' ]]; then
      fail 2 'SUCCESS contains deviations or blockers; Codex must triage the report'
    fi
    printf '%s\n' 'state=completed: inspect compact report, changed paths and relevant diff against the plan; reuse tests, no transcript reread or automatic test rerun.'
    ;;
  PARTIAL) fail 2 'PARTIAL: Codex must choose targeted correction or replanning from the report' ;;
  BLOCKED) fail 3 'BLOCKED: Codex must resolve the reported decision or execution blocker' ;;
  *) fail 65 'Invalid report status; expected SUCCESS, PARTIAL or BLOCKED' ;;
esac
)

if [[ "$mode" != routed ]]; then run_once; exit $?; fi

# Separate workspace ownership prevents concurrent writers to the canonical plan/report.
# Unsettled/interrupted starts retain both the lock and budget reservation for triage.
node "$script_dir/route-plan.mjs" workspace-lock "$repo_root" || fail 75 'Workspace unavailable'
managed_settled=true
managed_cleanup() {
  if [[ "$managed_settled" == true ]]; then node "$script_dir/route-plan.mjs" workspace-unlock "$repo_root"; fi
}
trap managed_cleanup EXIT
previous=''
for attempt in 0 1; do
  selection="$(node "$script_dir/route-plan.mjs" admit "$repo_root" "$allow_xhigh" "$previous")" || fail 75 'No eligible budgeted start; inspect compact routing records'
  managed_settled=false
  mapfile -t selected <<< "$selection"
  run_id="${selected[0]}"; model="${selected[1]}"; effort="${selected[2]:-}"
  route_dir="$repo_root/artifacts/opencode/runs/$run_id"
  route_overlay="$(node "$script_dir/route-plan.mjs" claim "$repo_root" "$run_id")" || fail 75 'Start authorization failed'
  printf 'Routing: run_id=%s model=%s variant=%s decision=%s/decision.json\n' "$run_id" "$model" "${effort:-<base>}" "$route_dir"
  result=0
  # Keep errexit inside the execution subshell. Calling a function in an `||`
  # list would disable it throughout prompt/report preparation as well.
  set +e
  run_once
  result=$?
  set -e
  outcome="$(node "$script_dir/route-plan.mjs" finish "$repo_root" "$run_id" "$result")" || fail 75 'Usage settlement failed; reservation retained'
  managed_settled=true
  if ((result != 0 && attempt == 0)) && [[ "$outcome" == safe-technical-free-failure ]]; then
    previous="$run_id"
    printf 'Routing: safe technical Free failure; checking one default_go start.\n'
    continue
  fi
  if ((result == 0)); then rm -f -- "$route_dir/events.jsonl" "$route_dir/stderr.log"; fi
  printf 'state=routing_completed attempts=%s exit=%s outcome=%s/outcome.json\n' "$((attempt + 1))" "$result" "$route_dir"
  exit "$result"
done
