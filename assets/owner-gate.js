// 소유자 전용 콘텐츠 게이트 — 정적 사이트(백엔드 없음)라 진짜 보안 경계는
// 아님(이 파일 자체가 공개 저장소에 있어 키 문자열도 누구나 볼 수 있음).
// 목적은 방문자가 "구조만 있고 콘텐츠가 없는" 미완성 카테고리를 우연히
// 보고 준비 안 된 포트폴리오라는 인상을 받지 않게 막는 것뿐 — ReleasePilot
// Mac 앱이 이 키를 붙여 열면 이 브라우저에서 계속 소유자로 남는다.
(function () {
  var OWNER_KEY = 'vivid-owner-7f2c9a41d0';
  var STORAGE_KEY = 'vividOwner';

  try {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('owner');
    if (q === OWNER_KEY) {
      localStorage.setItem(STORAGE_KEY, '1');
      params.delete('owner');
      var qs = params.toString();
      var clean =
        window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
      window.history.replaceState({}, '', clean);
    }
  } catch (e) {}

  window.isVividOwner = function () {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  };
})();
