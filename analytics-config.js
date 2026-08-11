// GoatCounter 방문자 분석 설정 — 사이트 전체에서 이 한 파일만 값을 채우면 됨.
//
// 1) https://www.goatcounter.com 에서 무료 가입 후 사이트 코드를 정한다
//    (예: 코드를 "releasepilot"으로 정하면 대시보드 주소는
//    https://releasepilot.goatcounter.com 이 된다).
// 2) 아래 GOATCOUNTER_CODE 값을 "YOUR_CODE" 대신 실제 코드로 바꾼다.
// 3) 이 파일 하나만 고치고 커밋/push하면 이 파일을 불러오는
//    모든 페이지(루트 index.html, about/, portfolio/, apps/gallery/ 등)에
//    자동으로 반영된다 — 페이지마다 따로 고칠 필요 없음.
//
// 자세한 가입/설정 방법: docs/goatcounter_setup_walkthrough.md
// (23AppdeveloperReleaser 프로젝트 루트의 docs/ 폴더)
//
// 참고: 이 값이 "YOUR_CODE"인 동안은 아래 count.js가 잘못된 도메인으로
// 요청을 보내 조용히 실패한다(페이지 동작에는 영향 없음, 방문자 데이터만
// 수집되지 않음) — 정상적인 placeholder 상태다.
window.GOATCOUNTER_CODE = "YOUR_CODE";

(function () {
  var code = window.GOATCOUNTER_CODE;
  if (!code || code === "YOUR_CODE") return; // 실제 코드가 세팅되기 전엔 아무 것도 하지 않음
  var s = document.createElement("script");
  s.async = true;
  s.setAttribute("data-goatcounter", "https://" + code + ".goatcounter.com/count");
  s.src = "//gc.zgo.at/count.js";
  document.head.appendChild(s);
})();
