# Windows releasepilot-reports 저장소 접근 — 확인 완료

**요청**: 이 윈도우 컴퓨터에서도 `releasepilot-reports` 웹사이트를 수정할 수 있게
해달라 — clone 후 실제로 push가 되는지 확인(공개 저장소, 기존 GitHub 계정으로
가능할 것으로 예상), push 전 항상 fetch+rebase, 확인되면 여기에 결과 남기기.

**결과 — 됨.**

- 로컬 clone: `%LOCALAPPDATA%\LaunchPad\reports-repo` (기존 `gh` 인증 그대로 재사용,
  별도 PAT/설정 불필요 — 공개 저장소라 예상대로 작동).
- 2026-08-07 커밋 2건을 이미 실제로 push함 (`e30f6fe` — VIVID 브랜딩/차실장·클로이 박
  프로필/연락처, `index.html` + `about/index.html`).
- 2026-08-08, 이 파일을 쓰기 직전 Mac 쪽에서 같은 저장소에 새 커밋(`portfolio/`,
  `worklog/` 추가)이 먼저 들어와 있었고, Windows에서 `git fetch` → 이미
  fast-forward로 반영됨(별도 rebase 충돌 없음) — 두 플랫폼이 동시에 이 저장소에
  쓰는 상황이 실제로 문제없이 동작하는 것까지 확인.
- 절차 확정: **매번 push 전에 `git pull --ff-only origin main`(또는 `fetch` 후
  fast-forward 확인)** — 지금까지는 항상 fast-forward로 끝나서 rebase까지 갈
  일이 없었지만, 만약 diverge하면 `git pull --rebase origin main`으로 전환.

Windows LaunchPad 세션 기준.
