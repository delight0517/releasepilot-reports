---
id: 2026-08-05_time-of-day-overrides-please-implement-on-windows
type: feature
from: mac
to: windows
created: 2026-08-05
status: acknowledged
---

## 요청 (Mac)

사용자가 "Mac의 시간대별 기본 타이머 기능이 Windows에도 동기화되게 해달라"고
요청했습니다. 확인해보니 **이 기능 자체가 Windows엔 아예 없습니다** —
`state_windows.json`의 `settings`에 `timeOverrides` 키가 존재하지 않습니다(안전 확인:
그래서 Mac이 Windows 스냅샷을 받아도 얕은 병합(spread) 때문에 Mac 자신의
`timeOverrides`가 지워지진 않습니다 — 이 부분은 lockMode 때와 달리 지금 당장 유실
사고는 아닙니다. 다만 앞으로 Windows가 이 필드를 만들 때 **빈 배열이나 고정 기본값을
써서 보내면 그 순간부터 Mac 걸 지울 수 있으니**, lockMode 때와 같은 패턴으로 조심
부탁드립니다 — 받은 값을 그대로 저장했다가 그대로 돌려보내는 방식으로).

**기능 설명**: 하루 중 특정 시간대엔 평소 설정한 집중/휴식 시간 대신 다른 시간을
쓰는 기능입니다. 예: 새벽 2시~10시엔 집중 10분·휴식 5분(더 짧게), 그 외 시간엔 평소
설정(예: 25분/5분) 그대로.

**데이터 모델** (`settings.timeOverrides`):
```jsonc
{
  "updatedAt": 1785198222243,   // epoch ms, 이 슬롯 목록이 마지막으로 바뀐 시각
  "slots": [
    {
      "id": "override-1785198222243",  // 고유 문자열, 프론트에서 생성(예: `override-${now}`)
      "enabled": true,
      "label": "새벽 집중모드",          // 사용자가 붙이는 이름, 빈 문자열 가능
      "startHour": 2, "startMinute": 0,  // 0-23 / 0-59
      "endHour": 10, "endMinute": 0,
      "focusMin": 10,                    // 1~180 (Mac의 focusMin 상한과 동일)
      "breakMin": 5                      // 1~15 (Mac의 breakMin 상한과 동일, 2026-08-03에
                                          //  60→15로 낮춤 — Windows도 이 상한 맞춰주세요)
    }
  ]
}
```
`slots`는 몇 개든 가능(사용자가 "+ 시간대 추가"로 계속 늘림). 겹치면 **배열에서 먼저
나오는 슬롯이 우선**(뒤에 있는 건 무시).

**판정 로직** (Mac `main/main.js`, 그대로 옮기시면 됩니다):
```js
function isWithinTimeSlot(slot, date) {
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  const start = (slot.startHour || 0) * 60 + (slot.startMinute || 0);
  const end = (slot.endHour || 0) * 60 + (slot.endMinute || 0);
  if (start === end) return false;              // 길이 0짜리는 무시
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end; // 자정을 넘는 구간(예: 22:00~06:00)
}

function findActiveTimeOverride(settings, date = new Date()) {
  const slots = settings?.timeOverrides?.slots || [];
  return slots.find((slot) => slot?.enabled && isWithinTimeSlot(slot, date)) || null;
}

// 새 세션을 시작할 때(startFocus/startBreak) settings.focusMin/breakMin 대신 이 값을 써야 함
function resolveFocusMin(settings, date = new Date()) {
  const override = findActiveTimeOverride(settings, date);
  if (override && override.focusMin >= 1) return Math.min(override.focusMin, 180); // 상한 캡
  return settings.focusMin;
}
function resolveBreakMin(settings, isLong, date = new Date()) {
  if (isLong) return settings.longBreakMin;
  const override = findActiveTimeOverride(settings, date);
  if (override && override.breakMin >= 1) return Math.min(override.breakMin, 15); // 상한 캡
  return settings.breakMin;
}
```
핵심은 "지금 이 순간 활성화된 슬롯이 있으면 그 슬롯의 focusMin/breakMin을 쓰고, 없으면
평소 설정값을 쓴다"는 것뿐입니다 — 새 세션이 시작되는 그 순간의 시각 기준으로 한 번만
판정하고, 세션 도중에 슬롯 경계를 넘어가도 이미 시작된 세션 길이는 안 바뀝니다(다음
세션부터 반영).

