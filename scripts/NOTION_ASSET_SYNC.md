# Notion → repo asset sync

Pulls images/videos referenced from a Notion page into this repo, self-hosted
(Notion's file links carry expiration timestamps — never link them directly
from a live page) and deduped by content hash so re-syncing a page, or
syncing the same image from two different pages, never saves it twice.

Only one step needs a browser/AI pass per **new** Notion page — extracting
the list of asset URLs, since Notion needs JS to render and can't be curled
directly. Everything after that is plain scripted work with zero extra API
calls, including every re-sync of a page you've already pulled from.

## Usage

1. Open the Notion page in a browser tool, extract asset URLs:
   ```js
   Array.from(document.querySelectorAll('img,video,source'))
     .map(e => e.src).filter(Boolean)
   ```
2. Save one URL per line to a temp file, then:
   ```
   scripts/sync_notion_page.sh /path/to/urls.txt <dest-dir> <prefix> [notion-page-url]
   ```
   e.g.
   ```
   scripts/sync_notion_page.sh /tmp/urls.txt acting/assets actor_photo https://vivid-wave.notion.site/...
   ```
3. Reference the printed local paths in your HTML — never the original URL.

For a single asset, call `scripts/sync_notion_asset.sh <url> <dest-dir> <prefix> [page-url]` directly.

## How dedup works

`scripts/assets_manifest.json` is repo-wide (not per-folder) and records
`{file, hash, sourceUrl, sourcePageUrl, syncedAt}` per saved asset. Before
saving anything, the SHA-256 of the downloaded bytes is checked against
every existing entry — a match means the file is already saved somewhere in
the repo, so the download is discarded and the existing path is printed
instead. This is content-based, not URL-based, so it still catches the same
image reappearing under a different (e.g. re-expired-and-regenerated) URL.

## Files

- `sync_notion_asset.sh` / `_sync_notion_asset.py` — single-URL sync
- `sync_notion_page.sh` — batch wrapper over a file of URLs
- `assets_manifest.json` — the dedup ledger (55 entries backfilled 2026-08-13
  from `game-artist/assets/` and `acting/assets/`, synced earlier that day)
