#!/usr/bin/env python3
"""Compare ops-calendar/registry.json (what should run) against
ops-calendar/runs/ (what actually ran) and write ops-calendar/health.json.

This is the single writer of health.json — run it from one place only
(the ops-monitor-weekly routine), so there is never a merge conflict.

See docs/ops_heartbeat_monitoring.md for what each finding means.

Usage:  python3 scripts/ops_health.py [--window 14] [--repo PATH]
"""
import argparse
import json
import os
from datetime import datetime, timedelta, timezone

# A task is "silent" once it has missed its expected cadence by this factor.
SILENT_GRACE_FACTOR = 2
SILENT_GRACE_EXTRA_DAYS = 1
# Ran this many times more than expected -> over-frequent.
OVERFREQUENT_FACTOR = 3
# This many failures in the window -> failing.
FAILING_THRESHOLD = 2
# Minimum runs before we're willing to call a task pointless.
POINTLESS_MIN_RUNS = 3


def expected_period_days(recurrence):
    """How many days between two expected runs. None = unknown/continuous."""
    if not recurrence:
        return None
    kind = recurrence.get("type")
    if kind == "daily":
        return 1.0
    if kind == "weekly":
        return 7.0
    if kind == "interval":
        days = recurrence.get("days")
        return float(days) if days else None
    if kind == "frequent":
        return None  # many times a day; presence-checked, not count-checked
    return None


