# ops-calendar — 반복 작업 캘린더

이 PC 전체(클라우드 루틴 + Windows 예약 작업)에 걸친 주기적 자동화를 한곳에서 보기
위한 정적 페이지. `index.html`이 같은 폴더의 `registry.json`을 fetch해서 월간
캘린더 + 산출물/인프라 목록으로 렌더링한다.

## 원본 vs 미러

**원본(source of truth)**: `23_app_Releaser/.claude/schedule_registry.json` (로컬 전용,
git에 안 올라감). 이 폴더의 `registry.json`은 그 파일의 **미러 사본**이다.

**새 반복 작업(클라우드 루틴, Windows 예약 작업 등)을 만들거나 없앨 때마다**:
1. `23_app_Releaser/.claude/schedule_registry.json`에 entry를 추가/삭제(또는
   `status`를 `"removed"`로 변경).
2. 그 내용을 그대로 이 폴더의 `registry.json`에도 복사.
3. `git add ops-calendar/registry.json && git commit && git push` (이 저장소 전체를
   건드릴 필요 없이 이 파일 하나만).

두 파일이 어긋나면(로컬만 갱신하고 미러를 깜빡하면) 캘린더 페이지와 주간 텔레그램
다이제스트가 낡은 정보를 보여준다 — 반드시 같이 갱신할 것.

## registry.json 스키마

`entries[]`의 각 항목:
- `id`, `category` (`"report"` 산출물 / `"infra"` 인프라), `project`, `source`,
  `scheduleText` (사람이 읽는 설명), `recurrence` (캘린더 계산용 기계 필드 —
  `{type:"daily"}` / `{type:"weekly", weekday:0-6, hour, minute}` /
  `{type:"interval", days:N, anchorDate:"YYYY-MM-DD", weekday?}` /
  `{type:"frequent"}` = 캘린더에 점 안 찍음, 목록에만 표시), `purpose`,
  `status` (`"active"` / `"disabled — ..."` / `"removed"`).

## 주간 텔레그램 다이제스트

`ops-calendar-weekly-digest` 클라우드 루틴(claude.ai RemoteTrigger)이 매주 이
`registry.json`을 읽어서 이번 주에 도는 산출물 작업 요약 + 캘린더 링크를
박새로이 텔레그램 봇으로 발송한다. 등록 시점: 2026-08-20.
