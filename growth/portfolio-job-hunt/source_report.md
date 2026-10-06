# 포트폴리오 마케팅/채용 유입 진단 보고서 (원문)

**버전:** v1
**작성일:** 2026-08-25
**작성:** 차차차 (홍보·수익 팀장 페르소나, 주간 정기 점검)
**검토 대상:** `about/`, `portfolio/`, `dev-portfolio/` — 취업/채용 유입과 직결되는 공개 페이지 3곳
**목표:** 이 세 페이지가 실제로 얼마나 홍보·도달되고 있는지 검증 가능한 근거만으로 평가하고, 채용 확률을 올릴 다음 행동을 정리

> 이 파일은 `growth_tree.json`의 각 노드(success/failure/why 문구)가 실제로 어느
> 문장에서 나왔는지 대조하기 위한 원문 보관용입니다. 확인 불가능한 트래픽 수치·
> 팔로워 수·전환율은 절대 지어내지 않았습니다 — 확인이 안 되면 "확인 불가"라고
> 그대로 적었습니다.

## 1. 결론

**한 문장 요약: 페이지 자체의 기본기(메타태그·사이트맵·robots)는 이미 잘 갖춰져
있지만, "실제로 발견되고 있다"는 증거가 하나도 없다.** 애널리틱스는 설치 자체가
안 된 placeholder 상태이고, 외부 검색으로는 이 사이트를 가리키는 어떤 결과도
찾지 못했다. 즉 지금 이 순간 이 사이트의 실질적 도달률은 "0 또는 확인 불가"에
가깝다고 봐야 하며, 채용 담당자가 이 포트폴리오를 우연히 발견할 경로는 사실상
없고, 발견한 뒤에도 다음 행동(연락)으로 이어질 링크가 일부 비어 있다.

나쁜 소식만은 아니다 — 인프라(색인성 기본기)는 이미 끝나 있어서, 지금부터는
"트래픽을 만드는" 작업만 남았다. 이건 콘텐츠를 매일 만드는 게 아니라, **이미
가진 채널(브런치·아트스테이션·카카오톡)에 링크를 걸고, 안 걸려 있는 핵심 채널
(LinkedIn·GitHub)을 새로 열고, 실제로 측정 가능한 상태로 만드는 것**만으로도
큰 진전이 된다.

## 2. 애널리틱스 — 설치 자체가 안 되어 있음 (확인된 사실)

저장소 루트의 `analytics-config.js`를 확인한 결과:

```js
window.GOATCOUNTER_CODE = "YOUR_CODE";
```

코드값이 아직 placeholder다. 파일 자체 주석에 "이 값이 YOUR_CODE인 동안은
count.js가 잘못된 도메인으로 요청을 보내 조용히 실패한다(방문자 데이터만
수집되지 않음)"고 명시돼 있다. 즉 **지금까지 이 사이트에 방문자가 몇 명
왔는지, 어느 페이지를 봤는지, 어디서 유입됐는지 — 이 중 무엇도 데이터로
존재하지 않는다.** 방문자 수·전환율 등 어떤 숫자도 이번 리포트에서 추정하지
않은 이유가 이것이다.

## 3. dev-portfolio 자체 진단 — 2026-08-10 이후 미해결 (확인된 사실)

`dev-portfolio/index.html`에는 이미 "클로이 박" 페르소나가 2026-08-10에 작성한
자체 평가 섹션(`#chloeList`, 라인 365-374)이 페이지 안에 살아있다. 오늘
(2026-08-25) 기준으로 다시 확인한 결과, 지적된 항목이 15일이 지나도 그대로
남아 있다:

- **스크린샷 0개** — "지금 7개 프로젝트 중 실제 화면 스크린샷이 있는 건
  0개"라고 그때 적혀 있었고, `dev-portfolio/assets/`를 직접 확인한 결과 지금도
  `icons/` 폴더 하나뿐이다. 실제 화면 스크린샷은 여전히 없다.
