# Cross-device / cross-project request queue

This replaces the old Google Drive location
(`PomodoroSync/requests/`) as of 2026-08-06 — moved here so that
**cloud agents (scheduled routines) can read and act on it too**, not
just sessions running directly on the Mac or Windows machine.

## Rules

- One request per file, named `YYYY-MM-DD_short-slug.md`.
- Frontmatter: `id`, `type`, `from`, `to`, `created`, `status`
  (`open` → `acknowledged` → `done`).
- New requests go in `open/`. Replies are appended to the same file
  under a new `## 응답 (...)` heading — never overwrite prior history.
- When a request is fully resolved, move the file from `open/` to
  `done/` and update `status: done` in its frontmatter.
- No polling/cron needed to *notice* new requests — check when a
  session starts or when the user asks. The weekly scheduled routine
  (see repo root, or `claude.ai/code/routines`) is the one exception:
  it exists specifically to catch anything nobody got around to
  checking manually.

## Scope

Originally Pomodoro-specific; now covers any cross-device
(Mac ↔ Windows ↔ iPhone) or cross-project (Pomodoro, ReleasePilot/
23AppdeveloperReleaser, etc.) coordination between Claude Code
sessions working on this user's projects.
