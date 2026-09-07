# 취업용 포트폴리오 사이트 — 홍보/도달 점검 보고서 (원문)

**작성:** 차차차(홍보·수익 팀장)
**작성일:** 2026-09-07
**점검 대상:** `portfolio/`, `about/`, `dev-portfolio/` (releasepilot-reports, GitHub Pages 정적 사이트)
**목표:** 이 세 페이지가 실제로 얼마나 홍보/도달되고 있는지 검증 가능한 사실만으로 평가하고, 취업 성공률을 높이는 구체적 다음 행동을 제시

> 이 파일은 `growth_tree.json`의 각 노드 근거를 대조하기 위한 원문입니다. 확인 못한
> 숫자(트래픽, 팔로워, 전환율)는 절대 지어내지 않았고, 확인 못했다는 사실 자체를
> 명시했습니다.

## 1. 결론 (요약 평가)

**이 세 페이지의 실제 도달률은 현재 "측정 불가능"입니다 — 지어낸 추정치가 아니라, 측정
장치 자체가 꺼져 있기 때문입니다(§3).** 사이트 기본기(canonical, OG, sitemap)는 상당 부분
갖춰져 있지만, ① 방문자를 세는 장치가 아직 실제 코드로 연결되지 않았고 ② GitHub Pages
서브패스 구조 때문에 검색엔진이 robots.txt/sitemap을 기본적으로 못 찾는 구조적 문제가
2026-08-27 감사에서 이미 지적된 채로 남아 있습니다(§4). 이 두 가지를 해결하기 전까지는
"홍보가 되고 있는지 아닌지"조차 이 사이트 스스로 답할 수 없는 상태입니다.

취업 관점에서 상대적으로 중요한 순서로 보면: **측정 켜기 → 색인 경로 확정 → 구조화
데이터/이미지 안정성 → 콘텐츠 두께/내부 링크** 순으로 손대는 것이 맞습니다(§10).

## 2. 조사 범위와 한계 (정직하게 밝힘)

이번 점검은 다음 소스만 사용했습니다:
- 저장소 내 실제 파일: `analytics-config.js`, `robots.txt`, `sitemap.xml`,
  `portfolio/index.html`, `about/index.html`, `dev-portfolio/index.html`, `links/links.json`,
  `googlee344d90eaf3c6edd.html`(구글 서치콘솔 소유권 확인 파일)
- 저장소에 이미 존재하는 이전 감사: `reports/2026-08-27-portfolio-seo-audit.html`
  (Claude SEO 오픈소스 도구로 4개 자산을 점검한 리포트, 이번 점검의 상당 부분이 이 리포트가
  이미 찾은 문제의 "그 후 어떻게 됐는지" 재확인입니다)
- `git log`로 확인한 파일별 실제 변경 이력/타임스탬프
- WebSearch로 시도한 `site:delight0517.github.io/releasepilot-reports` 및 이름 조합 검색

**한계**: 이 세션의 네트워크 프록시가 `delight0517.github.io`로의 직접 접속(WebFetch)을
차단해서, 실제 라이브 페이지를 크롤러처럼 직접 열어보지는 못했습니다(파일 내용은 저장소
원본 그대로 신뢰). 또한 WebSearch의 `site:` 연산자가 이 환경에서 GitHub Pages 서브페이지를
안정적으로 걸러내는지 자체가 불확실해서, "검색 결과 0건"을 "구글에 색인 안 됨"으로
단정하지 않고 "이 방법으로는 확인되지 않음"으로만 기록합니다(§4-3). 실제 Search
Console/애널리틱스 대시보드 접근 권한은 이 세션에 없습니다 — 트래픽 수치, 팔로워 수,
전환율은 전혀 확인할 수 없었고, 어떤 값도 추정해서 채우지 않았습니다.

## 3. 가장 큰 문제 — 측정 장치 자체가 꺼져 있다

`analytics-config.js`(사이트 전체 페이지가 공유하는 유일한 분석 설정 파일)를 열어보면:

```js
window.GOATCOUNTER_CODE = "YOUR_CODE";
```

파일 안 주석에 스스로 명시되어 있듯, 이 값이 `"YOUR_CODE"`인 동안은 GoatCounter 스크립트가
로드되지 않습니다 — 즉 **`portfolio/`, `about/`, `dev-portfolio/`를 포함한 사이트 전체
어디에서도 방문자 수·유입 경로·체류 시간이 단 한 건도 기록되고 있지 않습니다.** 이 파일은
2026-08-25 이후 마지막으로 커밋된 상태 그대로이고(git log 기준), 그 사이 사이트에는 여러
개편 커밋(포트폴리오 중심 구조 개편, SEO 작업 등)이 있었지만 이 값은 한 번도 실제 코드로
바뀌지 않았습니다.

**이것이 의미하는 것**: 지금 이 순간 "포트폴리오 사이트가 얼마나 홍보되고 있는가"라는
질문에 이 사이트는 스스로 답을 줄 수 없습니다. 링크를 트위터/브런치/카톡에 공유해도, 채용
담당자가 실제로 클릭해서 들어왔는지, 어느 페이지에서 이탈했는지, 재방문이 있었는지 전혀
기록되지 않습니다. 이후에 소개할 모든 개선(색인, 콘텐츠, 링크 구조)도, 측정이 켜지기
전까지는 "효과가 있었는지" 검증할 방법이 없습니다.

