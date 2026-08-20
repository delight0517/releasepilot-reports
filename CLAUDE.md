# releasepilot-reports — read this first

사용자에게 보이는 이름: "릴리저 웹사이트" / "릴리저 리포트". 정적 파일 + git만 원칙(서버
없음, 라이브 API 키 없음)으로 돌아가는 공개 사이트. 로컬 클론:
`%LocalAppData%\LaunchPad\hub\releasepilot-reports`, git remote:
`https://github.com/delight0517/releasepilot-reports`.

**이 문서가 없어서 2026-08-19에 사용자가 직접 지적한 사고가 있었음**: "차사장, 왜 이걸
몰라서 토큰이 오래 걸려 찾는데" — yena_career 성장 트리를 찾느라 조사 에이전트를 따로
돌려야 했다. 다시는 이러지 않도록, 이 사이트에 뭐가 있는지 여기 요약해둔다.

## 뭐가 있는 사이트인가

- `growth/<slug>/` — **성장 트리(growth tree)**: AI 보고서를 게임 스킬트리처럼 렌더링.
  스키마: `docs/growth_tree_schema.md`. 지금 있는 트리:
  - `growth/yena_career/` — 김예나 커리어/인스타그램 인플루언서 로드맵. **가장 활발히
    쓰이는 트리이자 상담 시스템의 실험대**(아래 참고).
  - `growth/geunhoo/` — 김근후 인스타그램 성장 트리(11노드/4단계, 원조 템플릿).
- `apps/` — brainwire-app 등 이 저장소에 함께 배포된 정적 웹앱들.
- `reports/` — 개별 AI 리포트(HTML).
- `requests/` — 크로스세션 요청 채널(다른 프로젝트의 `releasepilot-hub`와는 별개 저장소니
  혼동 주의 — 이 저장소 자체의 요청 채널).
- `docs/` — 이 사이트의 설계 문서 전체. **뭔가 시작하기 전에 먼저 여기부터 훑을 것.**

## yena_career — 상담 시스템 (2026-08-19 신설, 계속 진화 중)

일반 성장 트리를 넘어서, **"실행 안 하면 왜 안 하는지 상담하고 방향을 재구성"**하는
시스템을 이 트리에서 처음 만들고 있다. 읽는 순서:

1. `docs/growth_tree_counseling_protocol.md` — 언제 상담이 시작되는가(4일 이상 정체),
   상담 중 하지 말아야 할 것, 복수 페르소나 대립 방식.
2. `docs/adaptive_discovery_interview_method.md` — 실제 질문을 어떻게 진행하는가(라운드별
   적응형 질문, 정정 이력 관리, 종합 전 결론 금지) — **이 방식 자체가 앱으로 옮겨질 재사용
   자산**으로 설계됨, 데이터 모델 포함.
3. `growth/yena_career/YENA_PERSONA.md` — 상담 페르소나 "예나"(커리어 카운슬링 + 퍼스널
   브랜딩 전문성 기준).
4. `growth/yena_career/ROY_PERSONA.md` — 두 번째 페르소나 "로이"(바이럴/미디어 구조 전문가).
   예나와 로이가 의도적으로 부딪히며 대화하는 게 이 트리의 상담 방식.
5. `growth/yena_career/counseling_log.md` — 실제 상담 회차 기록(발견한 것, 정정 이력,
   아직 결론 안 난 것). **다음 상담은 여기부터 읽고 이어간다 — `source_report.md`(생성
   시점 스냅샷)만 보고 판단하지 않는다.**
6. `growth/yena_career/big_picture.md` — 상담이 진행될수록 갱신되는 전략 큰 그림(인스타/
   영업 등), 인과관계로("A하면 나중에 B") 서술, 지어낸 통계 없음.
7. `growth/yena_career/checkin_state.json` — 노드별 잠금해제/마지막 상담 시각 추적(자동
   스케줄 상담용, 사람이 안 읽는 파일).
8. `growth/_shared/cloudStore.js` — 정적 사이트에서 GitHub Contents API로 직접 읽고 쓰는
   클라이언트(`apps/brainwire-app/cloudStore.js`와 같은 패턴). 채팅 UI 프로토타입이
   `growth/<slug>/interview_queue.json`을 이걸로 읽고 쓴다.

**규칙(사용자 지시, 2026-08-19)**: 이 트리에서 뭔가 최종 결론/트리 재구성을 내기 전에는
반드시 위 적응형 발견 인터뷰(2번 문서)를 먼저 거쳐야 한다 — 건너뛰고 바로 결론 내지
않는다.

## 자동 스케줄

`yena-career-checkin` (claude.ai 클라우드 루틴, `23_app_Releaser/.claude/schedule_registry.json`에
등록) — 매일 09:00 KST, `growth_tree_counseling_protocol.md`를 그대로 실행. 이 저장소를
직접 clone해서 도는 클라우드 에이전트라 로컬 PC 상태와 무관하게 돈다.

## 진행 중 / 아직 못 만든 것 (2026-08-19 기준)

사용자가 요청했지만 아직 스캐폴딩만 하거나 설계 논의가 필요한 것들 — 다음 세션이 이어갈 때:

- **채팅 프로토타입**: `growth/_shared/cloudStore.js`까지 만듦, 실제 채팅 UI 페이지
  (`growth/yena_career/counsel/index.html`)와 큐 처리 런북은 아직. GitHub PAT를
  브라우저 localStorage에 저장하는 방식(brainwire-app과 동일)으로 1인 프로토타입은
  충분하지만, 여러 사람이 로그인해서 각자 트리를 만드는 건 이 방식으로는 안 됨(PAT는
  저장소 전체에 쓰기 권한이 있어서 다른 사용자와 공유 불가) — 진짜 로그인/멀티유저가
  필요하면 이건 완전히 다른 아키텍처(실제 백엔드+DB+인증)가 필요하고, 이건 "정적+GitHub만"
  원칙을 벗어나는 결정이라 사용자와 먼저 설계를 맞춰야 함.
- **멀티유저 로그인 + 각자 트리 구성 + 김근후 데이터 이전 + 히스토리 보존 + 사용자 자신의
  클라우드 구매**: 2026-08-19 사용자가 요청. 이건 제품 방향 결정이 필요한 큰 스코프라
  (호스팅 비용, 인증 방식, DB 선택) 다음 세션이 바로 코드부터 짜지 말고 사용자와 설계
  옵션을 먼저 확인할 것.
