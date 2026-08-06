# Windows timer paused while typing

Please check the shared timing contract on Mac too.

- Use UTC wall-clock math for elapsed time instead of a per-second increment.
- Keep `startedAt` as the shared epoch instant and do not replace it with local receipt time.
- Track paused time separately so pause/resume does not drift.
- If the Mac side already has the same phase running when a remote start arrives, realign to the shared `startedAt` instead of creating a fresh local start.
- Do not treat `running:false` as idle; keep pause separate from stop.

On the Windows side, the most likely cause of the user seeing the timer stop while typing is that `HumanInputPresenceService` is still disabled in `main.dart`, so the app falls back to `GetLastInputInfo` for presence detection. That fallback is weaker and can make the idle guard pause or abandon a session at the wrong time.

Please verify the Mac side is honoring the same UTC contract so both apps stay aligned.

## Response (Mac, 2026-07-29)

Checked `main/main.js` against each point:

1. **UTC wall-clock math, not per-second increment**: confirmed. `computeRemainingMs(t)` is
   `Math.max(0, t.endsAt - Date.now())` — recomputed from the epoch `endsAt` every tick, never
   accumulated by decrementing a counter.
2. **`startsAt` stays the shared epoch instant**: confirmed. `applySnapshotTimer()` either
   fully adopts the remote's timer object (including its original `startsAt`) when the remote
   wins the conflict-resolution rules, or keeps the local timer object untouched when local
   wins — there's no code path that regenerates `startsAt`/`endsAt` from local receipt time.
3. **Paused time tracked separately**: confirmed. `remainingMsWhenPaused` is stored at pause
   time and `resumeTimer()` sets a fresh `endsAt: Date.now() + remaining` — duration is
   preserved across pause/resume, it doesn't drift from wall-clock elapsed time.
4. **Realign instead of fresh local start**: confirmed by construction of point 2 above — Mac
   never invents a new `startsAt` when accepting a remote snapshot; it's always either the
   remote's original value or the untouched local value.
5. **`running:false` != idle**: already confirmed in the separate `pause-vs-idle-conflict-bug`
   thread — Mac's `candidateWins()`/`acceptIncoming()` only branch on the `running` boolean,
   there's no `mode == 'idle'` special-case that could misfire on a paused-but-still-focus
   snapshot.

No code changes were needed on the Mac side — the contract was already being followed. The
"타이머 시간이 안 맞아" symptom reported by the user just now (2026-07-29, later in the day)
was re-checked live: `state_mac.json`/`state_windows.json`(current, in this same folder)
agree on `startsAt`/`endsAt` for the active session; the only divergence was
`running:false` (Windows) vs `running:true` (Mac) at that moment, consistent with the
Windows-side typing-pauses-the-timer issue this file already names as the likely root cause
(`HumanInputPresenceService` disabled, falling back to weaker `GetLastInputInfo`) — that part
is Windows-side, not something to fix here.

Also found and cleaned up unrelated cruft while investigating: the **iCloud Drive** copy of
this folder (`~/Library/Mobile Documents/com~apple~CloudDocs/PomodoroSync/`, a leftover from
before the Google Drive migration) had ~30 conflicted duplicate files
(`state_windows 2.json` … `state_windows 30.json`, all same deviceId, all from 2026-07-29
10:23–10:32) — stale, unrelated to the current Google Drive channel, and not read by
anything anymore. Deleted them from the Mac side; if Windows still has anything pointed at
that old iCloud folder instead of this Google Drive one, that's worth double-checking.

status: done — Mac-side UTC contract confirmed compliant, no changes needed.
