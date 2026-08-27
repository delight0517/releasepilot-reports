/*!
 * rk-lightbox — 릴리저 포트폴리오 공용 몰입 이미지 뷰어
 * ------------------------------------------------------
 * 이 스크립트 한 줄(<script src="…/assets/lightbox.js" defer></script>)만 넣으면
 * 그 페이지의 모든 콘텐츠 이미지가 클릭 시 어두운 배경 위 대형 뷰어로 열린다.
 * JS로 동적 생성된 이미지도 클릭 순간 판정하므로 자동 커버된다.
 *
 * 규칙
 *  - <a> 안의 이미지는 링크 이동 우선(건드리지 않음). 단 data-zoom 속성이 있으면 확대 우선.
 *  - data-nozoom 가 붙은 이미지(아바타·아이콘 등)는 제외.
 *  - 자연 폭 240px 미만짜리 작은 그림은 제외(아이콘 성격).
 *  - 열린 상태: ←/→ 이동, Esc 닫기, 이미지 클릭으로 화면맞춤↔원본크기 전환.
 */
(function () {
  "use strict";
  if (window.__rkLightbox) return;
  window.__rkLightbox = true;

  var MIN_NATURAL_WIDTH = 240;
  var css = [
    ".rklb{position:fixed;inset:0;z-index:9999;display:none;background:rgba(9,9,11,.96);",
    "-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}",
    ".rklb.open{display:flex;flex-direction:column}",
    ".rklb-stage{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:28px;-webkit-overflow-scrolling:touch}",
    ".rklb-stage.fit{overflow:hidden}",
    ".rklb-img{max-width:100%;max-height:100%;width:auto;height:auto;border-radius:2px;",
    "box-shadow:0 30px 90px rgba(0,0,0,.65);cursor:zoom-in;transition:opacity .18s ease}",
    ".rklb-stage.one .rklb-img{max-width:none;max-height:none;cursor:move}",
    ".rklb-bar{display:flex;justify-content:space-between;align-items:center;gap:14px;",
    "padding:12px 18px;color:#e9e7ee;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em}",
    ".rklb-cap{opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".rklb-btns{display:flex;gap:8px;flex:none}",
    ".rklb-btns button{background:rgba(233,231,238,.08);border:1px solid rgba(233,231,238,.25);color:#e9e7ee;",
    "min-width:42px;height:42px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}",
    ".rklb-btns button:hover{background:rgba(233,231,238,.2)}",
    ".rklb-nav{position:fixed;top:50%;transform:translateY(-50%);width:48px;height:48px;font-size:19px}",
    ".rklb-prev{left:14px}.rklb-next{right:14px}",
    "@media (prefers-reduced-motion:reduce){.rklb-img{transition:none}}"
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "rklb";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML =
    '<div class="rklb-bar">' +
    '  <span class="rklb-cap"></span>' +
    '  <span class="rklb-btns">' +
    '    <button type="button" class="rklb-prev rklb-nav" aria-label="이전">←</button>' +
    '    <button type="button" class="rklb-next rklb-nav" aria-label="다음">→</button>' +
    '    <button type="button" class="rklb-close" aria-label="닫기">×</button>' +
    '    <span class="rklb-count"></span>' +
    "  </span>" +
    "</div>" +
    '<div class="rklb-stage fit"><img class="rklb-img" alt=""></div>';
  document.body.appendChild(root);

  var stage = root.querySelector(".rklb-stage"),
      imgEl = root.querySelector(".rklb-img"),
      capEl = root.querySelector(".rklb-cap"),
      cntEl = root.querySelector(".rklb-count");

  var list = [], cur = -1;

  function zoomable(el) {
    if (!el || el.tagName !== "IMG") return false;
    if (el.closest("[data-nozoom]")) return false;
    var inLink = !!el.closest("a[href]");
    var forced = el.hasAttribute("data-zoom");
    if (inLink && !forced) return false;
    if ((el.naturalWidth || 0) && el.naturalWidth < MIN_NATURAL_WIDTH && !forced) return false;
    var src = el.currentSrc || el.src || "";
    return src && src.indexOf("data:") !== 0;
  }
  function collect() {
    var all = document.querySelectorAll("img"), out = [];
    for (var i = 0; i < all.length; i++) if (zoomable(all[i])) out.push(all[i]);
    return out;
  }
  function render() {
    var src = list[cur];
    imgEl.style.opacity = "0";
    var loader = new Image();
    loader.onload = function () {
      imgEl.src = loader.src;
      imgEl.alt = src.alt || "";
      imgEl.style.opacity = "1";
    };
    loader.src = src.currentSrc || src.src;
    capEl.textContent = src.alt || "";
    cntEl.textContent = (cur + 1) + " / " + list.length;
    stage.classList.remove("one");
    stage.classList.add("fit");
    stage.scrollTop = 0; stage.scrollLeft = 0;
  }
  function open(idx) {
    list = collect();
    if (!list.length) return;
    cur = Math.max(0, Math.min(idx, list.length - 1));
    render();
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
  }
  function close() {
    root.classList.remove("open");
    root.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
  }
  function step(d) {
    if (!list.length) return;
    cur = (cur + d + list.length) % list.length;
    render();
  }

  // 클릭 위임 — 동적 생성 이미지까지 자동 처리
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (root.contains(t)) {           // 뷰어 내부 클릭
      if (t === imgEl) {              // 이미지 클릭: 화면맞춤 ↔ 원본 크기
        var one = stage.classList.toggle("one");
        stage.classList.toggle("fit", !one);
        if (!one) { stage.scrollTop = 0; stage.scrollLeft = 0; }
      } else if (t === stage) { close(); }
      return;
    }
    var img = t.closest ? t.closest("img") : null;
    if (!img || !zoomable(img)) return;
    var now = collect(), idx = now.indexOf(img);
    if (idx === -1) return;
    e.preventDefault();               // data-zoom 앵커라도 이동 막고 확대 우선
    list = now; cur = idx; render();
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
  }, true);                            // 캡처 단계: 앵커 기본 이동보다 먼저

  root.querySelector(".rklb-close").addEventListener("click", close);
  root.querySelector(".rklb-prev").addEventListener("click", function () { step(-1); });
  root.querySelector(".rklb-next").addEventListener("click", function () { step(1); });
  document.addEventListener("keydown", function (e) {
    if (!root.classList.contains("open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
})();