## 4. 색인 경로 문제 — 검색엔진이 애초에 찾아올 수 있는가

### 4-1. GitHub Pages 서브패스 robots.txt 문제 (이전 감사에서 이미 발견, 아직 미해결로 보임)

`reports/2026-08-27-portfolio-seo-audit.html`이 이미 지적한 내용: GitHub Pages 크롤러는
도메인 루트(`delight0517.github.io/robots.txt`)만 기본으로 읽는데, 이 저장소의
`robots.txt`는 서브패스(`delight0517.github.io/releasepilot-reports/robots.txt`)에 있어
크롤러가 기본적으로 못 찾습니다. 그 안에 선언된 `Sitemap:` 줄도 같이 무시됩니다. 이
저장소 세션에서는 Search Console 콘솔 화면에 접근할 수 없어 "그래서 사이트맵을 실제로
직접 제출했는지"는 확인 불가능합니다 — 다만 구글 소유권 확인 파일
(`googlee344d90eaf3c6edd.html`)이 2026-08-19부터 저장소에 존재하는 것은 확인했습니다.
이 파일의 존재 자체는 "이 사이트 소유권을 Search Console에 등록한 적이 있다"는 근거는
되지만, "사이트맵을 실제로 제출했다/색인이 됐다"의 증거는 아닙니다.

### 4-2. sitemap.xml 현황

현재 `sitemap.xml`은 48개 URL을 담고 있고 `portfolio/`, `about/`, `dev-portfolio/` 모두
포함되어 있습니다(2026-08-27 감사 당시 39개에서 이후 계속 늘어난 것으로 보임 — 앱 페이지
추가마다 갱신된 정황이 git log에 있음). 사이트맵 자체의 완전성은 개선된 상태입니다.

### 4-3. 이번에 직접 시도한 색인 확인 (결론: 확인 불가, 추정 금지)

`WebSearch`로 `site:delight0517.github.io/releasepilot-reports`,
`site:delight0517.github.io/releasepilot-reports/portfolio`,
`site:delight0517.github.io/releasepilot-reports/dev-portfolio`, 그리고
`"releasepilot-reports" delight0517 김근후 포트폴리오`를 각각 검색했습니다. 네 건 모두
이 사이트와 무관한 일반 결과만 나왔고, 이 사이트를 가리키는 결과는 하나도 없었습니다.
다만 §2에서 밝힌 대로 이 환경의 `site:` 연산자 신뢰도 자체가 불확실하기 때문에, 이 결과를
"구글에 전혀 색인되지 않았다"는 확정 사실로 쓰지 않습니다. 대신 "독립적인 웹 검색으로는
이 사이트의 존재를 확인할 근거를 하나도 찾지 못했다"는, 더 약하지만 정직한 신호로
기록합니다 — 실제 색인 여부를 확인하려면 사용자가 직접 Search Console의 "URL 검사" 기능을
써야 합니다(이 세션엔 그 접근 권한이 없습니다).

## 5. 구조화 데이터(JSON-LD) — 페이지별 격차

- `dev-portfolio/index.html`: JSON-LD 1블록 존재 확인(Person/BreadcrumbList/SoftwareApplication
  ×6 — commit `0419d83`, 2026-08-25). 2026-08-27 감사의 HIGH 항목 "구조화 데이터 0건"이
  이 페이지에서는 이미 해결된 상태입니다.
- `portfolio/index.html`: JSON-LD **0블록**. 여전히 미해결.
- `about/index.html`: JSON-LD **0블록**. 여전히 미해결 — 그런데 이 페이지가 실제로는
  본문 텍스트 601단어로 세 페이지 중 가장 정보량이 많고(§7), `links/links.json`에서
  스스로를 "무기고 허브 · 김근후 전체 소개"로 규정한 진입점 페이지입니다. 사람 소개
  페이지에 `Person` 스키마가 없는 것은 취업 목적 사이트에서 가장 아까운 공백입니다.

## 6. og:image 핫링크 — 일부만 고쳐짐

2026-08-27 감사는 `dev-portfolio`의 `og:image`가 브런치 카카오 CDN
(`img1.kakaocdn.net/thumb/.../?fname=http://t1.kakaocdn.net/...`, URL 안에 `http://`가
섞인 상태)에 걸려 있어 남의 서비스 의존과 미리보기 파손 위험이 있다고 지적했습니다. 지금
확인해보면 **`dev-portfolio`는 고쳐졌습니다** — `og:image`가
`https://delight0517.github.io/releasepilot-reports/icons/icon-1024.png`로 자체 호스팅
전환됨. 그런데 **`portfolio/index.html`과 `about/index.html`은 아직도 그때 그 카카오 CDN
URL을 그대로 쓰고 있습니다.** 카톡·슬랙·링크드인 등에 이 두 페이지 링크를 공유하면
미리보기 이미지가 언제든 깨질 수 있는 상태가 그대로 남아 있는 것입니다.

