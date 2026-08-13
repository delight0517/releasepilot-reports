#!/usr/bin/env bash
# sync_notion_asset.sh — download one asset URL (typically extracted from a
# Notion page's <img>/<video> src by a browser tool, since Notion needs JS
# rendering and can't be scraped by curl alone) into a repo asset folder,
# deduped by SHA-256 content hash against a running manifest.
#
# This is the *scripted* half of the Notion-image workflow: pulling the list
# of source URLs off a Notion page still needs one browser-tool pass per new
# page (Notion requires JS), but everything after that — download, dedupe,
# rename, manifest bookkeeping — is plain deterministic script, zero extra
# AI/API calls. Run it once per URL (loop in the caller for a whole page).
#
# Usage:
#   scripts/sync_notion_asset.sh <url> <dest-dir> <prefix> [source-page-url]
#
# - <url>: direct image/video URL (e.g. a file.notion.so or
#   vivid-wave.notion.site/image/... link — these often carry an expiration
#   timestamp, which is exactly why this script saves a local copy instead
#   of ever hotlinking them from a page).
# - <dest-dir>: where to save the file, e.g. game-artist/assets/artstation
#   (created if missing).
# - <prefix>: filename prefix, e.g. "emoticon" -> emoticon_<hash10>.gif
# - [source-page-url]: optional, recorded in the manifest for provenance.
#
# Manifest: scripts/assets_manifest.json (repo-wide, one file for every
# folder) — an entry's "hash" is checked before every download, so the same
# image linked from two different Notion pages (or re-synced later) is
# recognized and skipped rather than saved twice.
#
# Requires: curl, python3, the `file` command (all already used elsewhere
# in this repo's scripts/).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/assets_manifest.json"

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <url> <dest-dir-relative-to-repo-root> <prefix> [source-page-url]" >&2
  exit 1
fi

URL="$1"
DEST_DIR_REL="$2"
PREFIX="$3"
SOURCE_PAGE_URL="${4:-}"

DEST_DIR="$REPO_ROOT/$DEST_DIR_REL"
mkdir -p "$DEST_DIR"

if [[ ! -f "$MANIFEST" ]]; then
  echo "[]" > "$MANIFEST"
fi

TMP_FILE="$(mktemp)"
curl -sL "$URL" -o "$TMP_FILE"

if [[ ! -s "$TMP_FILE" ]]; then
  echo "Error: download was empty — check the URL is still valid (Notion file links expire)" >&2
  rm -f "$TMP_FILE"
  exit 1
fi

python3 "$SCRIPT_DIR/_sync_notion_asset.py" "$TMP_FILE" "$DEST_DIR" "$MANIFEST" "$PREFIX" "$URL" "$SOURCE_PAGE_URL"