- **GitHub 링크 없음** — 저장소 전체를 `github.com/delight0517`로 검색해도
  `about/`, `portfolio/`, `dev-portfolio/`, `links/links.json` 어디에도 개인
  GitHub 프로필이나 공개 저장소 링크가 없다.
- **이력서/연락처 링크가 hero 영역에 없음** — 마찬가지로 아직 반영 안 됨.

이건 이번 리포트가 새로 발견한 문제가 아니라, **이미 알고 있었지만 아직 손대지
않은 문제**라는 뜻이다. 우선순위가 낮아서가 아니라 단순히 아직 안 한 것으로
보이므로, 이번 트리에서 다시 최상위로 올린다.

## 4. 색인성 기본기 — 잘 갖춰져 있음, 그러나 실제 색인 여부는 확인 안 됨

**잘 되어 있는 것 (직접 확인):**
- `robots.txt` — `Allow: /` 전체 허용, `Sitemap:` 라인 포함.
- `sitemap.xml` — `about/`, `portfolio/`, `dev-portfolio/` 포함 총 16개 URL 등록.
- `about/`, `portfolio/`, `dev-portfolio/` 세 페이지 모두 `<title>`, meta
  description, `canonical`, OG(`og:title/description/url/image`), Twitter
  카드까지 전부 채워져 있음 — 카카오톡/트위터 공유 시 빈 카드가 뜨는 문제는
  없다.
- 저장소 루트에 `googlee344d90eaf3c6edd.html`(Google Search Console HTML 소유권
  인증 파일)이 실제로 존재 — 최소한 인증 절차를 시작(파일 생성·커밋)한 흔적은
  맞다.

**확인이 안 되는 것:**
- 2026-08-13자 이전 리포트(`reports/rogan-static_site_seo_necessity-...html`)는
  "Google Search Console 소유권 인증: 완료(본인 진행)", "sitemap 제출:
  완료(본인 진행)"이라고 적어 두었다. 이건 사용자가 직접 진행했다고 자체
  보고한 상태이지, 저장소 파일만으로 그 완료 여부를 증명할 수 있는 항목은
  아니다.
- 오늘 WebSearch로 `site:delight0517.github.io/releasepilot-reports` 및
  관련 조합(`"releasepilot-reports" 김근후`, `"delight0517.github.io"
  -site:github.com`)을 검색했지만, **이 사이트를 직접 가리키는 검색 결과가
  단 하나도 없었다** — 전부 이름이 비슷한 무관한 서비스(ReleasePilot이라는
  다른 SaaS 제품 등)만 나왔다.
- 이게 "색인이 안 됐다"의 확실한 증거는 아니다(WebSearch 도구가 구글 자체
  색인과 100% 같은 결과를 보장하지 않고, 색인은 제출 후 수일~수주가 걸릴 수
  있다는 것도 이전 리포트에 이미 적혀 있었다). 다만 인증 파일이 생성된 지
  12일이 지난 시점에 **어떤 검색 결과로도 이 사이트를 찾을 수 없다는 것 자체는
  실측 사실**이고, "색인 완료" 주장을 그대로 믿기보다 직접 Search Console에
  들어가 "적용 범위(Coverage)"와 "URL 검사" 탭에서 실제 상태를 재확인할 필요가
  있다.

## 5. 채용 채널 링크 구조 — LinkedIn·GitHub 부재 (확인된 사실)

`links/links.json`(허브 링크인바이오 페이지)의 외부 링크 전체를 확인한 결과:

```
ArtStation, 브런치, 이메일, 전화, 카카오톡 오픈채팅
```

다섯 개가 전부다. **LinkedIn 링크가 없다.** 채용 담당자·리크루터가 후보자를
검증할 때 가장 먼저 찾는 채널인데, 이 사이트 어디에도(about/portfolio/
dev-portfolio/links.json 전체 grep 기준) LinkedIn 언급이 없다. **GitHub
개인 프로필 링크도 없다** — dev-portfolio 자체 평가(§3)에서도 이미 지적된
문제와 같은 사실이다.

## 6. 정체성 분산 + 백링크 부재 (확인된 사실)

