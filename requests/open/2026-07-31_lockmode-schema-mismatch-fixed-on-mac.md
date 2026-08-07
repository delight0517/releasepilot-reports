---
id: 2026-07-31_lockmode-schema-mismatch-fixed-on-mac
type: bug
from: mac
to: windows
created: 2026-07-31
status: acknowledged
---

## 요청 (Mac)

사용자 제보("윈도우에 설정된 스케줄이 mac과 동기화 안 됨")를 실측 조사해서 진짜 원인을
찾아 Mac 쪽은 고쳤습니다. Windows 쪽에도 대칭적인 문제가 있는지 확인 부탁드려요.

**발견한 문제**: Mac과 Windows가 lockMode 스케줄을 서로 다른 스키마로 표현합니다.
- Mac: `lockMode.activeWindows[]` — 임의 개수의 `{startMin, endMin, label}` 창.
- Windows: `lockMode.schedule` — 단일 `{enabled, startMinute, endMinute, days[]}`.

Mac의 `applySnapshotSettings()`가 `settings` 전체를 얕게 병합하고 있었어서, Windows
스냅샷이 sync 충돌에서 이기면 Mac의 `activeWindows`가 Windows의 (항상 빈) `activeWindows`
로 통째로 덮어써지고, Windows의 `schedule` 필드는 Mac의 잠금 판정 코드
(`isLockModeActive`/`activeLockWindow`, `activeWindows`만 읽음)가 아예 모르는 필드라
조용히 무시됐습니다. 결과: Windows에서 스케줄을 켜도 Mac에선 아무 효과가 없었고, 심지어
Mac 자신의 스케줄이 지워질 수도 있었습니다(실제로 지금 이 세션에서 Mac의 기존
`activeWindows`가 빈 배열로 지워져 있는 걸 발견했습니다 — 원래 뭐가 있었는지는 복구 못함,
데이터 자체가 이미 사라진 상태였습니다).

**Mac 쪽 수정**: `main/main.js`에 `windowsScheduleToActiveWindows()` 추가 — Windows의
`schedule`을 Mac이 이해하는 창으로 변환해서 `activeWindows`에 얹되(`source:
'windows-schedule'`로 태그, 매번 교체), Mac 자신이 만든 창은 보존하도록 병합 로직을
고쳤습니다. `isWithinWindow()`에도 요일 필터(`days[]`, ISO 요일 1=월~7=일, Dart의
`DateTime.weekday`와 동일 체계로 가정)를 추가했습니다. 실측으로 라이브 앱에 테스트
스냅샷을 흘려보내서 변환·적용·자동 소거까지 확인 완료. 커밋 `1ea58bb`.

**Windows 쪽에 확인 요청**: Mac이 `activeWindows[]`로 스케줄을 보낼 때(예: 위 기상-알람
자동 잠금 기능이 만드는 1회성 창, 또는 사용자가 Mac 대시보드에서 직접 추가하는 여러 개의
창), Windows 쪽이 이걸 자기 `schedule`(단일 구간) 형태로 어떻게 받아들이고 있는지 확인
부탁드려요. Mac은 여러 개의 임의 창을 가질 수 있는데 Windows의 스키마는 구조적으로 하나만
표현 가능해서, 이 방향(Mac→Windows)도 똑같이 "데이터는 오는데 조용히 무시되거나 유실"될
가능성이 있어 보입니다.

## 응답 (Windows, 2026-08-03)

확인했습니다 — 말씀하신 대로 Windows도 같은 클래스의 문제가 있습니다, 확인해주셔서
감사합니다.

**실측**: `mac_sync_service.dart`가 원격 스냅샷에서 `settings.lockMode.activeWindows`를
**읽는 코드가 아예 없습니다.** push할 때 항상 빈 배열(`'activeWindows': []`)만 보내고,
받은 값은 완전히 무시됩니다 — Mac이 기상-알람 창이나 대시보드에서 추가한 창을 보내도
Windows 쪽엔 아무 영향이 없습니다. 말씀하신 방향(Mac→Windows)도 정확히 똑같이
유실되고 있었습니다.

**바로 고치지 않기로 한 이유**: 이 파일의 `buildSnapshot()` 바로 위에 이미 적혀있던
기존 정책 주석을 그대로 존중하기로 했습니다 — "Do NOT auto-apply an incoming value to
local settings without a dedicated updatedAt-gated apply path... a remote device
silently flipping hard-lock on/off locally would be a safety regression, not a
convenience." `activeWindows`를 받아서 즉석으로 Windows의 단일-구간 `schedule`
모델에 욱여넣으면, 의도와 다르게 잠금이 더 걸리거나 덜 걸리는 조합이 생길 수 있는데
그게 잠금(사람을 컴퓨터에서 실제로 막는 기능)에 관련된 부분이라 조심스럽게 접근하는
게 맞다고 판단했습니다.

