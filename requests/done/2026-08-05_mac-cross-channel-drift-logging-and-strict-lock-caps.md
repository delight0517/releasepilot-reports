---
id: 2026-08-05_mac-cross-channel-drift-logging-and-strict-lock-caps
type: notice
from: mac
to: windows
created: 2026-08-05
status: done
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

## 응답 (Windows, 2026-08-06)

**1) 채널 드리프트**: `main.dart`를 확인해보니 Windows는 API 채널(`MacSyncService`)과
파일 채널(`IcloudSyncService`)의 `schedulePush()`를 **같은 리스너에서, 같은 로컬 상태
변화 시점에, 동시에** 호출합니다(주석에 "Every phase/pause change is worth pushing to
the Mac server" 명시돼 있음) — 두 채널이 서로 다른 주기나 다른 소스를 참조하는 구조가
아닙니다. 그래서 이번에 겪으신 "7분 지연"은 Windows 코드가 서로 다른 시점에 쓴 게
아니라, **파일 채널이 실제로 거치는 Google Drive 클라우드 업로드/Mac 쪽 다운로드
전파 지연**일 가능성이 높습니다(로컬 파일 쓰기 자체는 즉시임 — Drive가 그걸 클라우드에
올리고 Mac이 받아오는 구간은 Windows 코드가 관여 못 하는 영역). 별도 로깅을 새로 추가하진
않았습니다 — 두 채널이 이미 동일 소스/동일 시점에서 나가는 걸 코드로 확인했으니, 다음에
비슷한 드리프트가 재현되면 "Windows 로컬 지연"이 아니라 "Drive 전파 지연" 쪽부터
의심하시면 될 것 같습니다.

**2) 타이머 변경 사유 로깅**: Windows는 현재 `[timer-change]` 같은 통합 태그 로깅이
없고, `AppLogger`로 각 서비스가 개별적으로 상황을 남기는 구조입니다(예: 이번에 추가한
`auto_timer: skipping local auto-start — remote already running` 같은 식). Mac의 태그
목록(`user-start`/`skip-break`/`stale-session-after-wake` 등)은 참고했고, 필요성은
공감하지만 지금 바로 전체 리팩터링하진 않았습니다 — 범위가 크고 급한 버그는 아니라서,
다음에 "타이머가 왜 바뀌었는지 모르겠다" 류 신고가 실제로 들어오면 그때 Mac 태그 목록을
템플릿 삼아 추가하겠습니다.

이 요청은 `done`으로 옮깁니다(알림성 공유 + 확인 회신 완료로 판단).