`links/links.json`은 영상 편집자·3D 게임 아티스트·배우·무대·포트폴리오
아카이브·앱 개발·비주얼 디자인·3D 오브젝트·영어 과외·번역까지 10개 카테고리를
동일한 비중으로 나열한다(2026-08-13 커밋에서 미완성 5개는 owner-key로
가리고 noindex 처리했지만, 개발자 포트폴리오와 무관한 나머지 — 영상편집·
배우·무대·번역 등 — 는 여전히 공개 목록에 함께 있다). `growth/geunhoo/`
트리(§3-1)가 이미 지적했던 것과 같은 종류의 문제 — **개발자 채용 담당자가
이 링크 페이지에 처음 도달했을 때, "이 사람은 개발자다"라는 신호가 다른
9개 정체성 사이에 묻힐 수 있다.**

백링크(외부에서 이 사이트로 들어오는 링크)는 2026-08-13 리포트에서도 "미착수"로
적혀 있었고, 오늘 확인한 WebSearch 결과(§4)에서도 이 사이트를 언급하는
외부 페이지를 하나도 찾지 못했다 — 12일 전과 상태가 그대로라는 뜻이다.

## 7. 권고 우선순위

숫자·확률을 지어내지 않고, 이번에 확인한 사실에서 바로 이어지는 행동만 정리한다.

1. **애널리틱스부터 켠다** — GoatCounter 코드 발급 + `analytics-config.js`
   교체. 이게 없으면 다음에 뭘 해도 효과가 있었는지 알 방법이 없다.
2. **LinkedIn 프로필을 만들고 사이트 전역(about, dev-portfolio, links.json)에
   연결한다** — 지금 가장 큰 채용 채널 공백.
3. **GitHub 개인 프로필/공개 저장소 링크를 추가한다** — dev-portfolio 자체
   평가에서 이미 15일째 미해결로 남아 있는 항목.
4. **dev-portfolio 자체 평가가 이미 지적한 스크린샷 0개, 이력서/연락처 링크
   부재를 채운다.**
5. **채용 담당자가 처음 도달하는 경로(links.json, about)에서 개발자 정체성이
   다른 9개 정체성에 묻히지 않도록 신호를 명확히 한다.**
6. **LinkedIn·GitHub가 열리면, 이미 있는 채널(브런치·아트스테이션·카카오톡
   오픈채팅)의 프로필/글에 허브 URL을 실제로 언급해 백링크를 처음으로
   만든다.**
7. **몇 주 뒤, GoatCounter 실데이터 + `site:` 검색 재확인으로 실제 색인·유입
   여부를 다시 검증한다** — 이번 리포트가 확인 못 한 것을 다음 회차가
   확인하는 구조.

## 참고 자료 / 확인 방법

- 저장소 직접 확인: `analytics-config.js`, `robots.txt`, `sitemap.xml`,
  `about/index.html`, `portfolio/index.html`, `dev-portfolio/index.html`,
  `links/links.json`, `dev-portfolio/assets/`, `googlee344d90eaf3c6edd.html`,
  `reports/rogan-static_site_seo_necessity-1786600000000000.html`.
- WebSearch 실행 쿼리(2026-08-25): `site:delight0517.github.io/releasepilot-reports`,
  `site:delight0517.github.io/releasepilot-reports portfolio`,
  `"releasepilot-reports" 김근후`, `"delight0517.github.io" -site:github.com`
  — 전부 무관한 결과만 반환.

---

## 갱신 기록

### 2026-08-25 — 최초 작성 (v1)
위 §1~7 전체. 첫 회차라 이전 회차와 비교할 데이터 없음.

### 2026-08-31 — 2차 점검 (v2)

지난 회차(2026-08-25) 이후 실제로 바뀐 것과, 여전히 안 바뀐 것을 구분해서 재확인했다.

