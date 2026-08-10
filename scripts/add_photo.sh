#!/usr/bin/env bash
# add_photo.sh — add an image or video to apps/gallery/photos/ + photos.json,
# rejecting exact duplicates by SHA-256 content hash.
#
# Usage:
#   scripts/add_photo.sh <path-to-image-or-video> ["caption text"]
#
# - Supports images (jpg/jpeg/png/gif/webp/heic) and video (mp4/mov).
# - Computes SHA-256 of the source file and compares against every "hash"
#   already recorded in apps/gallery/photos.json. If a match is found, the
#   script exits with an error and does NOT copy the file or touch photos.json.
# - On success: copies the file into apps/gallery/photos/ (renaming on
#   collision) and appends an entry {file, hash, caption, addedAt} to
#   photos.json. Does NOT commit or push — that's a separate step.
#
# Requires: python3 (used for JSON read/write and SHA-256).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GALLERY_DIR="$REPO_ROOT/apps/gallery"
PHOTOS_DIR="$GALLERY_DIR/photos"
PHOTOS_JSON="$GALLERY_DIR/photos.json"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-image-or-video> [\"caption text\"]" >&2
  exit 1
fi

SRC="$1"
CAPTION="${2:-}"

if [[ ! -f "$SRC" ]]; then
  echo "Error: file not found: $SRC" >&2
  exit 1
fi

EXT="${SRC##*.}"
EXT_LOWER="$(echo "$EXT" | tr '[:upper:]' '[:lower:]')"
case "$EXT_LOWER" in
  jpg|jpeg|png|gif|webp|heic|mp4|mov) ;;
  *)
    echo "Error: unsupported file type .$EXT_LOWER (supported: jpg, jpeg, png, gif, webp, heic, mp4, mov)" >&2
    exit 1
    ;;
esac

mkdir -p "$PHOTOS_DIR"
if [[ ! -f "$PHOTOS_JSON" ]]; then
  echo "[]" > "$PHOTOS_JSON"
fi

python3 "$SCRIPT_DIR/_add_photo.py" "$SRC" "$PHOTOS_DIR" "$PHOTOS_JSON" "$CAPTION"