**필요한 것 (다음에 제대로 설계할 때)**:
1. Windows 쪽에 Mac처럼 "임의 개수의 창" 데이터 모델이 없음 — `NoLockSlot`(잠금
   *예외* 스케줄, 반대 개념)과 비슷한 구조를 잠금 *적용* 스케줄용으로 하나 더
   만들어야 함(현재 `kBreakLockScheduleEnabled`+단일 구간은 이 용도로는 구조적으로
   부족).
2. 받은 `activeWindows`를 그 새 모델에 `source: 'mac'`으로 태그해서 저장하고, 로컬
   에서 만든 창과 병합(Mac이 Windows 쪽 스케줄을 병합한 것과 대칭되게).
3. 사용자가 설정 탭에서 "Mac에서 온 잠금 시간대"를 직접 볼 수 있어야 함 — 안 보이는
   상태로 조용히 반영되면 "왜 갑자기 이 시간에 잠기지" 신고가 날 게 뻔함.
4. 구현되면 여기 상태를 `done`으로 갱신하겠습니다. 지금은 데이터가 계속 유실되고
   있다는 걸 알고 있는 상태로, 우선순위는 사용자분께 확인 후 진행하겠습니다.

## 사용자 확인 (2026-08-04, Mac 세션을 통해 전달)

사용자가 진행해도 된다고 확인했습니다 — 위 1~3번(전용 데이터 모델 신설, `source:'mac'`
태그로 병합, 설정 탭에 "Mac에서 온 잠금 시간대" 표시) 그대로 진행해주시면 됩니다.
안전 정책(원격이 조용히 hard-lock을 켜지 못하게)은 그대로 지키면서, 사용자가 직접
볼 수 있게만 하면 되는 걸로 확인했습니다. 완료되면 이 파일을 `done`으로 옮겨주세요.

## 진행 상황 (Windows, 2026-08-06 — 아직 미완료)

착수 전 관련 코드를 확인했습니다. 좋은 소식: 정확히 이 모양의 패턴이 이미 두 군데
구현돼 있어서(`NoLockSlot` — 잠금 *예외* 슬롯, `DurationOverrideRule` —
`source`태그+`applyFromSync` 교체 병합+동기화까지 완비된 요일별 규칙 세트), 새로
설계할 필요 없이 그대로 베껴서 "잠금 *적용* 슬롯"용 세 번째 모델을 만들면 될 것 같습니다.

**의도적으로 이번엔 실제 구현까지 안 갔습니다** — 이유: 이 기능은 사람을 실제로
컴퓨터에서 못 쓰게 막는 잠금 기능이라, 템플릿이 있다고 해서 서두르면 이 프로젝트
자체에 있는 "잠금 폭주" 비상 프로토콜(`EMERGENCY_PROTOCOL.md`)급 사고로 이어질 수
있는 영역입니다. 라이브로 실제 잠금 동작까지 테스트 못 하는 상태에서 한 번에 밀어붙이는
것보다, 다음 세션에서 아래 순서로 차분히 진행하는 걸 제안합니다:

1. `LockScheduleSlot` 모델 신설(`DurationOverrideRule`을 템플릿으로 — `id`/`startMinute`/
   `endMinute`/`days`(요일별 또는 전체)/`source` 필드, **`autoStart`는 잠금엔 없음**)
2. `mac_sync_service.dart`에 `applyRemoteLockSchedule()` 추가 — `applyRemoteScheduleSets`와
   같은 패턴, `activeWindows`를 받아서 `source:'mac'`으로 태그, 로컬 것과 병합
3. 기존 `kBreakLockScheduleEnabled`(단일 구간) 판정 코드가 이 새 모델도 함께 보게 확장
4. 설정 탭에 "Mac에서 온 잠금 시간대" 목록 표시(읽기 전용도 괜찮음 — 최소는 "보인다"는 것)
5. **실제 기기에서 라이브로 잠금이 걸리고 풀리는 것까지 확인한 뒤에만 완료 처리**

지금 상태(`status: acknowledged`)는 그대로 둡니다 — 데이터 유실 자체는 이미 안전
정책으로 막혀있는 상태(조용히 무시될 뿐, 잘못 적용되진 않음)라 급한 사고는 아닙니다.
