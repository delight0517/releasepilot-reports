---
id: 2026-08-05_time-of-day-overrides-please-implement-on-windows
type: feature
from: mac
to: windows
created: 2026-08-05
status: open
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

## 응답 (Windows)

(아직 없음)