def load_runs(root, window_days, today):
    """Return {taskId: {host: [run, ...]}} for the window, plus per-day index."""
    runs_dir = os.path.join(root, "ops-calendar", "runs")
    by_task = {}
    by_task_day = {}
    if not os.path.isdir(runs_dir):
        return by_task, by_task_day

    cutoff = today - timedelta(days=window_days)
    for day_name in sorted(os.listdir(runs_dir)):
        try:
            day = datetime.strptime(day_name, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if day < cutoff:
            continue
        day_dir = os.path.join(runs_dir, day_name)
        if not os.path.isdir(day_dir):
            continue
        for fname in sorted(os.listdir(day_dir)):
            if not fname.endswith(".json"):
                continue
            with open(os.path.join(day_dir, fname), encoding="utf-8") as f:
                doc = json.load(f)
            task = doc.get("taskId")
            host = doc.get("host", "unknown")
            if not task:
                continue
            by_task.setdefault(task, {}).setdefault(host, []).append(doc)
            by_task_day.setdefault(task, {})[day_name] = doc.get("counters", {})
    return by_task, by_task_day


def summarize(docs_by_host):
    """Flatten per-host docs into totals + last run info."""
    counters = {"total": 0, "ok": 0, "noop": 0, "skip": 0, "fail": 0}
    produced = 0
    last_at = None
    last_outcome = None
    hosts = sorted(docs_by_host.keys())
    for docs in docs_by_host.values():
        for doc in docs:
            for key in counters:
                counters[key] += doc.get("counters", {}).get(key, 0)
            for run in doc.get("runs", []):
                produced += len(run.get("produced") or [])
                at = run.get("at")
                if at and (last_at is None or at > last_at):
                    last_at = at
                    last_outcome = run.get("outcome")
    return counters, produced, last_at, last_outcome, hosts


def run_findings(counters, produced, last_outcome, hosts, period, window_days, status, active):
    """Findings derivable from actual run records (used for registered and
    unregistered tasks alike — a ghost task that is also failing says both)."""
    out = []
    total = counters["total"]
    if not total:
        return out

    if counters["fail"] >= FAILING_THRESHOLD or last_outcome == "fail":
        out.append({
            "kind": "failing",
            "severity": "high",
            "detail": f"최근 {window_days}일간 실패 {counters['fail']}건"
                      + (" · 마지막 실행도 실패" if last_outcome == "fail" else ""),
        })

    if period:
        expected = window_days / period
        if expected > 0 and total > expected * OVERFREQUENT_FACTOR:
            out.append({
                "kind": "overfrequent",
                "severity": "medium",
                "detail": f"기대 {expected:.1f}회 대비 실제 {total}회 "
                          f"({total / expected:.1f}배) — 트리거가 중복 등록됐을 수 있다",
            })

    if total >= POINTLESS_MIN_RUNS and counters["ok"] == 0 and produced == 0:
        out.append({
            "kind": "pointless",
            "severity": "medium",
            "detail": f"{total}회 실행됐지만 실제 작업(ok) 0회, 산출물 0개 — "
                      f"noop/skip만 반복 중. 이 작업이 계속 필요한지 검토 대상",
        })

    if len(hosts) > 1:
        out.append({
            "kind": "duplicate-host",
            "severity": "high",
            "detail": f"같은 작업을 {', '.join(hosts)} 에서 각각 실행 중 — 중복 작업",
        })

    if status is not None and not active:
        out.append({
            "kind": "stale-registry",
            "severity": "medium",
            "detail": f"registry status='{status}' 인데 실제로는 {total}회 실행됨 — "
                      f"정리가 안 됐거나 registry가 낡았다",
        })

    return out


def evaluate(root, window_days, today):
    with open(os.path.join(root, "ops-calendar", "registry.json"), encoding="utf-8") as f:
        registry = json.load(f)

    by_task, by_task_day = load_runs(root, window_days, today)
    entries = {e["id"]: e for e in registry.get("entries", [])}

    tasks = []
    findings = []

    for task_id, entry in entries.items():
        status = entry.get("status", "")
        active = status == "active"
        period = expected_period_days(entry.get("recurrence"))
        docs_by_host = by_task.get(task_id, {})
        counters, produced, last_at, last_outcome, hosts = summarize(docs_by_host)
        total = counters["total"]

        task_findings = []

        if active and total == 0:
            if period:
                grace = period * SILENT_GRACE_FACTOR + SILENT_GRACE_EXTRA_DAYS
                overdue = window_days >= grace
            else:
                overdue = True  # frequent tasks should always show up
            task_findings.append({
                "kind": "silent",
                "severity": "high" if overdue else "info",
                "detail": (
                    f"registry는 active인데 최근 {window_days}일간 실행 기록이 0건. "
                    + ("기대 주기를 넘겨 침묵 중 — 트리거가 죽었거나 로깅이 아직 안 붙었다."
                       if overdue else "아직 유예기간 안이라 정상일 수 있음.")
                ),
            })

        task_findings += run_findings(counters, produced, last_outcome, hosts,
                                      period, window_days, status, active)

        tasks.append({
            "taskId": task_id,
            "category": entry.get("category"),
            "project": entry.get("project"),
            "scheduleText": entry.get("scheduleText"),
            "status": status,
            "hosts": hosts,
            "counters": counters,
            "produced": produced,
            "lastAt": last_at,
            "lastOutcome": last_outcome,
            "days": by_task_day.get(task_id, {}),
            "findings": task_findings,
        })
        for finding in task_findings:
            findings.append({**finding, "taskId": task_id})

    for task_id in sorted(set(by_task) - set(entries)):
        docs_by_host = by_task[task_id]
        counters, produced, last_at, last_outcome, hosts = summarize(docs_by_host)
        task_findings = [{
            "kind": "unregistered",
            "severity": "medium",
            "detail": f"실행 기록 {counters['total']}건이 있는데 registry.json에 등록되어 있지 않다",
        }]
        # status=None so stale-registry doesn't fire — there is no registry entry to be stale.
        task_findings += run_findings(counters, produced, last_outcome, hosts,
                                      None, window_days, None, True)
        tasks.append({
            "taskId": task_id, "category": None, "project": None,
            "scheduleText": None, "status": "(unregistered)", "hosts": hosts,
            "counters": counters, "produced": produced, "lastAt": last_at,
            "lastOutcome": last_outcome, "days": by_task_day.get(task_id, {}),
            "findings": task_findings,
        })
        for finding in task_findings:
            findings.append({**finding, "taskId": task_id})

    severity_rank = {"high": 0, "medium": 1, "info": 2}
    findings.sort(key=lambda f: (severity_rank.get(f["severity"], 9), f["taskId"]))
    tasks.sort(key=lambda t: (
        severity_rank.get(min((f["severity"] for f in t["findings"]),
                              key=lambda s: severity_rank.get(s, 9), default="zzz"), 9),
        t["taskId"],
    ))

    return {
        "generatedAt": today.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "windowDays": window_days,
        "registryUpdatedAt": registry.get("updatedAt"),
        "totals": {
            "tasks": len(tasks),
            "withFindings": sum(1 for t in tasks if t["findings"]),
            "high": sum(1 for f in findings if f["severity"] == "high"),
            "medium": sum(1 for f in findings if f["severity"] == "medium"),
            "runsLogged": sum(t["counters"]["total"] for t in tasks),
        },
        "findings": findings,
        "tasks": tasks,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--window", type=int, default=14, help="lookback window in days")
    p.add_argument("--repo", default=None)
    args = p.parse_args()

    root = args.repo or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    today = datetime.now(timezone.utc)
    health = evaluate(root, args.window, today)

    out = os.path.join(root, "ops-calendar", "health.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(health, f, ensure_ascii=False, indent=2)
        f.write("\n")

    t = health["totals"]
    print(f"health.json written — {t['tasks']} tasks, {t['runsLogged']} runs logged, "
          f"{t['high']} high / {t['medium']} medium findings")
    for finding in health["findings"]:
        print(f"  [{finding['severity']}] {finding['taskId']}: {finding['kind']} — {finding['detail']}")


if __name__ == "__main__":
    main()
