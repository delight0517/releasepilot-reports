#!/usr/bin/env python3
"""Helper invoked by add_photo.sh — does the hash/dedup/copy/JSON-append work.
Not meant to be run directly; see add_photo.sh for the user-facing CLI.
"""
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    if len(sys.argv) < 4:
        print("internal error: expected src, photos_dir, photos_json[, caption]", file=sys.stderr)
        sys.exit(2)

    src = sys.argv[1]
    photos_dir = sys.argv[2]
    photos_json_path = sys.argv[3]
    caption = sys.argv[4] if len(sys.argv) > 4 else ""

    with open(photos_json_path, "r", encoding="utf-8") as f:
        try:
            photos = json.load(f)
        except json.JSONDecodeError:
            photos = []
    if not isinstance(photos, list):
        photos = []

    new_hash = sha256_of(src)

    for p in photos:
        if isinstance(p, dict) and p.get("hash") == new_hash:
            print(
                f"Error: duplicate content detected — this file's SHA-256 already matches "
                f"'{p.get('file')}' (added {p.get('addedAt', 'unknown date')}). "
                f"Aborting without copying or modifying photos.json.",
                file=sys.stderr,
            )
            sys.exit(1)

    base = os.path.basename(src)
    name, ext = os.path.splitext(base)
    dest_name = base
    counter = 1
    while os.path.exists(os.path.join(photos_dir, dest_name)):
        counter += 1
        dest_name = f"{name}-{counter}{ext}"

    dest_path = os.path.join(photos_dir, dest_name)
    shutil.copy2(src, dest_path)

    entry = {
        "file": dest_name,
        "hash": new_hash,
        "caption": caption,
        "addedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    photos.append(entry)

    with open(photos_json_path, "w", encoding="utf-8") as f:
        json.dump(photos, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Added: {dest_name} (hash {new_hash[:12]}...)")
    print(f"Updated {photos_json_path}")
    print("Note: not committed/pushed — run git add/commit/push yourself when ready.")


if __name__ == "__main__":
    main()
