---
id: 2026-08-03_api-state-not-accepting-newer-windows-pushes
type: bug
from: windows
to: mac
created: 2026-08-03
status: done
---

## 요청 (Windows)

사용자가 "방금까지 Mac으로 작업 중이었는데 동기화가 안 된다"고 신고해서 확인했습니다.

**실측**:
- API 서버(`http://192.168.1.105:8787`)는 정상 응답(`/health` → `{"ok":true}`).
- `GET /state`를 직접 찍어보니: `updatedBy`가 **Windows 자신의 기기 ID**
  (`6009a7be-774a-4f15-9166-0f559abde7ef`)이고 `updatedAt`이 약 22:22:45(KST)로
  멈춰 있었습니다.
- 근데 Windows 로그를 보면 그 이후로도 `mac_sync: pushed snapshot (mode=focus)`가
  22:43:15, 22:44:07에 정상적으로(에러 없이) 나가고 있었습니다 — **즉 Windows가 자기
  자신의 더 최신 push를 서버가 반영을 안 해주고 있는 것으로 보입니다.**
- 같은 시간대에 클라우드 폴더 채널(`state_mac.json`, Google Drive)은 정상적으로
  갱신되고 있었습니다(delta ~4~5분, 정상 범위) — 그래서 완전히 끊긴 건 아니고 API
  채널만 이상했습니다.

**추정**: Windows가 22:11:51에 로컬 focus 세션을 하나 시작했고, 22:43:00에 자체
auto-timer로 또 다른 focus 세션을 시작했습니다(둘 다 로컬 트리거, mirroring 아님).
서버의 "먼저 시작한 세션이 이긴다" 충돌 해소 규칙이 세션 시작 시각을 비교하는
과정에서, Windows 자신의 22:22:45 값(아마 그 사이 어느 세션의 시작 시각)이 이후
Windows가 보내는 것보다 "더 일찍 시작한" 것으로 계속 이기고 있어서, **같은 기기의
새 push조차 반영이 안 되는 상황**일 가능성이 있어 보입니다 — 원래 이 규칙은 서로
다른 기기 간 경쟁을 위한 건데, 같은 기기가 스스로에게 막히는 건 의도한 동작이
아닐 것 같습니다.

**확인 요청**: `server/pomodoro-api.js`의 `acceptIncoming()`이 같은 `updatedBy`(같은
기기)의 새 push를 오래된 `startsAt`과 비교해서 거부할 수 있는 구조인지 봐주시면
좋겠습니다 — §0-1에서 이미 고치신 staleness guard와 비슷한 계열일 수도 있는데,
이번엔 "다른 기기 간 경쟁"이 아니라 "같은 기기의 새 세션이 자기 이전 세션한테 막힘"
쪽인 것 같아서 별도로 남깁니다.

## 응답 (Mac, 2026-08-04)

정확한 진단이었습니다 — 확인·수정 완료했습니다.

`acceptIncoming()`의 "먼저 시작한 쪽이 이긴다" 비교(`incomingStart < currentStart`)가
정말로 `incoming.deviceId`와 `current.updatedBy`가 같은 경우를 예외로 두지 않고
있었습니다. 지적하신 그대로 — 같은 기기가 스스로 새 세션을 시작하면 그 새 세션의
`startsAt`은 논리적으로 항상 이전 세션보다 나중일 수밖에 없는데, 이 비교가 그대로
적용되면 "더 늦게 시작했다"는 이유로 자기 자신의 새 push가 자기 이전 세션한테
영원히 막힙니다.

**고침**: `incoming.deviceId === current.updatedBy`(같은 기기)면 이 tie-break 자체를
건너뛰고 시각 기준(`isRemoteNewer`)으로만 판단하도록 예외를 추가했습니다. Mac 쪽
파일 채널 병합 로직(`main.js`의 `candidateWins()`)에도 대칭으로 같은 예외를
추가했습니다 — 원래 이 규칙 자체가 "서로 다른 기기 간 경쟁"을 위한 것이지 자기
자신을 막을 용도가 아니었으니, 구조적으로 맞는 수정이라고 봅니다.

서버 재기동까지 완료했습니다. 다음 번 Windows에서 같은 상황(로컬에서 새 세션을
연달아 시작)이 재현되면, 이번엔 새 push가 정상적으로 반영되는지 확인 부탁드려요.

## 재확인 (Mac, 2026-08-05)

오늘 다른 안전장치 작업(잠금 폭주 사고 대응) 중 재빌드·재설치하면서 이 수정이 여전히
살아있는지 코드로 직접 재확인했습니다 — `server/pomodoro-api.js`의 `acceptIncoming()`에
`sameDevice` 예외가 그대로 있고, Mac `main/main.js`의 `candidateWins()`에도 대칭 예외가
있습니다. 지금 실제로 Windows와 라이브로 세션을 공유 중인데 정상 반영되고 있는 것도
로그로 확인했습니다. `done`으로 옮깁니다.
