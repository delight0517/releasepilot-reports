#!/usr/bin/env python3
"""Helper invoked by sync_notion_asset.sh — hash/dedup/save/manifest-append.
Not meant to be run directly; see sync_notion_asset.sh for the CLI.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def detect_ext(path):
    try:
        out = subprocess.run(["file", "-b", "--mime-type", path], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        out = ""
    return {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/heic": "heic",
        "video/mp4": "mp4",
    }.get(out, "bin")


def main():
    if len(sys.argv) < 6:
        print("internal error: expected tmp_file, dest_dir, manifest_json, prefix, source_url[, source_page_url]", file=sys.stderr)
        sys.exit(2)

    tmp_file, dest_dir, manifest_path, prefix, source_url = sys.argv[1:6]
    source_page_url = sys.argv[6] if len(sys.argv) > 6 else ""

    with open(manifest_path, "r", encoding="utf-8") as f:
        try:
            manifest = json.load(f)
        except json.JSONDecodeError:
            manifest = []
    if not isinstance(manifest, list):
        manifest = []

    new_hash = sha256_of(tmp_file)

    for entry in manifest:
        if isinstance(entry, dict) and entry.get("hash") == new_hash:
            os.remove(tmp_file)
            print(f"SKIP already-have {entry.get('file')} (hash {new_hash[:12]}..., first synced {entry.get('syncedAt', '?')})")
            sys.exit(0)

    ext = detect_ext(tmp_file)
    os.makedirs(dest_dir, exist_ok=True)
    dest_name = f"{prefix}_{new_hash[:10]}.{ext}"
    dest_path = os.path.join(dest_dir, dest_name)
    shutil.move(tmp_file, dest_path)

    entry = {
        "file": os.path.relpath(dest_path, os.path.dirname(manifest_path)).replace(os.sep, "/"),
        "hash": new_hash,
        "sourceUrl": source_url,
        "sourcePageUrl": source_page_url,
        "syncedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    manifest.append(entry)

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"NEW {entry['file']} (hash {new_hash[:12]}...)")


if __name__ == "__main__":
    main()
