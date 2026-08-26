#!/usr/bin/env python3
"""check_request_queue.py — 크로스세션 요청 큐(requests/)의 방치 건을 찾아낸다.

배경 (2026-08-26, 사용자 제보):
  "텔레그램으로 명령했는데 아무리 기다려도 진행이 안 된다. 맥에서 한 작업이
   윈도우에 전달이 안 되는 것 같다."

  실제로 그렇다. requests/README.md의 큐는 **양쪽 기기에서 세션이 실제로
  시작돼야만** 상대가 요청을 알아차리는 구조라(폴링/cron 없음), 한쪽 PC가
  꺼져 있으면 요청은 open/에 그대로 남는다. 2026-08-22 텔레그램 발송 요청이
  2일간 방치됐던 것이 그 사례이고, 그때 Windows 세션 스스로 "다음부터는 이런
  요청이 오래 방치되지 않도록 세션 시작 스캔에서 더 눈에 띄게 표시하는 게
  좋겠다"는 메모를 남겼다. 이 스크립트가 그 메모의 구현이다.

사용법:
    python3 scripts/check_request_queue.py              # 사람이 읽는 표
    python3 scripts/check_request_queue.py --json       # 기계용 JSON
    python3 scripts/check_request_queue.py --stale-days 3
    python3 scripts/check_request_queue.py --today 2026-08-26   # 테스트용 고정 날짜

종료 코드:
    0 — 방치된 요청 없음
    1 — 임계일수를 넘긴 요청이 있음 (CI/스케줄에서 알림 트리거용)

커밋/push는 하지 않는다 — mark_growth_node.sh와 같은 원칙.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
OPEN_DIR = REPO_ROOT / "requests" / "open"

# 프론트매터에서 뽑아낼 필드 — requests/README.md가 정의한 스키마.
_FIELDS = ("id", "type", "from", "to", "created", "status")


def _parse_front_matter(text: str) -> dict[str, str]:
    """맨 앞 --- ... --- 블록에서 key: value 를 뽑는다.

    프론트매터가 없거나 깨져 있어도 예외를 던지지 않는다 — 큐 점검 도구가
    파일 하나 때문에 멈추면 안 되므로, 못 읽은 필드는 그냥 빠진 채로 둔다.
    """
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    block = text[3:end]
    out: dict[str, str] = {}
    for line in block.splitlines():
        m = re.match(r"\s*([A-Za-z_]+)\s*:\s*(.+?)\s*$", line)
        if m and m.group(1) in _FIELDS:
            out[m.group(1)] = m.group(2)
    return out


def _parse_date(value: str | None) -> _dt.date | None:
    if not value:
        return None
    try:
        return _dt.date.fromisoformat(value.strip())
    except ValueError:
        return None


def scan(today: _dt.date, stale_days: int) -> list[dict]:
    """requests/open/*.md 를 훑어 방치 일수를 계산한다."""
    rows: list[dict] = []
    if not OPEN_DIR.is_dir():
        return rows

    for path in sorted(OPEN_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        fm = _parse_front_matter(text)
        created = _parse_date(fm.get("created"))
        # created 를 못 읽으면 파일명 앞의 날짜를 대신 쓴다(YYYY-MM-DD_slug.md 규칙).
        if created is None:
            created = _parse_date(path.name[:10])

        age = (today - created).days if created else None
        rows.append(
            {
                "file": path.name,
                "id": fm.get("id", path.stem),
                "from": fm.get("from", "?"),
                "to": fm.get("to", "?"),
                "status": fm.get("status", "?"),
                "created": created.isoformat() if created else None,
                "age_days": age,
                "stale": age is not None and age >= stale_days,
                # 응답이 한 번이라도 달렸는지 — 달렸는데도 open 이면 "답은 왔지만
                # 아무도 done 으로 안 옮긴" 유형이라 원인이 다르다.
                "has_reply": "## 응답" in text,
            }
        )

    # 오래 방치된 것부터.
    rows.sort(key=lambda r: (-(r["age_days"] or 0), r["file"]))
    return rows


def _render_table(rows: list[dict], stale_days: int, today: _dt.date) -> str:
    if not rows:
        return f"[{today}] requests/open/ 이 비어 있습니다 — 방치된 요청 없음."

    lines = [
        f"[{today}] 크로스세션 요청 큐 점검 — 임계 {stale_days}일",
        "",
        f"{'방치':>5}  {'경로':<18} {'상태':<13} {'응답':<5} 파일",
        "-" * 78,
    ]
    for r in rows:
        age = "?" if r["age_days"] is None else f"{r['age_days']}일"
        mark = "⚠" if r["stale"] else " "
        route = f"{r['from']}→{r['to']}"
        reply = "있음" if r["has_reply"] else "없음"
        lines.append(f"{mark}{age:>4}  {route:<18} {r['status']:<13} {reply:<5} {r['file']}")

    stale = [r for r in rows if r["stale"]]
    lines.append("")
    if stale:
        lines.append(f"⚠ {len(stale)}건이 {stale_days}일 이상 방치돼 있습니다.")
        lines.append("")
        lines.append("  이 큐는 폴링이 없습니다 — 상대 기기에서 세션이 실제로 시작돼야")
        lines.append("  요청을 알아차립니다. 한쪽 PC가 꺼져 있으면 그동안은 아무 일도")
        lines.append("  일어나지 않습니다(requests/README.md 참고).")
        replied = [r for r in stale if r["has_reply"]]
        if replied:
            lines.append("")
            lines.append(f"  이 중 {len(replied)}건은 응답이 이미 달려 있습니다 —")
            lines.append("  일이 안 된 게 아니라 done/ 으로 옮기는 마무리만 빠진 경우입니다:")
            for r in replied:
                lines.append(f"    · {r['file']}")
    else:
        lines.append(f"✓ {stale_days}일 이상 방치된 요청 없음.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stale-days", type=int, default=3, help="며칠 이상이면 방치로 볼지 (기본 3)")
    ap.add_argument("--json", action="store_true", help="JSON으로 출력")
    ap.add_argument("--today", help="오늘 날짜를 YYYY-MM-DD로 고정 (테스트용)")
    args = ap.parse_args(argv)

    today = _parse_date(args.today) or _dt.date.today()
    rows = scan(today, args.stale_days)

    if args.json:
        print(json.dumps({"checkedAt": today.isoformat(), "staleDays": args.stale_days, "requests": rows},
                         ensure_ascii=False, indent=2))
    else:
        print(_render_table(rows, args.stale_days, today))

    return 1 if any(r["stale"] for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
