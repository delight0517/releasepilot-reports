# 하트비트 실행 모니터링 시스템 (ops-heartbeat)

작성: 2026-08-26 · 사용자 요청("맥과 윈도우 합쳐서 한곳에서 실제 작업 상황 및 결과
보고를 받고, 반복 작업 중 쓸데없는 것 / 횟수 과한 것 / 실제로 작동하지 않은 것을
모니터링하고 싶다")

## 왜 필요한가 — 이미 난 사고

`ops-calendar/registry.json`에는 "**무엇이 언제 돌기로 되어 있는가**"가 있다.
그런데 "**실제로 돌았는가**"는 이 저장소 어디에도 없었다. 그 결과:

- `yena-career-checkin`이 죽은 trigger id(`trig_01VkGtf8...`)에 물려 있어서
  **매일 09:00 체크인이 한 번도 실제로 실행되지 않았는데 한 달 가까이 아무도
  몰랐다** (2026-08-24에야 발견, registry.json의 `sourceNote` 참고).
- `launchpad-telegram-inbox-poll`은 CLAUDE.md가 "동작 중"이라고 서술하지만
  실제 Windows에서는 Disabled 상태였다 (2026-08-20 발견).

두 사고 모두 원인이 같다: **등록 정보만 있고 실행 증거가 없다.** 캘린더는
"돌 예정"을 그려줄 뿐, 안 돌아도 똑같이 예쁘게 그려준다.

## 설계 원칙

이 저장소의 대원칙(정적 파일 + git만, 서버 없음, 라이브 API 키 없음)을 유지한다.
따라서 실행 기록은 **DB가 아니라 커밋되는 파일**이고, 대시보드는 그 파일을
fetch해서 그리는 정적 페이지다.

세 가지 역할을 분리한다:

| 역할 | 누가 | 쓰는 것 | 충돌 위험 |
|---|---|---|---|
| **기록(write)** | 각 기기·루틴이 실행 직후 | `ops-calendar/runs/<날짜>/<taskId>__<host>.json` | 없음 — 파일명에 host가 있어 기기끼리 같은 파일을 안 건드림 |
| **집계(evaluate)** | 주간 모니터 루틴 하나만 | `ops-calendar/health.json` | 없음 — 단일 writer |
| **표시(read)** | `ops-calendar/health.html` | 위 두 파일 fetch | 읽기 전용 |

기록은 여러 곳에서 동시에 일어나므로 **절대 공유 파일에 append하지 않는다**
(JSONL 한 파일에 Mac/Windows가 같이 append하면 git 충돌이 상시 발생한다).
파일을 쪼개서 충돌 자체를 구조적으로 없앤다.

## 실행 기록 스키마

경로: `ops-calendar/runs/<YYYY-MM-DD>/<taskId>__<host>.json`
(`host` = `mac` | `windows` | `cloud`)

```json
{
  "date": "2026-08-26",
  "taskId": "yena-brand-ops-biweekly",
  "host": "cloud",
  "counters": { "total": 1, "ok": 1, "noop": 0, "skip": 0, "fail": 0 },
  "firstAt": "2026-08-26T10:06:37Z",
  "lastAt":  "2026-08-26T10:06:37Z",
  "runs": [
    {
      "at": "2026-08-26T10:06:37Z",
      "outcome": "ok",
      "durationMs": 42100,
      "exitCode": 0,
      "produced": ["reports/rogan-brand_ops_biweekly-1787738797548.html"],
      "note": "9 open items, 0 stale",
      "error": null
    }
  ]
}
```

같은 날 같은 작업이 여러 번 돌면 같은 파일의 `runs[]`에 누적된다(상세는 최근
50건만 유지, `counters`는 전체 누적). 고빈도 작업이 저장소를 폭파시키지 않게 하는
장치다.

### outcome 값 — 이게 모니터링의 핵심

| 값 | 뜻 | 이걸로 잡아내는 것 |
|---|---|---|
| `ok` | 실제로 일했고 산출물이 있음 | 정상 |
| `noop` | 정상 실행됐지만 할 일이 없어서 아무것도 안 함 | **쓸데없는 반복 작업** — noop만 계속 쌓이면 그 작업은 존재 이유가 없다 |
| `skip` | 게이트에 걸려 의도적으로 건너뜀(주기 미달, 무활동 휴면) | 정상이지만 skip만 영원히면 게이트가 잘못 잠긴 것 |
| `fail` | 에러로 죽음 | **실제로 작동하지 않음** |

`ok`와 `noop`을 구분하는 게 중요하다. 둘 다 "에러 없이 끝남"이지만, noop만
반복되는 작업은 매주 토큰과 실행 시간을 쓰면서 아무 가치도 만들지 않는다 —
사용자가 말한 "쓸데없는 반복 작업"이 정확히 이것이고, 로그가 없으면 절대
드러나지 않는다(조용히 성공하는 것처럼 보이기 때문에).

## 집계 — 무엇을 문제로 판정하는가

`scripts/ops_health.py`가 `registry.json`(기대)과 `runs/`(실제)를 대조해
`health.json`을 만든다. 판정 종류:

| finding | 조건 | 사용자 요구 중 |
|---|---|---|
| `silent` | registry에 `active`인데 유예기간(기대 주기 × 2 + 1일) 안에 실행 기록이 **0건** | "실제로 작동하지 않았거나" ← yena 사고 재발 방지 |
| `failing` | 최근 창에서 `fail`이 2건 이상, 또는 마지막 실행이 fail | "실제로 작동하지 않았거나" |
| `overfrequent` | 실제 실행 횟수가 기대 횟수의 3배 초과 | "횟수가 과하거나" |
| `pointless` | 최근 창에서 실행은 됐는데 `ok`가 0건이고 산출물도 0개 (noop/skip만) | "쓸데없는 것들" |
| `duplicate-host` | 같은 taskId를 **서로 다른 host 2곳 이상**이 실행 | 맥/윈도우 중복 작업 |
| `unregistered` | 실행 기록은 있는데 registry에 없는 taskId | 유령 작업 |
| `stale-registry` | registry에 있는데 `status`가 active가 아닌 채로 계속 실행됨 | 정리 누락 |

`duplicate-host`는 사용자가 같은 날 별도로 요청한 "맥에서 한 것을 윈도우에서
또 하는 사고를 막는 수단"과 직접 연결된다 — 중복이 **사후에** 로그로 드러나는
레이어다(사전 차단은 별도 설계 필요, 아래 "아직 안 한 것" 참고).

## 기록하는 방법 — 기기별

### 1) 클라우드 루틴 (claude.ai Routine)

루틴 프롬프트 끝에 한 줄 추가한다. 저장소 클론 안에서 실행되므로 그냥 스크립트를
부르면 된다:

```bash
python3 scripts/oplog.py --task <taskId> --host cloud --outcome ok \
  --note "9 open items" --produced reports/<파일명>.html
```

`--commit`을 붙이면 기록 파일까지 같이 커밋+푸시한다. 리포트 커밋에 함께 실으려면
`--commit` 없이 호출하고 본 커밋에 `git add ops-calendar/runs`를 포함시킨다.

### 2) Windows 예약 작업

`scripts/oplog.ps1`이 **명령을 감싸서** 실행한다. 작업이 스스로 로깅을 기억할
필요가 없다는 게 핵심 — 예약 작업의 실행 명령만 아래로 바꾸면 된다:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\oplog.ps1 `
  -TaskId brainwire-weekly-quality-audit -Repo C:\path\to\releasepilot-reports `
  -- node enqueue_quality_audit.js
```

래퍼가 종료 코드·소요 시간·stdout 마지막 줄을 자동으로 잡아 기록하고 push한다.
종료 코드 0이면 `ok`, 0이 아니면 `fail`. 명령이 `NOOP`을 stdout 마지막 줄에
출력하면 `noop`으로 기록한다(작업이 자기 상태를 알릴 수 있는 규약).

### 3) Mac

`scripts/oplog.sh`가 같은 일을 한다:

```bash
scripts/oplog.sh --task <taskId> --repo ~/path/releasepilot-reports -- <실제 명령>
```

## 보는 방법

- **`ops-calendar/health.html`** — 한 화면 대시보드. 상단에 문제 카드(silent/
  failing/overfrequent/pointless/duplicate), 아래에 작업별 최근 14일 실행 스트립
  (칸 하나 = 하루, 색 = outcome). 캘린더 페이지와 상호 링크.
- **주간 운영 리포트** — `ops-monitor-weekly` 루틴이 매주 월요일 집계 후,
  문제가 하나라도 있을 때만 `reports/`에 리포트를 발행하고 알림을 보낸다.
  **문제가 없으면 아무것도 발행하지 않는다** (조용한 주에 리포트를 쌓지 않는다 —
  그러면 이 시스템 자체가 `pointless` 대상이 된다).

## 도입 순서 (실제 적용)

1. ✅ 스키마·스크립트·대시보드 생성 (이 커밋)
2. ⬜ **클라우드 루틴 6개 프롬프트에 `oplog.py` 호출 한 줄 추가** — 각 루틴을
   claude.ai Routine 편집에서 수정해야 함(이 저장소에서 자동으로 못 함).
3. ⬜ **Windows 예약 작업 7개의 실행 명령을 `oplog.ps1` 래핑으로 교체** — 로컬
   PC 작업, 이 세션에서 접근 불가.
4. ⬜ `ops-monitor-weekly` 루틴 등록.

2~4번은 이 저장소 밖(claude.ai 계정 / 로컬 PC)이라 **사용자 또는 로컬 세션이
직접 해야 한다.** 그때까지 대시보드는 "기록 없음"만 보여주며, 그 자체가
정상이다(아직 아무도 기록을 안 보내고 있으므로).

## 아직 안 한 것 / 설계 필요

- **중복 실행 사전 차단**: 지금은 사후 탐지(`duplicate-host`)만 한다. 사용자가
  요청한 "교통 도로 같은 소통 수단"(맥이 한 일을 윈도우가 또 하지 않게 하는
  차선/신호 체계)은 실행 *전에* 소유권을 확인하는 락 파일 규약이 필요하고,
  git 기반에서는 push 경합 때문에 완전한 상호배제가 안 된다 — 별도 설계 필요.
- **고빈도 작업의 기록 비용**: `secom-auto-process`처럼 하루 수십 번 도는 작업이
  매번 commit+push하면 저장소 히스토리가 오염된다. 이런 작업은 래퍼에
  `-Batch` 모드(파일만 갱신하고 push는 하루 1회)를 쓰도록 설계해뒀지만 아직
  실전 검증 안 됨.
