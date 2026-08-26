#!/usr/bin/env python3
"""check_api_registry.py — 중앙 API 대장을 점검하고, 실수로 커밋된 비밀키를 막는다.

배경 (2026-08-26, 사용자 요청):
  "API도 중앙식으로 전체를 박새로이가 관리해서, 더 이상 내가 관리하거나
   타이핑하지 않아도 되는 시스템"

  중앙 관리는 맞는 방향이지만, **이 저장소는 GitHub Pages로 전 세계에 공개된다.**
  실제 토큰을 여기 두면 그 즉시 유출이다. 그래서 대장(apps/_shared/api_registry.json)에는
  "어떤 키가 어디에 있고 발급됐는지"라는 메타데이터만 두고, 값 자체는 서버 환경변수와
  기기 로컬에 남긴다. 이 스크립트는 그 원칙이 지켜지는지 기계적으로 확인한다.

하는 일:
  1) 대장 스키마 검증 — 필수 필드 누락, 미확인 상태 집계
  2) 비밀키 유출 검사 — 대장에 실제 토큰처럼 보이는 문자열이 들어갔는지 탐지

사용법:
    python3 scripts/check_api_registry.py
    python3 scripts/check_api_registry.py --json

종료 코드:
    0 — 이상 없음
    1 — 스키마 문제 있음
    2 — 비밀키로 보이는 값이 발견됨 (커밋하면 안 됨)
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
REGISTRY = REPO_ROOT / "apps" / "_shared" / "api_registry.json"

REQUIRED = ("id", "label", "usedBy", "storage", "status")
VALID_STATUS = {"issued", "assumed-issued", "not-issued", "revoked"}

# 실제 비밀키의 흔한 형태들. 대장은 메타데이터만 담아야 하므로 하나도 걸리면 안 된다.
SECRET_PATTERNS = [
    ("텔레그램 봇 토큰", re.compile(r"\b\d{8,12}:[A-Za-z0-9_-]{30,}\b")),
    ("OpenAI 계열 키", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")),
    ("GitHub 토큰", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{16,}\b")),
    ("노션 토큰", re.compile(r"\b(secret_|ntn_)[A-Za-z0-9]{20,}\b")),
    ("Google API 키", re.compile(r"\bAIza[A-Za-z0-9_-]{20,}\b")),
    ("Bearer 토큰", re.compile(r"\bBearer\s+[A-Za-z0-9._-]{20,}")),
]


def scan_secrets(text: str) -> list[dict]:
    """토큰처럼 보이는 문자열을 찾는다. 값 자체는 절대 출력하지 않는다."""
    hits: list[dict] = []
    for name, pat in SECRET_PATTERNS:
        for m in pat.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            hits.append({"kind": name, "line": line, "preview": m.group(0)[:6] + "…(가림)"})
    return hits


def check_schema(data: dict) -> tuple[list[str], dict]:
    """필수 필드와 상태값을 확인하고, 요약 통계를 낸다."""
    problems: list[str] = []
    keys = data.get("keys", [])
    if not isinstance(keys, list) or not keys:
        problems.append("keys 배열이 비어 있거나 형식이 잘못됨")
        return problems, {}

    seen: set[str] = set()
    summary = {"total": len(keys), "issued": 0, "assumed": 0, "notIssued": 0, "unverified": [], "unknownStorage": []}

    for i, k in enumerate(keys):
        where = k.get("id") or f"keys[{i}]"
        for field in REQUIRED:
            if not k.get(field):
                problems.append(f"{where}: 필수 필드 '{field}' 누락")

        kid = k.get("id")
        if kid in seen:
            problems.append(f"{where}: id 중복")
        seen.add(kid)

        status = k.get("status")
        if status and status not in VALID_STATUS:
            problems.append(f"{where}: 알 수 없는 status '{status}' (허용: {', '.join(sorted(VALID_STATUS))})")

        if status == "issued":
            summary["issued"] += 1
            # 발급됐다면 언제/어떻게 확인했는지가 있어야 신뢰할 수 있다.
            if not k.get("verifiedAt"):
                summary["unverified"].append(kid)
        elif status == "assumed-issued":
            summary["assumed"] += 1
        elif status == "not-issued":
            summary["notIssued"] += 1

        if k.get("storage") == "unknown":
            summary["unknownStorage"].append(kid)

    return problems, summary


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="JSON으로 출력")
    args = ap.parse_args(argv)

    if not REGISTRY.exists():
        print(f"대장 파일이 없습니다: {REGISTRY.relative_to(REPO_ROOT)}")
        return 1

    raw = REGISTRY.read_text(encoding="utf-8")
    secrets = scan_secrets(raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"JSON 파싱 실패: {e}")
        return 1

    problems, summary = check_schema(data)

    if args.json:
        print(json.dumps({"secrets": secrets, "problems": problems, "summary": summary},
                         ensure_ascii=False, indent=2))
    else:
        print("중앙 API 대장 점검 —", REGISTRY.relative_to(REPO_ROOT))
        print()
        if secrets:
            print(f"🚨 비밀키로 보이는 값 {len(secrets)}건 발견 — 절대 커밋하지 마세요:")
            for s in secrets:
                print(f"   · {s['line']}행 {s['kind']}: {s['preview']}")
            print()
        else:
            print("✓ 비밀키 유출 없음 — 대장에 메타데이터만 들어 있습니다.")

        if problems:
            print(f"\n⚠ 스키마 문제 {len(problems)}건:")
            for p in problems:
                print(f"   · {p}")
        else:
            print("✓ 스키마 이상 없음.")

        if summary:
            print(f"\n키 {summary['total']}개 — 발급확인 {summary['issued']} / "
                  f"발급추정 {summary['assumed']} / 미발급 {summary['notIssued']}")
            if summary["assumed"]:
                print(f"   ⚠ '발급추정'은 근거 없이 작동 중이라 적힌 것들입니다 — 대시보드 확인 필요.")
            if summary["unverified"]:
                print(f"   ⚠ 확인일자 없는 발급건: {', '.join(summary['unverified'])}")
            if summary["unknownStorage"]:
                print(f"   ⚠ 보관 위치 미상: {', '.join(summary['unknownStorage'])}")

    if secrets:
        return 2
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
