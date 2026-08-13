#!/usr/bin/env bash
# sync_notion_page.sh — batch wrapper over sync_notion_asset.sh for a whole
# Notion page's worth of image/video URLs at once.
#
# Usage:
#   scripts/sync_notion_page.sh <urls-file> <dest-dir> <prefix> [source-page-url]
#
# <urls-file>: one asset URL per line (get this list via one browser-tool
#   pass over the Notion page — e.g. document.querySelectorAll('img') —
#   Notion needs JS so this can't be curled directly; that one extraction
#   is the only non-scripted step in the whole pipeline).
#
# Everything else — download, hash, dedupe, rename, manifest update — is
# handled by sync_notion_asset.sh per line, so re-running this on a page
# you've already synced costs nothing extra (existing images are skipped).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <urls-file> <dest-dir-relative-to-repo-root> <prefix> [source-page-url]" >&2
  exit 1
fi

URLS_FILE="$1"
DEST_DIR_REL="$2"
PREFIX="$3"
SOURCE_PAGE_URL="${4:-}"

if [[ ! -f "$URLS_FILE" ]]; then
  echo "Error: urls file not found: $URLS_FILE" >&2
  exit 1
fi

n=0
while IFS= read -r url; do
  [[ -z "$url" ]] && continue
  n=$((n+1))
  "$SCRIPT_DIR/sync_notion_asset.sh" "$url" "$DEST_DIR_REL" "${PREFIX}${n}" "$SOURCE_PAGE_URL"
done < "$URLS_FILE"
