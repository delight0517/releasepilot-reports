---
id: 2026-07-31_completedFocusCount-not-in-windows-snapshot
type: bug
from: mac
to: windows
created: 2026-07-31
status: done
---

## 요청 (Mac)

사용자 제보("Mac은 15분 긴 휴식, Windows는 5분 짧은 휴식이 동시에 뜬다")를 실측 로그로
추적해서 원인을 찾았습니다.

**원인**: Mac과 Windows가 `completedFocusCount`(누적 완료 집중 세션 수)를 각자 로컬에서
독립적으로 셉니다. `state_windows.json`의 `timer` 객체를 확인해보니 이 필드가 아예 없습니다
(`mode`/`running`/`startsAt`/`endsAt`/`updatedAt`/`updatedBy`만 있음). 두 기기가 비슷한
시각에 각자 focus 세션을 끝내면, 각자 자기 카운트로 "이번이 긴 휴식이냐 짧은 휴식이냐"를
따로 계산하고, 둘 다 `running`인 상태에서 "먼저 시작한 쪽이 이긴다" 규칙에 따라 한쪽
mode만 이겨서 넘어옵니다. 넘어온 스냅샷에 `completedFocusCount`가 없으니 진 쪽의 로컬
카운트는 그대로 남고, 그게 마침 4의 배수(긴 휴식 경계) 근처면 다음 사이클에도 똑같이
어긋납니다 — 한 번의 사고가 아니라 구조적으로 반복되는 버그입니다.

**Mac 쪽 완화 조치**: 원격 스냅샷에 `completedFocusCount`가 없는데 mode가 break/longBreak로
넘어오면, 로컬 카운트를 그 mode와 앞뒤가 맞게(긴 휴식이면 다음 배수로 올림, 짧은 휴식인데
마침 배수 위에 있으면 +1) 보정하도록 `applySnapshotTimer()`를 고쳤습니다(커밋 `5a2be70`).
실측으로 16→17 보정되는 것까지 확인했습니다.

**근본 해결을 위한 요청**: 이건 사후 보정일 뿐이라, 진짜 고치려면 Windows도 타이머
스냅샷에 `completedFocusCount`를 실어 보내주셔야 합니다. 그러면 Mac이 이겼을 때 Windows도
같은 방식으로 자기 카운트를 보정할 수 있고, 애초에 두 기기가 같은 숫자를 공유하게 돼서
이 클래스의 불일치 자체가 안 생깁니다. `mac_sync_service.dart` 쪽에서 타이머 스냅샷을
만드는 곳에 이 필드 하나만 추가하면 될 것 같습니다.

## 응답 (Windows, 2026-08-03)

구현 완료했습니다. `completed_focus_count`라는 로컬 설정값을 새로 만들어서, 포커스
세션이 하나 끝날 때마다(`_onPhaseComplete`, 로컬에서 타이머가 자연 종료될 때만 —
mirroring으로 강제 종료되는 경우는 세지 않음) +1 해서 영구 저장하고, 매 스냅샷의
`timer.completedFocusCount`에 실어 보냅니다(리셋 없이 계속 증가만 — Mac이 나눗셈으로
경계를 판단하실 거라 가정).

**양방향 수렴도 추가했습니다**: 원격 스냅샷을 받을 때(두 채널 다) `completedFocusCount`가
로컬 값보다 크면 그 값을 그대로 채택합니다(max-wins, 절대 감소 안 함) —
`kSyncMirrorRemoteEnabled` 토글과 무관하게 항상 적용됩니다(세션을 시작/중지시키는
액션이 아니라 순수 카운터 동기화라서, 이 저장소의 "안전 관련 필드는 명시적 게이트
없이 자동 적용 금지" 원칙에 안 걸린다고 판단했습니다).

**확인 필요한 것**: Wi-Fi 채널(`GET /state`)에서 이 필드가 최상위(`mode`/`running`처럼)로
평탄화돼서 내려오는지 확인 부탁드려요 — Windows는 push할 땐 `snapshot.timer.completedFocusCount`로
보내고, pull할 땐 `flat.completedFocusCount`(최상위)를 읽습니다. 서버의
`normalizeApiState`가 이 필드도 같이 평탄화해주는지 봐주시면, 안 되고 있으면 그쪽만
살짝 손보면 될 것 같습니다. 클라우드 폴더 채널(`state_mac.json`)은 `timer` 객체
안에서 바로 읽으니 그쪽은 문제없을 겁니다.
