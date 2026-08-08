// Firebase 프로젝트 설정 — 이 사진 갤러리 전용.
//
// 이 파일의 값들은 "public config"다. Firebase 웹 config(apiKey 포함)는
// 브라우저에 그대로 노출되는 게 정상이며 비밀값이 아니다 — 실제 접근 제어는
// Firebase Console의 Firestore/Storage 보안 규칙(이 저장소에는 없고, Firebase
// Console 안에서 설정하는 서버 측 규칙)이 담당한다. 자세한 값 채우는 법은
// docs/firebase_setup_walkthrough.md 참고.
//
// 아래 값을 전부 채우기 전까지 갤러리는 "설정 필요" 안내만 보여주고
// 로그인/업로드 기능은 비활성 상태로 남는다 (app.js의 isConfigured() 참고).
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

// 관리자(=업로드/수정/삭제 권한을 줄 사람)의 이메일.
// 지금은 단일 관리자(rogan 본인) 전제 — Firebase Auth로 로그인만 하면 이 사이트
// 방문자 누구든 이메일 하나만 등록되면 "관리자"로 취급된다. 여러 사람이
// 편집해야 하는 상황이 되면 이 상수 대신 Firestore 규칙에서 UID 화이트리스트로
// 좁히는 걸 권장 — docs/firebase_setup_walkthrough.md 하단 참고.
export const ADMIN_NOTE =
  "이 갤러리는 Firebase Authentication에 등록된 계정이면 누구나 로그인해 편집할 수 있습니다. " +
  "본인 외에는 계정을 만들지 마세요(Firebase Console > Authentication에서 이메일/비밀번호 provider를 켜되, " +
  "가입 UI는 이 페이지에 없고 Console에서 직접 사용자를 추가하는 방식만 지원합니다).";
