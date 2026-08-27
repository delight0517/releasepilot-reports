#!/usr/bin/env python3
"""
generate_sitemap.py — releasepilot-reports 사이트맵 자동 생성

왜 필요한가 (2026-08-27):
  사이트맵이 손으로 관리되다 보니 실제 페이지 42개 중 18개만 들어있었다(누락 27개,
  dev-portfolio/apps/* 등 핵심 페이지 다수 포함). 이 스크립트는 리포지토리를 직접
  스캔해서 실제 존재하는 모든 index.html을 찾고, 아래 규칙으로 걸러 sitemap.xml을
  다시 만든다:
    - <meta name="robots" content="...noindex..."> 가 있는 페이지는 제외
      (사이트 운영자가 의도적으로 비공개 처리한 상담/개인 컨설팅류 페이지 존중).
    - .git, node_modules, scripts, docs, requests(내부 크로스세션 채널), _shared,
      growth/*/checkin_state.json류 데이터 파일은 애초에 index.html이 아니라 대상 아님.
    - lastmod은 git 마지막 커밋 시각(없으면 파일 mtime)을 사용.
  실행: python generate_sitemap.py [--write]
  --write 없이 실행하면 미리보기(diff)만 보여주고 파일은 안 건드린다.
"""
import argparse
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BASE_URL = "https://delight0517.github.io/releasepilot-reports"

EXCLUDE_DIRS = {".git", "node_modules", "scripts", "docs", "requests", "_shared", ".github"}


def is_noindex(html_path: Path) -> bool:
    try:
        text = html_path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False
    m = re.search(r'<meta[^>]+name=["\']robots["\'][^>]*content=["\']([^"\']*)["\']', text, re.I)
    return bool(m and "noindex" in m.group(1).lower())


def git_lastmod(rel_path: str) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(REPO), "log", "-1", "--format=%cI", "--", rel_path],
            capture_output=True, text=True, timeout=10,
        ).stdout.strip()
        if out:
            return out[:10]
    except Exception:
        pass
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# reports/ 는 날짜 스냅샷이 51개+ 쌓이는 폴더라 전부 자동 포함하면 사실상 중복/
# 유사 콘텐츠 범람이 된다. 사이트 운영자가 이미 sitemap.xml에 손으로 골라 넣은
# reports/*.html 항목은 "의도적 큐레이션"으로 보고 그대로 유지만 하고, 새로 자동
# 추가하지는 않는다 (원하면 --write 후 손으로 sitemap.xml에 추가할 것).
def existing_curated_report_urls(old_sitemap_text: str):
    return sorted(u for u in re.findall(r"<loc>([^<]+)</loc>", old_sitemap_text) if "/reports/" in u)


def discover_urls():
    urls = []
    for index_html in sorted(REPO.rglob("index.html")):
        rel = index_html.relative_to(REPO)
        parts = rel.parts
        if any(p in EXCLUDE_DIRS for p in parts):
            continue
        if is_noindex(index_html):
            continue
        url_path = "/".join(parts[:-1])
        loc = f"{BASE_URL}/{url_path}/" if url_path else f"{BASE_URL}/"
        urls.append((loc, git_lastmod(str(rel).replace(os.sep, "/"))))

    # articles/ 아래 개별 글(.html)은 index.html이 아니어도 공개 콘텐츠이므로 포함.
    articles_dir = REPO / "articles"
    if articles_dir.is_dir():
        for html_file in sorted(articles_dir.glob("*.html")):
            if html_file.name == "index.html" or is_noindex(html_file):
                continue
            rel = html_file.relative_to(REPO)
            loc = f"{BASE_URL}/{str(rel).replace(os.sep, '/')}"
            urls.append((loc, git_lastmod(str(rel).replace(os.sep, "/"))))
    return urls


def render(urls):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in urls:
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="sitemap.xml에 실제로 쓴다")
    args = ap.parse_args()

    sitemap_path = REPO / "sitemap.xml"
    old_content = sitemap_path.read_text(encoding="utf-8") if sitemap_path.exists() else ""

    urls = discover_urls()
    # 기존에 손으로 큐레이션된 reports/*.html 항목은 lastmod만 최신화해서 그대로 이어붙인다.
    for loc in existing_curated_report_urls(old_content):
        rel = loc.split(f"{BASE_URL}/", 1)[-1]
        urls.append((loc, git_lastmod(rel)))
    urls.sort(key=lambda t: t[0])
    new_content = render(urls)

    print(f"발견된 색인 대상 페이지: {len(urls)}개")
    old_locs = set(re.findall(r"<loc>([^<]+)</loc>", old_content))
    new_locs = {u for u, _ in urls}
    added = sorted(new_locs - old_locs)
    removed = sorted(old_locs - new_locs)
    if added:
        print(f"\n+ 새로 추가됨 ({len(added)}):")
        for u in added:
            print("   +", u)
    if removed:
        print(f"\n- 제거됨 ({len(removed)}):")
        for u in removed:
            print("   -", u)
    if not added and not removed:
        print("변경 없음 — 이미 최신 상태.")

    if args.write:
        sitemap_path.write_text(new_content, encoding="utf-8", newline="\n")
        print(f"\n작성 완료: {sitemap_path}")
    else:
        print("\n(미리보기 모드 — 실제로 쓰려면 --write)")


if __name__ == "__main__":
    main()
