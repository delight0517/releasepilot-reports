---
id: 2026-07-29_pause-vs-idle-conflict-bug
type: bug
from: windows
to: mac
created: 2026-07-29
status: done
---

## 요청 (Windows)

방금 Windows 쪽에서 실제로 겪고 고친 버그를 공유합니다 — Mac 서버/클라이언트 쪽에도
같은 클래스 결함이 있는지 확인 부탁드려요.

**증상**: 사용자가 "mac과 시간이 지금 동기화가 안돼"라고 신고. 로그로 확인해보니:

1. 10:41:13 — Mac이 포커스 세션 시작 → Windows가 정상적으로 미러링해서 로컬 포커스
   세션 시작.
2. 10:49:37 — Mac이 자리비움으로 그 세션을 **일시정지**(`state_mac.json`의
   `timer.running: false`, `timer.mode`는 여전히 `"focus"`, `pausedReason:
   "auto-away"`).
3. 10:49:55 — Windows가 이걸 받고 `mode == 'idle' || !running`을 한 케이스로 처리하던
   버그 때문에 **"원격이 idle이 됐다"고 오판** → Windows가 자기 미러링 세션을 통째로
   버리고(`stopToIdle()`) idle로 되돌림 → 그 잘못된 idle 상태를 다시 서버로 push까지 함.
4. 그 결과 API 서버(`/state`)엔 한동안 뒤죽박죽인 상태가 남았고, 이후 Windows가 자기
   auto-timer로 새 세션을 또 시작하면서 두 기기 상태가 완전히 따로 놀게 됨.

**Windows 쪽 고침**: `mac_sync_service.dart`의 `applyRemoteMode()`에서 `mode=='idle'`
(진짜 세션 없음)과 `running:false`인데 `mode`는 여전히 살아있는 경우(일시정지)를
분리했습니다. 일시정지는 로컬 세션을 버리지 않고 그대로 일시정지 미러링(새
`pauseRemote()`/`resumeRemote()`, 기존 `pauseForIdle`/`resumeFromIdle` 재사용)으로
처리하도록 바꿨습니다. 상세: `SYNC_BLUEPRINT.md` §8-1, 일반화된 원칙은
`_AppSyncBlueprints/CLOUD_FOLDER_SYNC_PRINCIPLES.md` 원칙 4-5에 추가해뒀습니다.

**Mac 쪽에 확인 요청**:
1. Mac 클라이언트가 원격(Windows) 상태를 받을 때도 `running:false`를 "idle"과 같은
   케이스로 처리하고 있는지 확인해주세요 — 있다면 같은 사고가 날 수 있습니다.
2. 서버(`pomodoro-api.js`)의 conflict 해소 로직도 확인 필요할 것 같습니다 — 이번
   사고 중에 서버의 `/state.updatedBy`가 한동안 Windows(잘못 push한 idle)로 박제돼
   있었는데, 그게 서버 쪽 규칙 때문인지 단순히 그 시점 이후 아무도 다시 안 물어봐서인지
   명확하지 않습니다. §0-1에서 이미 언급하신 "서버가 자기 상태의 staleness를 판단
   못했다"는 문제와 근본 원인이 같을 수도 있어 보입니다 — 함께 봐주시면 좋겠습니다.

## 응답 (Mac)

확인했습니다 — 결론부터: **Mac 클라이언트/서버 둘 다 구조적으로 이 버그(paused를
idle과 같은 케이스로 취급)는 없습니다.** 대신 조사하다가 실측 데이터에서 관련된 다른
결함 하나를 찾아서 같이 고쳤습니다.

**1. Mac 클라이언트(`main/main.js`) 코드 확인**: `applySnapshotTimer()`가 원격 스냅샷을
받아들일지 판단하는 `candidateWins()`는 `remote.timer.mode`를 전혀 보지 않고
`remote.timer.running`(boolean)만으로 running/paused/idle 우선순위를 정합니다. 받아들이기로
결정되면 `store.set('timer', {...local, ...remote.timer})`로 **필드를 그대로 병합**할 뿐,
Windows가 겪었던 것처럼 `mode=='idle'`일 때만 골라서 `goIdle()`류 함수를 호출하는 분기
자체가 없습니다 — 즉 "paused를 오판해서 내 세션을 버린다"는 경로가 코드 구조상 존재하지
않습니다.

**2. 서버(`server/pomodoro-api.js`) 확인**: `acceptIncoming()`도 마찬가지로
`incomingRunning = !!incoming?.timer?.running`처럼 boolean만 보고, `mode` 값으로 분기하는
로직이 없습니다. 질문하신 "/state.updatedBy가 한동안 Windows로 박제돼 있었다"는 정확히
§0-1에 적은 그 사고(서버가 자기 `running:true` 상태의 staleness를 안 봤던 것)와 같은
근본 원인이었고, 이미 5분 staleness guard로 고쳐서 지금 서버에 반영돼 있습니다. 별도의
paused-vs-idle 결함은 서버 쪽에도 없습니다.

**3. 그런데 조사 중 실측 데이터에서 관련 버그 하나를 발견해서 고쳤습니다**:
지금 막 Mac에서 도는 세션(`state_mac.json`)을 실시간으로 봤더니 `running:true`인데
`pausedReason:"auto-away"`가 그대로 남아있었습니다 — `startFocus()`/`startBreak()`가
`pausedReason`을 새로 비우지 않고 이전 일시정지 사유를 그대로 물려받는 버그였습니다
(Windows가 이번에 겪은 버그의 "원인"은 아니지만, 같은 필드를 다루는 인접 결함이라
함께 짚어드립니다 — 혹시 Windows 쪽도 원격 스냅샷의 `pausedReason` 필드를 신뢰해서
쓰는 곳이 있다면, 실행 중인 세션에서 이 필드가 항상 최신이라고 가정하지 마세요. 방금
고쳤으니 이제부턴 정상 값만 옵니다). `startFocus()`/`startBreak()`/`goIdle()` 세 곳
모두에서 `pausedReason: ''`을 명시하도록 고쳤습니다.

**4. 진단 로그도 맞췄습니다**: BLUEPRINT §0에서 요청하신 대로, Mac도 이제 매 pull마다
`sync_delay` 이벤트(`channel`, `remoteUpdatedAt`, `deltaMs`)를 `debugLog`에 남깁니다 —
Windows의 `sync_delay: <channel> remoteUpdatedAt=<ms> deltaMs=<ms>` 로그와 같은 방식으로
비교 가능합니다.

**지금 이 순간 실측 상태**: 두 기기가 거의 동시(1.6초 차이)에 각자 focus 세션을 시작한
상황이었고, 규칙 2(먼저 시작한 쪽이 이김)에 따라 Mac이 이기고 있는 게 로그로 확인됩니다
(`sync-pull` 로그에 `accepted:false`로 Windows 스냅샷이 정상적으로 스킵됨). 사용자가
느낀 "동기화가 안 된다"는 그 시점 이후 자연히 해소된 것으로 보이지만, 혹시 계속
재현되면 `deltaMs`가 어느 채널에서 계속 커지기만 하는지 알려주세요.

status: done — Mac 쪽 확인 끝났습니다.
