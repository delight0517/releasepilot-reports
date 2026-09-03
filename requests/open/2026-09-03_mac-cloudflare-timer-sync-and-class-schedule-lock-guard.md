---
id: 2026-09-03_mac-cloudflare-timer-sync-and-class-schedule-lock-guard
type: feature
from: mac
to: windows
created: 2026-09-03
status: open
---

## 요청 (Mac)

오늘 Mac Auto Pomodoro에 두 가지를 새로 추가했습니다. Windows(`timer1`)가 당황하지
않게 계약만 먼저 남깁니다 — 구현은 Windows 쪽 판단에 맡깁니다.

## 1. 실시간 타이머 동기화를 Cloudflare 워커로 이관

**As-Is**: 실시간 타이머 상태는 로컬 와이파이(LAN API, port 8787)로만 오갔음.
**To-Be**: 이미 있는 계정 워커 `cloud-account-storage`를 실시간 채널로도 쓴다.

- Base: `https://cloud-account-storage.rogan2534.workers.dev`
- appId: `timer1` (Windows 앱 이름과 동일한 슬롯을 공유 — 새 appId 아님)
- 인증: `username` + `pin`(숫자 4자리). `POST /api/auth {username, pin}` — 계정
  없으면 그 자리에서 자동 생성.
- `POST /api/save {username, pin, appId, payload}` — **payload는 그 appId 슬롯을
  통째로 덮어씀**. Mac은 항상 GET → 자기 키(`macSnapshot`)만 교체 → POST 순서로
  씁니다. Windows도 자기 키만 갈아끼우는 방식으로 맞춰주세요(전체 payload를 새로
  만들어서 보내면 상대 필드가 사라집니다).
- `GET /api/get?username=&pin=&appId=` → `{payload, updatedAt}`.
- Mac이 쓰는 키: `macSnapshot` — 안에 `{ deviceId, timer: {mode, running, startsAt,
  endsAt, updatedAt, updatedBy}, timerUpdatedAt, ... }` (기존 LAN 스냅샷과 같은 모양,
  `getSyncSnapshot()` 참고).
- **Windows가 쓸 키 이름을 정해서 알려주세요.** Mac은 `winSnapshot` /
  `windowsSnapshot` / `pcSnapshot` / `snapshot`을 후보로 훑어서 "내 deviceId가
  아닌 것"을 자동으로 골라 씁니다(`main/timerCloud.js`의 `pickRemoteSnapshot`) —
  이 중 하나를 쓰면 별도 조율 없이 바로 맞습니다.
- 주기: 10초마다 pull+push(heartbeat), 상태 변화 시 즉시 push.
- **Shorter-Wins**: 두 기기가 서로 모른 채 동시에 돌고 있으면(독립 실행 충돌),
  남은 시간(`endsAt`)이 더 짧은 쪽으로 맞춥니다 — 쉬어야 할 시점이 뒤로 밀리지
  않는 방향. Windows도 이 규칙으로 병합해주시면 두 기기가 항상 같은 답에
  수렴합니다(먼저 시작한 쪽이 이기는 기존 규칙과 달리 min()이라 서로 덮어쓰기
  반복이 안 생깁니다).
- 이 채널이 연결되면 **Mac은 기존 LAN(와이파이) 채널을 자동으로 끕니다**
  (`lanChannelEnabled()`) — Windows도 클라우드 채널이 붙으면 LAN 폴링을 끄는 걸
  권장하지만, 필수는 아닙니다(끄지 않아도 서로 다른 채널이라 충돌 안 남).

참고 구현: `pomodoro/main/timerCloud.js`, `pomodoro/CLAUDE.md`의
"실시간 클라우드 타이머 동기화" 섹션.

## 2. 수업 시간표 연동 — 수업 시간엔 잠금 안 걸기

블루클라우드(brainwire) 계정에 이미 로그인돼 있으면, 같은 계정의 "수업 알리미"
앱(`40Evrytime_Reminder`)이 `/api/state`의 `everytimeReminderFullPack` 키에 올려둔
시간표를 읽어서, 지금이 대학 수업 시간이면 **화면 잠금(macOS 기준
lockComputerScreen)을 걸지 않습니다**. 휴식 카운트다운 자체는 평소대로 진행되고,
오직 "화면을 잠그는 행위"만 억제합니다. 사용자가 설정에서 켜야 동작하는
opt-in입니다(`settings.classScheduleGuardEnabled`, 기본 false).

- 읽기 전용 — 수업 알리미 쪽에 아무것도 쓰지 않습니다.
- 데이터 모양: `courses[]` (각 `slots[]`: `weekday`(1=월~7=일), `startMinute`,
  `endMinute`, `specificDate`), `scheduleChanges[]` (`kind`: cancelled/timeOverride/
  restDay/makeup, `dateYmd`, `targetType`, `targetId`, override 필드들) —
  `40Evrytime_Reminder/lib/services/cloud_schedule_sync_service.dart`의
  `buildPayload()`가 원본 계약입니다.
- Windows에 이미 이 기능과 같은 "수업 시간 보호" 개념이 있다면 굳이 새로 만들
  필요 없습니다 — 없다면 참고하시라고 계약만 남깁니다.

참고 구현: `pomodoro/main/classSchedule.js`.

## Mac에서 확인한 것

- 두 기능 모두 프리플라이트(`npm run check`)·기존 스모크 테스트 통과, 로컬
  빌드로 재설치 후 실제 앱에서 클라우드 로그인·시간표 조회(과목 수 표시)까지
  동작 확인.
- 새 appId/새 서버는 만들지 않았습니다 — 기존 `timer1` 슬롯과 기존 brainwire
  계정을 그대로 재사용합니다.
