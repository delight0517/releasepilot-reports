---
id: 2026-08-18_brainwire-code-push-and-ox-quiz-format
type: request
from: mac
to: windows
created: 2026-08-18
status: done
---

## 배경

`releasepilot-hub`의 `apps/brainwire/`를 확인했습니다 — brainwire(유튜브/노트 기반
AI 인출연습 학습 앱) 잘 봤고, 이어받을 준비를 시작했습니다.

## 요청 1 — 코드 저장소 push

`apps/brainwire/windows/todo.md`에 "맥에서 이어받으려면 먼저 앱 코드용 GitHub 저장소를
정해야 한다"고 남겨주신 것 확인했습니다. 저장소를 만들었습니다:

**https://github.com/delight0517/brainwire-app** (private, 지금은 비어있음)

`C:\Users\delig\Desktop\app dev\brainwire`의 소스를 이 저장소로 push해주세요.
`PLAN.md`/`RUNBOOK.md`도 함께 올려주시면 저희 쪽에서 그대로 읽고 이어갈 수 있습니다.

## 요청 2 — OX 퀴즈 형식을 질문 유형에 추가

사용자가 기존 "학습 OX 퀴즈" 앱(`ox-quiz-app`, Flutter)은 이제 사용하지 않기로
결정했고, 그 앱의 재미있었던 부분을 brainwire 쪽으로 옮겨달라고 요청했습니다.
`launchpad-sync/registry.json`에서도 `ox-quiz-app`/`ox-quiz-web` 상태를
`deprecated`로 갱신해뒀습니다(코드는 삭제하지 않았습니다).

지금 brainwire는 인출/연결/적용/창조 4단계 질문 세트로 알고 있습니다. 여기에
**OX(참/거짓) 퀴즈 형식도 질문 유형 중 하나로 추가**해주실 수 있을까요 —
특히 "인출" 단계에서 빠르게 맞다/아니다로 개념을 확인하는 용도로 자연스러울 것
같습니다. ox-quiz에서 검증됐던 보조 아이디어도 참고해주시면 좋을 것 같습니다
(코드 자체는 Flutter라 그대로 재사용은 안 되지만 개념은 재사용 가능합니다):
- `sourceExcerpt`(원문 그대로 인용) — 근거 문장을 답과 함께 보여주기
- 정답 확인 직후 "다음 복습: N일 후" 배지 (brainwire도 이미 SM-2 축약판이 있으니
  같은 자리에 붙이면 자연스러울 것 같습니다)
- "스킵"(SM-2 상태 유지, 다음 문제로만)과 "🚩 이상한 질문 폐기"(완전 삭제) 액션 분리

## 요청 3 — 상시 호스팅 배포 계획 확인 (참고, 급하지 않음)

`apps/brainwire/windows/todo.md`에 "집 와이파이 밖에서도 되게 하려면 상시 접속 가능한
호스팅에 배포"가 다음 단계로 적혀 있던데, 이 부분 진행 계획이나 선호하는 호스팅
방식이 있으면 알려주세요 — 없으면 저희 쪽에서 옵션을 정리해서 제안하겠습니다.

## 급한 정도

요청 1(저장소 push)이 이어받기의 전제조건이라 가장 급하고, 2·3은 이후 순서로
진행해도 됩니다.

전체 처리 경위는 `releasepilot-hub/apps/brainwire/mac/todo.md`에도 기록해뒀습니다.

## 응답 (Windows/박새로이, 2026-08-20)

요청 1, 2 모두 이미 2026-08-18 세션에서 완료했습니다 (`23_app_Releaser/files/TODO.md`
최상단 고정 항목에 기록돼 있습니다):

- **요청 1 (코드 push)**: `brainwire/`의 코드, `PLAN.md`, `RUNBOOK.md`를
  `github.com/delight0517/brainwire-app`에 push 완료했습니다.
- **요청 2 (OX 형식 추가)**: `questions` 잡의 `recall` 단계에 OX(참/거짓) 형식을
  추가했습니다 — 즉석 채점 + "다음 복습" 배지 + 스킵/폐기 액션까지 요청하신
  3가지 아이디어(sourceExcerpt, 복습 배지, 스킵/폐기 분리) 반영했습니다.
  같은 세션에서 `releasepilot-reports/apps/brainwire/`에 백엔드 없는 정적
  체험판도 만들어 공개했습니다:
  https://delight0517.github.io/releasepilot-reports/apps/brainwire/

**요청 3 (상시 호스팅)은 아직 진행 중**입니다 — GitHub Pages +
브라우저 저장 GitHub 토큰으로 서버 없이 동작하는 "클라우드 모드"로 방향을
정했고(`public/cloudStore.js` 작성 → 로컬/클라우드 모드 분기 → 토큰 입력 UI →
`releasepilot-reports`에 실제 앱 배포 순서), 이 부분은 최종 단계에서 사용자가
직접 fine-grained PAT를 발급해서 넣어야 하는 단계가 남아 자격증명 발급 대기
중입니다. 실제 개인용 앱(로컬+hub 데이터 저장 버전)의 공개 호스팅은 현재 API
인증이 없어서 별도로 보류 중이며, 위 정적 체험판과는 다른 사안입니다.
