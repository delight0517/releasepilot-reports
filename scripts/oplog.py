#!/usr/bin/env python3
"""Record one execution of a scheduled/heartbeat task.

Writes ops-calendar/runs/<YYYY-MM-DD>/<taskId>__<host>.json — one file per
(date, task, host) so that Mac / Windows / cloud never touch the same file
and git never has to merge concurrent run logs.

See docs/ops_heartbeat_monitoring.md for the design.

Usage:
  python3 scripts/oplog.py --task yena-brand-ops-biweekly --host cloud \
      --outcome ok --note "9 open items" --produced reports/foo.html
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

OUTCOMES = ("ok", "noop", "skip", "fail")
HOSTS = ("mac", "windows", "cloud")
MAX_DETAIL_RUNS = 50


def repo_root(explicit):
    if explicit:
        return os.path.abspath(explicit)
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(here)


def main():
    p = argparse.ArgumentParser(description="Record a heartbeat/scheduled task run.")
    p.add_argument("--task", required=True, help="taskId, must match ops-calendar/registry.json")
    p.add_argument("--host", required=True, choices=HOSTS)
    p.add_argument("--outcome", required=True, choices=OUTCOMES)
    p.add_argument("--note", default="", help="short human-readable result, e.g. '9 open items'")
    p.add_argument("--produced", nargs="*", default=[], help="repo-relative artifact paths this run created")
    p.add_argument("--duration-ms", type=int, default=None)
    p.add_argument("--exit-code", type=int, default=None)
    p.add_argument("--error", default=None, help="error text when outcome=fail")
    p.add_argument("--repo", default=None, help="repo root (default: parent of this script)")
    p.add_argument("--commit", action="store_true", help="also git add/commit/push the run file")
    args = p.parse_args()

    root = repo_root(args.repo)
    now = datetime.now(timezone.utc)
    date = now.strftime("%Y-%m-%d")
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    day_dir = os.path.join(root, "ops-calendar", "runs", date)
    os.makedirs(day_dir, exist_ok=True)
    path = os.path.join(day_dir, f"{args.task}__{args.host}.json")

    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
    else:
        doc = {
            "date": date,
            "taskId": args.task,
            "host": args.host,
            "counters": {"total": 0, "ok": 0, "noop": 0, "skip": 0, "fail": 0},
            "firstAt": stamp,
            "lastAt": stamp,
            "runs": [],
        }

    run = {
        "at": stamp,
        "outcome": args.outcome,
        "durationMs": args.duration_ms,
        "exitCode": args.exit_code,
        "produced": args.produced,
        "note": args.note,
        "error": args.error,
    }

    doc["runs"].append(run)
    # Keep the file bounded for high-frequency tasks; counters stay complete.
    doc["runs"] = doc["runs"][-MAX_DETAIL_RUNS:]
    doc["counters"]["total"] += 1
    doc["counters"][args.outcome] += 1
    doc["lastAt"] = stamp

    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    rel = os.path.relpath(path, root)
    print(f"logged: {rel} ({args.outcome}, total={doc['counters']['total']})")

    if args.commit:
        msg = f"oplog: {args.task} {args.outcome} ({args.host})"
        try:
            subprocess.run(["git", "-C", root, "add", rel], check=True)
            subprocess.run(["git", "-C", root, "commit", "-m", msg], check=True)
            subprocess.run(["git", "-C", root, "push"], check=True)
        except subprocess.CalledProcessError as e:
            # Never let logging failure mask the task's own result.
            print(f"oplog: git step failed ({e}) — run file written locally", file=sys.stderr)


if __name__ == "__main__":
    main()
