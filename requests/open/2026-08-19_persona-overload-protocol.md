---
id: 2026-08-19_persona-overload-protocol
type: request
from: windows
to: mac
created: 2026-08-19
status: open
---

## 배경

사용자가 "이 PC의 프로젝트별 세션(페르소나)들이 할 일을 너무 많이 떠안거나
todo가 쌓여서 결국 자기 역할을 제대로 못 하게 되는 게 아니냐"는 우려를
제기해서, 차실장(Chief Cha) 세션에서 점검하고 대응 시스템을 만들었습니다.

실제로 점검해보니 로컬 `timer1\TODO.md`(845줄), `6VPN_Image_Blocker\TODO.md`
(674줄)가 이미 상당히 크고, `releasepilot-hub/apps/35closer-timer/windows/todo.md`
(368줄)도 계속 커지는 중이었습니다 — 세션이 파일 전체를 못 읽고 이미 끝난 일을
다시 하거나 중요한 항목을 놓칠 위험이 실제로 있는 크기였습니다.

## 만든 것 (이미 이 저장소 hub에 push됨)

- `releasepilot-hub/guides/persona_overload_protocol.md` — 문제 정의 +
  완화 절차(사람이 확인하며 완료 항목을 `TODO_ARCHIVE.md`로 분리, 반드시
  `safe_doc_write.ps1`류를 거쳐서, 자동 삭제 없음, 그래도 많으면 기존
  크로스세션 채널로 일부 위임 요청).
- `releasepilot-hub/scripts/check_persona_load.sh` — 읽기 전용 스캔 스크립트.
  로컬 프로젝트의 `TODO.md`들과 이 허브의 `apps/*/*/todo.md`를 줄 수 기준으로
  WARN(200줄+)/OVERLOAD(500줄+) 표시. bash라 Mac에서도 그대로 실행됩니다:
  `bash scripts/check_persona_load.sh --root <mac쪽 프로젝트 루트>`
- Windows 쪽 `~/.claude/CLAUDE.md`에 "세션 시작 시 이 스크립트로 확인하고,
  표시되면 이 프로토콜을 따른다"는 포인터 한 줄을 추가했습니다.

## 요청

Mac 쪽 전역 규칙 파일(`~/.claude/CLAUDE.md` 또는 해당하는 `AGENTS.md`)에도
같은 포인터를 추가해주실 수 있을까요 — 절차 자체는 이미 가이드 문서에 있으니
"세션 시작 시 `check_persona_load.sh`로 과부하 확인 → 표시되면
`guides/persona_overload_protocol.md` 따름" 한두 줄이면 충분합니다. 급하지
않습니다 — 다음에 Mac 세션을 여실 때 편하실 때 반영해주세요.

## 급한 정도

급하지 않음 — 위 도구/가이드는 이미 hub에 있어서 당장 참고만 해도 되고,
전역 규칙 반영은 여유 될 때 하시면 됩니다.

## 추가 요청 (2026-08-19 갱신 — 자동 정리 기능)

이후 사용자가 "자동으로 정리까지 되게 해달라"고 추가 요청해서, Windows
쪽에 `timer1/scripts/auto_archive_todo.ps1`을 만들었습니다 — 완료
마킹(`완료`/`폐기`/`취소`)이 헤더 줄에 명시된 항목만 `TODO_ARCHIVE.md`로
자동 이동, 모든 쓰기는 `safe_doc_write.ps1`(백업+40%축소 거부+자동 commit)을
거침. `check_persona_load.sh`가 OVERLOAD 감지 시 이 스크립트를
`-Apply`로 자동 실행하도록 연결했습니다(`guides/persona_overload_protocol.md`
"자동 정리" 절 참고). 이미 timer1에서 실행해서 845→821줄로 확인.

이건 PowerShell이라 Mac에서 그대로는 못 돌립니다. Mac 쪽에서도 자동
아카이빙을 원하시면, 같은 패턴(헤더+완료마커 opt-in, 모든 프로젝트에
일괄 적용 금지 — 형식이 확인된 프로젝트에만)으로 bash 버전
(`safe_doc_write`에 해당하는 Mac 쪽 안전 스크립트를 거쳐서)을 만들어
`check_persona_load.sh` 옆에 추가해주시면 될 것 같습니다. 6VPN_Image_Blocker
같이 "AI가 줄을 함부로 못 지운다"는 자체 규칙이 있는 프로젝트는 Mac 쪽에도
해당 프로젝트가 있다면 절대 opt-in 시키지 마세요. 이것도 급하지 않습니다.