## 7. 콘텐츠 두께

크롤러가 실제로 읽는 순수 텍스트 분량(스크립트/스타일/태그 제거 후 단어 수, 이번에 직접
계산):

| 페이지 | 단어 수 |
| --- | --- |
| `portfolio/index.html` | 141 |
| `dev-portfolio/index.html` | 245 |
| `about/index.html` | 601 |

2026-08-27 감사는 메인(258단어)과 dev-portfolio(216단어)를 "얇다"고 지적했는데,
`portfolio/`는 그때 따로 측정되지 않았고 지금 재보니 **세 페이지 중 가장 얇습니다(141단어)**
— 검색·필터가 JS로 렌더링되는 구조라 크롤러엔 실제 작품 목록이 거의 안 보이기 때문으로
보입니다(§8과 연결).

## 8. 내부 링크 구조 — about 페이지로 가는 길이 좁다

저장소 전체에서 `href`로 `about/`, `portfolio/`, `dev-portfolio/`를 가리키는 HTML 파일을
grep한 결과:

- `about/`로 들어가는 링크가 있는 페이지: `index.html`, `worklog/index.html` — **2곳뿐**.
- `portfolio/`로 들어가는 링크가 있는 페이지: `index.html`, `about/index.html`,
  `dev-portfolio/index.html`, `growth/geunhoo/index.html`, `growth/hosting_guide/index.html`,
  `reports/2026-08-27-portfolio-seo-audit.html`, `reports/rogan-branding_federated_sites_strategy-...html`
  — 7곳.
- `dev-portfolio/`로 들어가는 링크가 있는 페이지: `index.html`, `about/index.html`,
  `growth/geunhoo/index.html`, `growth/hosting_guide/index.html`,
  `reports/2026-08-27-portfolio-seo-audit.html` — 5곳.

`about/`가 스스로를 "전체 소개 허브"로 규정하고 있음에도(§5), 사이트 안에서 그 페이지로
들어가는 경로는 홈 하나와 `worklog/`(내부 작업 기록 성격이 강해 채용 담당자가 볼 가능성이
낮은 페이지) 하나뿐입니다. `portfolio/`, `dev-portfolio/`는 growth tree·reports 쪽에서
여러 번 인용돼 상대적으로 더 많이 연결돼 있습니다.

## 9. llms.txt — 여전히 없음

2026-08-27 감사가 MEDIUM으로 지적한 `llms.txt`(AI 답변 엔진이 사이트를 인용할 근거 파일)는
이번 점검에서도 저장소 어디에도 존재하지 않는 것으로 확인됐습니다(`find . -iname llms.txt`
결과 0건). 채용 담당자가 ChatGPT/Perplexity 등에 "3D 게임 아티스트 개발자 포트폴리오"류로
검색해 이 사이트가 인용될 근거가 아직 없습니다.

## 10. 실행 우선순위 요약

측정이 꺼진 상태에서 콘텐츠를 더 만들거나 링크를 더 붙이는 것은 "효과가 있었는지 알 수
없는 투자"가 됩니다. 그래서 순서를 이렇게 둡니다.

1. **애널리틱스 실제로 켜기** — `analytics-config.js`의 `GOATCOUNTER_CODE`를 실제 값으로
   교체. 사용자의 GoatCounter 계정 가입이 먼저 필요해서, 이 저장소 세션이 대신 실행할 수
   없는 유일한 항목 — 사용자 확인/가입이 필요.
2. **about/portfolio의 og:image를 자체 호스팅으로 교체** — dev-portfolio에서 이미 검증된
   패턴(`icons/icon-1024.png` 자체 호스팅) 그대로 적용 가능, 코드 작업만으로 완료 가능.
3. **사이트맵 직접 제출 여부를 사용자가 Search Console에서 확인** — 이 세션은 콘솔에
   접근할 수 없어 대신 확인 불가, 사용자 액션 필요.
4. **about/portfolio에 Person/CreativeWork JSON-LD 추가** — dev-portfolio 패턴 재사용.
5. **portfolio/index.html 크롤러용 텍스트 보강** — JS 필터 뒤에 숨은 대표작 설명을
   정적 텍스트로도 노출.
6. **about로 들어가는 내부 링크 추가** — portfolio/dev-portfolio 등 공개 페이지 하단에
   "김근후 소개" 링크 추가.
7. **llms.txt 신설**.
8. **애널리틱스가 실제로 몇 주 쌓인 뒤, 어느 채널이 실제 방문/문의로 이어지는지 검토**
   — 이건 1번이 켜지기 전까지는 아예 시작할 수 없는 항목.

## 참고 자료

- `reports/2026-08-27-portfolio-seo-audit.html` (저장소 내부, 이번 점검의 상당 부분이
  이 리포트의 후속 확인)
- `analytics-config.js`, `robots.txt`, `sitemap.xml`, `links/links.json` (저장소 내부 원본)
- `about/index.html` §"차차차 — 홍보팀장 겸 수익팀장" 자기소개 (이 페르소나의 역할 정의)
