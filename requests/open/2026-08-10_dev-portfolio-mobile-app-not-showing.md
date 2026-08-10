---
id: 2026-08-10_dev-portfolio-mobile-app-not-showing
type: bug-report
from: Windows (23_app_Releaser 세션)
to: Mac
created: 2026-08-10
status: open
---

## 보고 (Windows)

사용자가 실제 모바일 기기(폰)에서 `releasepilot-reports` 사이트(정확히는 클로이 박 페르소나/`dev-portfolio/` 쪽으로 추정 — 사용자 원문: "모바일 앱에는 안보여")를 열었을 때 뭔가 안 보인다고 보고했습니다. "Mac에 전달해서 다음에 작업 가능하게 해달라"는 명시적 요청입니다.

### Windows 쪽에서 확인한 것 (2026-08-10)

- Browser 도구의 뷰포트 에뮬레이션(375px 모바일, 768px 태블릿, 1280px 데스크탑)으로는 `about/`와 `dev-portfolio/` 둘 다 문제를 재현하지 못했습니다 — 페이지 레벨 가로 스크롤 없음, 검색·필터 UI 정상 렌더링(로컬 서버로 직접 클릭·타이핑까지 확인).
- 즉 **에뮬레이션이 아니라 실제 모바일 기기(iOS Safari 등)에서만 재현되는 문제일 가능성**이 있습니다 — 뷰포트 크기 문제가 아니라 실기기 특유의 렌더링 차이(동적 주소창 높이, 특정 CSS 속성 미지원, 터치 이벤트 등)로 추정됩니다.
- `about/`의 "클로이 박" 소개 카드는 DOM상 정상 렌더링되지만 페이지 총 길이가 4450px라 스크롤을 많이 해야 나옵니다 — 사용자가 "안 보인다"고 느낀 게 이거였을 수도 있고, 아니면 진짜 실기기 렌더링 버그일 수도 있어 Windows 쪽에선 특정하지 못했습니다.

### Mac 쪽에 요청하는 것

1. 실제 iOS 기기(또는 iOS 시뮬레이터)로 `https://delight0517.github.io/releasepilot-reports/about/`와 `https://delight0517.github.io/releasepilot-reports/dev-portfolio/`를 열어 무엇이 실제로 안 보이는지 재현·특정.
2. 2026-08-10에 Windows가 `dev-portfolio/index.html`에 검색·태그 필터 탐색 UI를 추가했습니다(커밋 `3197c5f`, `8567185`) — 이 신규 UI(`position: sticky` 검색바 등)가 실기기에서 문제의 원인일 가능성도 함께 확인 부탁드립니다.
3. 재현되면 원인·수정은 Mac 쪽에서 진행해주세요 — Windows는 실기기 접근이 없어 이 이상 진단이 어렵습니다.

### 참고

- `about/` nav에 `dev-portfolio/` 링크 추가함(이전엔 about에서 갈 방법이 없었음) — 이것도 실기기에서 확인 부탁드립니다.
- 같은 세션에서 `dev-portfolio/`의 프로젝트 순서도 수정했습니다: ReleasePilot(개발 도구)을 맨 뒤로 내리고 실제 출시 대상 앱 6개를 상단으로 올림(사용자 지시: "포트폴리오는 이 앱 자신이 아니라 지금 개발중인 앱에 대한 것이어야 함").
