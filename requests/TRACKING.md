# requests/ 큐 처리 트래킹

`requests/README.md` 프로토콜로 오가는 요청들의 처리 현황을 세션이 바뀌어도
이어서 볼 수 있게 기록하는 문서. 새로 만들지 말고 항상 이 문서에 이어서
append할 것(날짜별 섹션 추가 방식).

## 사용법

- 요청 하나를 처리할 때마다(진행중이든 완료든) 아래 표에 한 줄 추가/갱신.
- 상태: `진행중` / `완료` / `보류`.
- `done/`으로 옮긴 뒤에도 이 표는 지우지 않고 `완료`로 남겨 이력 유지.

## 2026-08-10 처리분

| 요청 id | 상태 | 요약 | 남은 일 |
|---|---|---|---|
| `2026-08-10_dev-portfolio-mobile-app-not-showing` | 완료 | iOS 시뮬레이터(iPhone 17)로 실기기와 동일 WebKit 재현 시도 → 1차 터치 스크롤 테스트에선 재현 안 됐으나, 스크린샷 전/후 대조로 실제 원인 특정: `.explore`(검색+필터 바)의 `position: sticky`가 `.wrap` 전체(페이지 끝까지)를 컨테이닝 블록으로 잡아 스크롤해도 안 떨어지고 하단 케이스 카드 위에 계속 겹쳐 보임. `dev-portfolio/index.html`에서 sticky 제거해 수정(커밋 `1bce5d6`), 요청 파일에 응답 append 후 `done/`으로 이동(커밋 `c2faea1`). | `about/` 페이지(총 길이 4450px)는 이번 수정 범위 밖 — 별도 재검증 필요하면 새 요청으로 분리할 것. |
| `2026-08-10_magazine-editorial-continuity-checklist-and-adsense-scope` | 완료 | Windows의 매거진 편집 체크리스트(챕터 연결/차가운 인용 금지/"왜 갑자기?" 테스트) 공유에 Mac도 `articles/` 게시 시 동일 기준 적용하기로 동의. AdSense는 `articles/` 채널 한정 유지(허브 전체 확장 안 함)로 확정 동의. 개인정보처리방침은 필요 시 별도 작업. | 없음 — AdSense 퍼블리셔 ID 승인되면 Windows 쪽에서 주석 해제만 하면 되는 구조로 이미 준비됨. |
| `2026-08-10_screenshot-capture-feature-for-design-reviews` | 완료 | Windows가 C#/WPF(`ScreenshotCaptureService.cs`)로 구현한 것과 동일 기능을 ReleasePilot(Flutter)에도 구현: `lib/features/chief_cha/services/screenshot_capture_service.dart` 신설(`screencapture -x`로 캡처 → git add/commit/push → `reports/screenshots/<slug>/<timestamp>.png` 경로로 퍼블리시 → GitHub Pages URL 반환), `chief_cha_screen.dart` AppBar에 📸 버튼 추가(5초 카운트다운 후 캡처). `flutter analyze` 통과 확인. 파일 존재 여부는 로컬 코드베이스에서 직접 확인함(`/Users/rogan/Desktop/appDev/devtool/23AppdeveloperReleaser/app_release_copilot/client/lib/features/chief_cha/`). | 없음. |

## 참고

- 이 세션 진행 중 `dev-portfolio-mobile-app-not-showing` 건은 **다른 Mac 세션(동시 병행 작업)**이
  같은 로컬 체크아웃(`/private/tmp/releasepilot-reports`)에서 실시간으로 같이 수정하고
  있었음 — `git status`가 깨끗했다가 곧바로 `M`(수정됨)으로 바뀌는 레이스를 실제로
  겪었다. 이런 경우 무조건 덮어쓰지 말고 `git pull` → 실제 최신 내용을 다시 `Read`한
  뒤 append하는 방식으로 충돌 없이 병합할 것 (이번엔 상대 세션이 나보다 먼저
  `done/`으로 옮기고 커밋까지 마쳐서 내 쪽 편집은 그대로 버리고 최신 상태만
  확인·검증하는 것으로 마무리함).

## 2026-08-26 처리분

| 요청 id | 상태 | 요약 | 남은 일 |
|---|---|---|---|
| `2026-08-19_persona-overload-protocol` | 완료 | 2번 추가 요청(맥용 자동 아카이빙) 완료 — `releasepilot-hub/scripts/auto_archive_todo.sh` 신설. 파일 머리 `<!-- auto-archive: on, max=N -->` 마커 opt-in 방식으로 보호 프로젝트 구조적 배제. 백업/40% 축소 거부/드라이런 기본 등 안전장치 원본과 동일 포팅. 합성 파일로 전 경로 재현 테스트 통과(드라이런 흔적 버그 발견→수정). 가이드 문서에 Mac 절 추가. | 실제 Mac 로컬 프로젝트에 마커 opt-in은 아직 0건 — 각 세션이 dry-run으로 형식 확인 후 진행할 것. |
