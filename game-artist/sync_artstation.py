#!/usr/bin/env python3
"""game-artist 포트폴리오 ↔ ArtStation 월간 동기화.

1. https://kaito_ren.artstation.com/projects.json 에서 최신 작업 목록 조회
2. 새/변경된 커버 이미지를 game-artist/assets/artstation/auto/<hashId>.jpg 로 저장
3. game-artist/assets/artstation/works.json 갱신 (페이지가 런타임에 읽음)
4. 변경이 있으면 git add/commit/push, 없으면 조용히 종료(noop)
5. ops-calendar 실행 증거를 scripts/oplog.py로 기록 (ok / noop / fail)

Usage:
  python3 game-artist/sync_artstation.py            # 실제 동기화 + 푸시
  python3 game-artist/sync_artstation.py --dry-run  # 비교만 하고 아무것도 안 바꿈
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROFILE_JSON = "https://kaito_ren.artstation.com/projects.json"
AUTO_DIR = os.path.join(REPO, "game-artist", "assets", "artstation", "auto")
WORKS_JSON = os.path.join(REPO, "game-artist", "assets", "artstation", "works.json")
TASK_ID = "artstation-monthly-sync"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")


def fetch_projects():
    # 주의: kaito_ren(언더스코어) 서브도메인은 TLS 호스트명 검증이 실패하므로
    # Python urllib 대신 curl을 1차로 쓴다(이 Mac에서 검증됨). www.artstation.com 직행은
    # Cloudflare 차단이라 여기선 서브도메인 projects.json 엔드포인트를 사용한다.
    r = sh(["curl", "-sf", "--max-time", "90", "-A", UA, PROFILE_JSON])
    if r.returncode == 0 and r.stdout.lstrip().startswith("{"):
        return json.loads(r.stdout)
    req = urllib.request.Request(PROFILE_JSON, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.headers.get_content_type() != "application/json":
            raise RuntimeError("ArtStation이 JSON 대신 %s 반환 (Cloudflare 차단 의심)" % resp.headers.get_content_type())
        return json.load(resp)


def build_doc(data):
    works = []
    for p in data.get("data", []):
        cover = p.get("cover") or {}
        first_img = next((a for a in p.get("assets", []) if a.get("is_image")), {})
        desc = " ".join((p.get("description") or "").split())[:160]
        works.append({
            "title": p.get("title"),
            "url": p.get("permalink"),
            "hashId": p.get("hash_id") or str(p.get("id")),
            "publishedAt": (p.get("published_at") or "")[:10],
            "cover": "assets/artstation/auto/%s.jpg" % (p.get("hash_id") or p.get("id")),
            "w": first_img.get("width"),
            "h": first_img.get("height"),
            "video": "videos/images" in (cover.get("thumb_url") or ""),
            "description": desc,
        })
    from datetime import datetime, timezone, timedelta
    kst = datetime.now(timezone(timedelta(hours=9)))
    return {"syncedAt": kst.isoformat(timespec="seconds"), "source": "https://www.artstation.com/kaito_ren",
            "count": len(works), "works": works}


def download_covers(doc, data):
    os.makedirs(AUTO_DIR, exist_ok=True)
    got = []
    for w in doc["works"]:
        path = os.path.join(REPO, "game-artist", *w["cover"].split("/"))
        if os.path.exists(path) and os.path.getsize(path) > 1024:
            continue  # 이미 있음 — ArtStation CDN URL은 불변이므로 재다운로드 불필요
        proj = next((x for x in data["data"] if x.get("permalink") == w["url"]), None)
        url = ((proj or {}).get("cover") or {}).get("large_image_url")
        if not url:
            continue
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
        with open(path, "wb") as f:
            f.write(body)
        got.append(path)
    return got


def sh(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd or REPO, capture_output=True, text=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="비교만 하고 쓰기/푸시 안 함")
    args = ap.parse_args()

    def oplog(outcome, note="", error=None):
        cmd = ["python3", os.path.join(REPO, "scripts", "oplog.py"), "--task", TASK_ID,
               "--host", "mac", "--outcome", outcome, "--note", note]
        if error:
            cmd += ["--error", error[:500]]
        r = sh(cmd)
        if r.returncode != 0 and not args.dry_run:
            print("oplog 실패:", r.stderr, file=sys.stderr)

    try:
        old_raw = open(WORKS_JSON, encoding="utf-8").read() if os.path.exists(WORKS_JSON) else ""
        old_hashes = {w.get("hashId") for w in json.loads(old_raw).get("works", [])} if old_raw else set()

        data = fetch_projects()
        doc = build_doc(data)
        new_hashes = [w["hashId"] for w in doc["works"] if w["hashId"] not in old_hashes]

        if not doc["works"]:
            oplog("fail", "API는 열렸으나 작업 목록이 비어있음", "empty works list")
            print("FAIL: 작업 목록이 비어있습니다 — 수동 확인 필요"); return 2

        added_files = [] if args.dry_run else download_covers(doc, data)

        changed_works = new_hashes or (json.dumps(json.loads(old_raw).get("works", []), sort_keys=True, ensure_ascii=False)
                                       != json.dumps([{k: v for k, v in w.items()} for w in doc["works"]],
                                                     sort_keys=True, ensure_ascii=False)) if old_raw else True

        if args.dry_run:
            print("[dry-run] ArtStation 작업 %d개 | 신규: %s" % (doc["count"], new_hashes or "없음"))
            return 0

        if not changed_works and not added_files:
            oplog("noop", "신규 작업 없음 (%d개 유지)" % doc["count"])
            print("NOOP: 변경 없음 (%d개)" % doc["count"]); return 0

        with open(WORKS_JSON, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)

        add_targets = ["game-artist/assets/artstation/works.json"] + \
                      [os.path.relpath(p, REPO) for p in added_files] + \
                      [os.path.relpath(os.path.join(REPO, "ops-calendar"), REPO)]
        r_add = sh(["git", "add", "--"] + add_targets)
        r_commit = sh(["git", "commit", "-m",
                       "artstation sync: %s (%d works, +%d new)" % (
                           doc["syncedAt"][:10], doc["count"], len(new_hashes))])
        pushed = False
        if r_commit.returncode == 0:
            r_push = sh(["git", "push"])
            pushed = r_push.returncode == 0
            if not pushed:
                print("push 실패:", r_push.stderr, file=sys.stderr)

        note = "%d개 작업, 신규 %d개%s" % (doc["count"], len(new_hashes),
                                        ", push 완료" if pushed else ", 커밋만(push 실패)")
        oplog("ok" if pushed else "fail", note, None if pushed else "git push failed")
        print("OK:", note)
        for h in new_hashes:
            w = next(x for x in doc["works"] if x["hashId"] == h)
            print("  + [%s] %s — %s" % (w["publishedAt"], w["title"], w["url"]))
        return 0 if pushed else 2
    except Exception as e:
        if not args.dry_run:
            oplog("fail", str(e)[:120], str(e))
        print("FAIL:", e, file=sys.stderr); return 1


if __name__ == "__main__":
    sys.exit(main())