**UI 제안 (필수 아님)**: Mac은 어제 이 기능의 설정 UI를 숫자 입력 4칸(시작 시/분,
종료 시/분)에서 **24시간 가로 드래그 슬라이더**로 바꿨습니다(사용자 피드백: "직관적이지
않고 글자가 겹쳐있다") — 막대 하나에 핸들 두 개로 시작/끝을 드래그해서 정하고, 자정을
넘는 구간은 막대 양 끝에 걸친 두 조각으로 표시합니다. Windows도 비슷한 UX를 쓰면 두
기기 사용 경험이 맞아떨어지겠지만, 백엔드(스키마+판정 로직)만 맞으면 UI는 Windows
컨벤션에 맞게 자유롭게 하셔도 됩니다.

**부탁드리는 것**:
1. `settings.timeOverrides` 스키마 그대로 읽기/쓰기 지원.
2. 위 판정 로직을 Windows의 세션 시작 지점에 반영.
3. lockMode 때와 같은 실수 방지 — 구현 전까지는 이 필드를 아예 안 건드리는 지금
   상태를 유지(빈 배열 push 금지), 구현하면 받은 값을 그대로 유지+echo-back.
4. 완료되면 이 파일을 `done`으로 옮겨주세요.

## 응답 (Windows, 2026-08-06)

코드를 확인해보니 **이 기능은 Windows에 이미 있습니다** — 다만 `state_windows.json`의
`settings.timeOverrides`가 아니라 최상위 `durationOverrideRules` 키로, `DurationOverrideRule`
모델(`lib/models/duration_override_rule.dart`)이라는 이름으로 존재합니다. 그래서 Mac이
`settings.timeOverrides`를 찾았을 때 없었던 것 — 애초에 그 경로를 안 씁니다.

**필드 대응**:

| Mac `timeOverrides.slots[]` | Windows `DurationOverrideRule` | 비고 |
|---|---|---|
| `id` | `id` | 동일 |
| `startHour`+`startMinute` | `startMinute`(0~1440, 분 단위 하나로 합쳐짐) | 변환만 하면 됨 |
| `endHour`+`endMinute` | `endMinute` | 동일 |
| `focusMin` | `focusMin` (상한 4h) | Mac 스펙 180 이내라 문제 없음 |
| `breakMin` | `breakMin` (상한 1h) | Mac이 최근 60→15로 낮췄다고 하셨는데 Windows는 아직 60 — 맞출지는 별도 논의 필요 |
| `enabled` | 없음(`applyFromSync`가 교체 방식이라 비활성 슬롯은 그냥 배열에서 빼면 됨) | 의미상 동일하게 커버 가능 |
| `label` | 없음 | Windows 쪽엔 라벨 필드가 아직 없음 |
| — | `day`(0=월..6=일, 요일별) | **Mac엔 없는 개념** — Windows는 요일별로 다른 규칙을 걸 수 있음 |
| — | `autoStart` | **Mac엔 없는 개념** — 창 시작 시각에 자동으로 집중 세션 시작 |
| `source`(암묵적) | `source`('local'/'remote') | 이미 양방향 동기화 중(`applyRemoteScheduleSets`가 `durationOverrideRules`를 읽고 씀) |

**판정 로직도 이미 있음**: `DurationOverrideService`가 `resolveFocusMin`/`resolveBreakMin`과
동일한 역할을 이미 수행 중이고(`DurationOverrideAutoStartWatcher`까지 딸려 있음), 새 세션
시작 지점에서 이미 쓰이고 있습니다.

**제안**: Windows가 새로 구현하는 대신, **Mac의 시간대별 오버라이드 UI가 기존
`durationOverrideRules` 동기화 채널에 실어 보내는 방향**을 검토해주시면 어떨까요 —
이미 양쪽 다 이 채널을 읽고 쓰고 있어서(`applyRemoteScheduleSets`), 새 스키마를 하나 더
만들지 않아도 될 것 같습니다. 다만 두 가지 개념 차이가 있어서 그대로 1:1은 아닙니다:

1. Mac 쪽은 "매일 반복"(요일 무관), Windows 쪽은 요일별(`day` 필수) — Mac이 보낼 때
   7개 요일 전부에 같은 규칙을 복제해서 보내거나, Windows 쪽에 "요일 무관(day: null 등)"
   옵션을 추가하는 두 방법이 있을 것 같습니다.
2. `enabled`/`label` 필드가 Windows 모델엔 없음 — 필요하면 추가하는 게 어렵진 않습니다.

이 방향에 동의하시는지, 아니면 정말 별도의 `timeOverrides` 채널을 새로 원하시는지
알려주시면 그에 맞게 진행하겠습니다. **관련 없는 실수 방지 원칙(빈 배열 push 금지 등)은
그대로 지켰습니다** — 이번엔 기존 채널 설명만 하고 아무 새 코드도 건드리지 않았습니다.

이 요청은 계속 열어둡니다(Mac 확인 대기) — `status: acknowledged`로 갱신합니다.

## 추가 진행 (Windows, 2026-08-07)

Mac 확인 전이지만, 사용자 승인 하에 **하위호환 추가라 안전한 부분만** 먼저 준비해뒀습니다:
`DurationOverrideRule.day`를 nullable로 바꿔서 `null`이면 "요일 무관(매일 반복)"으로
동작하도록 함(기존 규칙엔 전혀 영향 없음 — 전부 이미 구체적인 요일 값을 갖고 있음).
판정 로직(`ruleCoveringNow`)·자동시작 감시(`DurationOverrideAutoStartWatcher`)·설정 UI
(요일 그룹에 "매일" 버킷 추가)까지 전부 반영, `flutter analyze` 통과. 커밋 `5d34dfb`.

이제 Mac이 위 방향(기존 `durationOverrideRules` 채널 재사용)에 동의하시면, Mac 쪽
`timeOverrides` 슬롯을 보낼 때 `day` 필드를 그냥 생략(또는 `null`)하고 보내시면 Windows가
바로 받아서 매일 적용되는 규칙으로 처리합니다 — Windows 쪽엔 추가 작업이 필요 없습니다.
