#!/usr/bin/env bash
# Wrap a Mac (launchd/cron) scheduled task so its run is logged to
# ops-calendar/runs/. The wrapped task needs to know nothing about logging.
#
# Outcome mapping:
#   exit 0 + last stdout line "NOOP" -> noop   (ran fine, nothing to do)
#   exit 0 + last stdout line "SKIP" -> skip   (gate said not yet)
#   exit 0                           -> ok
#   exit != 0                        -> fail
#
# Usage:
#   scripts/oplog.sh --task <taskId> --repo ~/path/releasepilot-reports [--batch] -- <command...>
set -uo pipefail

TASK_ID=""
REPO=""
BATCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)  TASK_ID="$2"; shift 2 ;;
    --repo)  REPO="$2";    shift 2 ;;
    --batch) BATCH=1;      shift   ;;
    --)      shift; break ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$TASK_ID" || -z "$REPO" || $# -eq 0 ]]; then
  echo "usage: oplog.sh --task <id> --repo <path> [--batch] -- <command...>" >&2
  exit 2
fi

tmp_out="$(mktemp)"
trap 'rm -f "$tmp_out"' EXIT

start_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
"$@" 2>&1 | tee "$tmp_out"
exit_code=${PIPESTATUS[0]}
end_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
duration=$(( end_ms - start_ms ))

last_line="$(tail -n 1 "$tmp_out" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

if [[ $exit_code -ne 0 ]]; then
  outcome="fail"
elif [[ "$last_line" == "NOOP" ]]; then
  outcome="noop"
elif [[ "$last_line" == "SKIP" ]]; then
  outcome="skip"
else
  outcome="ok"
fi

note="${last_line:0:160}"

log_args=(--task "$TASK_ID" --host mac --outcome "$outcome" --repo "$REPO"
          --duration-ms "$duration" --exit-code "$exit_code" --note "$note")
[[ "$outcome" == "fail" ]] && log_args+=(--error "$note")
[[ $BATCH -eq 0 ]] && log_args+=(--commit)

python3 "$REPO/scripts/oplog.py" "${log_args[@]}"

exit $exit_code