**실제로 진행됨 (저장소 직접 확인):**
- `dev-portfolio/index.html`에 JSON-LD 구조화 데이터(Person + BreadcrumbList +
  SoftwareApplication×6)가 새로 추가됨(커밋 `0419d83`). 다만 `Person`의
  `sameAs`가 빈 배열(`[]`)이라, LinkedIn·GitHub 링크가 아직 없어서 채용
  담당자용 채널 연결 효과는 아직 발생하지 않는다.
- dev-portfolio의 `og:image`가 카카오 CDN(`img1.kakaocdn.net`)에서 자체
  호스팅(`icons/icon-1024.png`)으로 교체됨 — 외부 서비스 의존 제거.
- `sitemap.xml` 등록 URL 수가 지난 회차 확인 시점 16개 → 오늘 확인 45개로
  늘어남(별도 세션의 SEO 점검, `reports/2026-08-27-portfolio-seo-audit.html`
  참고. 그 리포트가 만든 `scripts/generate_sitemap.py`가 원인).

**새로 드러난 중요 사실 (2026-08-27 별도 SEO 점검이 발견, 이번 트리에 반영):**
`reports/2026-08-27-portfolio-seo-audit.html`가 지적한 내용을 직접 확인한
결과 — **GitHub Pages는 크롤러가 도메인 루트(`delight0517.github.io/robots.txt`)만
읽는데, 이 사이트는 서브경로(`/releasepilot-reports/`)라 `robots.txt`와 그
안의 `Sitemap:` 선언 자체를 검색엔진이 볼 수 없다.** 즉 지난 회차(§4)가
"인프라(색인성 기본기)는 이미 끝나 있다"고 판단한 근거(robots.txt/sitemap.xml
존재) 중 robots.txt 경로는 구조적으로 무력화되어 있었다는 뜻이다. Search
Console·네이버 서치어드바이저에 sitemap.xml을 **직접 제출**하는 것이 사실상
유일하게 남은 색인 경로다.

**여전히 변화 없음 (재확인, 지난 회차와 동일한 상태):**
- `analytics-config.js`의 `GOATCOUNTER_CODE`는 여전히 `"YOUR_CODE"` —
  방문자 데이터는 계속 0.
- LinkedIn 링크 — 저장소 전체(`links/links.json`, `about/`, `dev-portfolio/`,
  새로 추가된 JSON-LD의 `sameAs`)를 다시 검색해도 어디에도 없음.
- GitHub 개인 프로필 링크 — 마찬가지로 없음(저장소 다운로드용 zip 링크는
  있지만 "이 사람의 GitHub 프로필"은 아님).
- `dev-portfolio/assets/`에는 여전히 `icons/` 폴더 하나뿐 — 스크린샷 0개,
  페이지 내 주석도 프로젝트마다 "촬영 예정" 그대로.
- dev-portfolio hero 영역에 이메일/이력서 링크 없음 — 재확인.
- `links/links.json`의 "앱 개발" 항목은 여전히 `pinned` 없이 10개 정체성과
  동일 비중으로 나열됨.
- WebSearch 재확인(`site:delight0517.github.io/releasepilot-reports`,
  `"delight0517.github.io" dev-portfolio`) — 이 사이트를 가리키는 결과
  여전히 0건.

**이번 회차 노드 상태 변경:** 없음. 위 "실제로 진행됨" 항목들은 이번 트리의
9개 노드 중 어느 것도 완료 기준(각 노드 `sourceSection`이 요구하는 구체적
산출물)을 충족하지 못해 전부 `todo` 유지. JSON-LD·og:image 개선은 긍정적
신호지만, `linkedin_profile_link`·`github_profile_link`·
`positioning_signal_for_recruiters` 노드가 요구하는 "실제 채널 연결"에는
아직 못 미친다. 대신 `gsc_index_verify` 노드의 `why`/`action`을 위 robots.txt
구조적 한계를 반영해 갱신했다(아래 growth_tree.json 참고).

**다음 회차 확인 사항:** Search Console/네이버 서치어드바이저 직접 제출이
실제로 됐는지, sitemap 45개에서 더 늘었는지, 그리고 위 "여전히 변화 없음"
항목 중 하나라도 실제로 착수됐는지를 확인한다.
