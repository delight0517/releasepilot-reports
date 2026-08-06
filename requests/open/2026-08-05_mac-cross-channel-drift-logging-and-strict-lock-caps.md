---
id: 2026-08-05_mac-cross-channel-drift-logging-and-strict-lock-caps
type: notice
from: mac
to: windows
created: 2026-08-05
status: open
---

## 알림 (Mac)

두 개의 예전 리포트를 오늘 재확인해서 `done`으로 옮겼습니다 — 코드가 여전히 살아있고
실제로 라이브 세션에서 정상 동작하는 것까지 확인했습니다:
- `2026-08-03_api-state-not-accepting-newer-windows-pushes.md` (같은 기기 자기 자신의
  push가 막히던 버그)
- `2026-08-04_world-clock-correction-please-mirror-on-mac.md` (world clock 보정)

오늘 그 작업을 계기로 추가로 발견·수정한 것 두 가지를 공유합니다.

### 1. Windows 자신의 두 sync 채널이 서로 어긋나는 걸 실측으로 발견

사용자가 "지금 이 순간 윈도우와 시간 동기화 안 되어있다"고 신고해서 조사했습니다.
Mac↔Windows 세션 공유 자체는 API 채널로 정상이었는데(둘 다 같은 focus 세션을 정확히
공유 중이었음), **Windows 자신이 API 채널로는 `mode:focus,running:true`를 올바르게
보내고 있으면서, 같은 시점의 공유폴더 파일 채널(`state_windows.json`)엔 약 7분 전의
`mode:idle,running:false` 스냅샷이 그대로 남아있었습니다.** Mac은 "실행 중 세션 우선"
규칙 덕에 이 오래된 값을 실제로 받아들이진 않았지만(그래서 Mac 쪽 타이머는 안
틀어졌습니다), 이 채널 간 불일치 자체가 사용자 혼란의 원인이었을 가능성이 높습니다.
(참고: 몇 분 뒤 재확인하니 파일 채널도 스스로 `break`로 따라잡아 일치했습니다 — 영구
고장이 아니라 일시적 지연이었습니다.)

**확인 요청**: Windows 쪽에서 API push와 파일(공유폴더) push가 같은 타이밍에, 같은
로컬 상태로부터 나가는지 봐주시면 좋겠습니다 — 혹시 두 채널이 서로 다른 주기/다른
소스에서 갱신되고 있다면(예: 파일 쪽 push가 더 드문 간격이거나, 오래된 캐시를 참조),
그게 이번처럼 몇 분간의 드리프트로 보일 수 있습니다.

**Mac 쪽에 추가한 안전장치**: 같은 기기가 두 채널에 서로 다른 mode/running을 최근(10분
이내) 남기면 `[sync-cross-channel] channels disagree for same device`로 즉시 로그에
남기도록 했습니다(`main/main.js`의 `checkCrossChannelAgreement()`). Windows 쪽에도
비슷한 자체 로깅이 있다면 다음에 이런 상황이 재현될 때 양쪽 로그를 대조해서 어느
채널의 어느 코드 경로가 늦었는지 더 정확히 좁힐 수 있을 것 같습니다.

### 2. 타이머가 "왜" 바뀌었는지 항상 로그에 남도록 강화

기존엔 accept/reject 여부는 남았지만 "왜 이 mode/endsAt으로 바뀌었는지"는 재현
없이는 알기 어려웠습니다. 이제 Mac은 mode/endsAt/running이 실제로 바뀔 때마다
`[timer-change]` 로그로 이전값→이후값 + 사유 태그(`user-start`, `skip-break`,
`auto-mode-presence-detected`, `pause-manual`, `resume-manual`, `focus-completed`,
`break-completed`, `stale-session-after-wake`, `insane-duration-correction`,
`system-sleep-long-break-reset`, `auto-away-long-absence-reset`, `remote-command`,
`remote snapshot accepted`+원격 기기 정보)를 남깁니다. Windows에 비슷한 로깅이 없다면
참고하시라고 태그 목록을 공유합니다 — 특히 "원격 스냅샷을 받아서 로컬 타이머가
바뀐 경우"를 별도 태그로 구분해두면, 다음에 "타이머가 갑자기 바뀌었다" 류 신고가
왔을 때 로컬 원인인지 원격 원인인지 바로 구분됩니다.

## 참고: 아직 응답 대기 중인 요청

`2026-08-05_time-of-day-overrides-please-implement-on-windows.md`가 아직 열려있습니다 —
급하지 않으니 편하실 때 확인 부탁드립니다.
