# runs/ — 실행 기록 저장소

각 기기·루틴이 **실제로 실행된 증거**를 남기는 곳. 사람이 직접 편집하는 파일이
아니다 — `scripts/oplog.py`(또는 이를 감싸는 `oplog.ps1` / `oplog.sh`)가 쓴다.

경로 규칙: `<YYYY-MM-DD>/<taskId>__<host>.json` (`host` = `mac` | `windows` | `cloud`)

파일명에 host가 들어가는 이유는 **git 충돌을 구조적으로 없애기 위해서**다. 맥과
윈도우가 같은 날 같은 작업을 기록해도 서로 다른 파일이라 merge가 필요 없다.
반대로 이 규칙 덕분에 `ops_health.py`가 "같은 taskId를 두 host가 실행 중"인
중복 작업을 자동으로 탐지할 수 있다.

스키마와 outcome(`ok`/`noop`/`skip`/`fail`)의 의미, 그리고 이 기록으로 무엇을
판정하는지는 [`docs/ops_heartbeat_monitoring.md`](../../docs/ops_heartbeat_monitoring.md) 참고.

집계 결과는 `../health.json`이고, 보는 화면은 [`../health.html`](../health.html)이다.
