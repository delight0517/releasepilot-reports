# 사진 갤러리 — Firebase 설정 가이드 (초보용, 터미널 몰라도 됨)

이 문서는 `apps/gallery/`(사진 갤러리 페이지)가 로그인·업로드·수정·삭제를
실제로 동작시키기 위해 **rogan님이 딱 한 번, 구글 계정으로 로그인해서** 직접
해야 하는 설정을 순서대로 안내합니다. 코드는 이미 다 준비되어 있고, 아래
단계로 발급받은 값 6개만 파일 하나에 붙여넣으면 끝입니다.

예상 소요 시간: 15~20분. 중간에 막히면 그 화면을 캡처해서 물어봐주세요.

---

## 0. 미리 알아둘 것

- Firebase는 구글이 운영하는 서비스로, 로그인 계정 관리(Authentication)와
  데이터 저장(Firestore), 사진 파일 저장(Storage)을 무료 등급으로 제공합니다.
  이 갤러리 규모(개인 포트폴리오)는 무료 등급 안에서 충분히 돌아갑니다.
- 아래에서 발급받는 "config 값"(apiKey 등)은 **비밀번호가 아닙니다** —
  웹사이트라면 어차피 브라우저에 그대로 노출되는 공개 식별자입니다. 진짜 보안은
  6번 "보안 규칙" 단계에서 설정합니다.

---

## 1. Firebase 프로젝트 만들기

1. 브라우저에서 https://console.firebase.google.com 접속 → 평소 쓰는
   구글 계정(rogan2534@gmail.com)으로 로그인.
2. "프로젝트 추가" 클릭.
3. 프로젝트 이름 입력 (예: `rogan-gallery`). 아무 이름이나 상관없습니다.
4. "이 프로젝트에 Google 애널리틱스 사용" 옵션은 꺼도 됩니다(필요 없음).
5. "프로젝트 만들기" 클릭 → 몇 초 기다리면 완료.

## 2. 웹 앱 등록해서 config 값 받기

1. 방금 만든 프로젝트 화면에서, 가운데쯤 있는 `</>` (웹) 아이콘 클릭.
2. 앱 닉네임 입력 (예: `gallery-web`). "Firebase Hosting도 설정" 체크박스는
   **끄고** 진행 (이 사이트는 이미 GitHub Pages에 올라가 있어서 필요 없음).
3. "앱 등록" 클릭하면 화면에 아래처럼 생긴 코드 블록이 나타납니다:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "rogan-gallery.firebaseapp.com",
     projectId: "rogan-gallery",
     storageBucket: "rogan-gallery.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef123456",
   };
   ```

4. 이 6줄을 복사해두세요 (이 화면을 벗어나면 다시 찾기 번거로우니 메모장에
   붙여넣어 두는 걸 추천).
5. "콘솔로 이동" 클릭해서 다음 단계로.

## 3. 로그인 방식 켜기 (Authentication)

1. 왼쪽 메뉴에서 "빌드" → "Authentication" 클릭.
2. "시작하기" 클릭.
3. 로그인 제공업체 목록에서 **"이메일/비밀번호"** 클릭 → 첫 번째 스위치
   ("이메일/비밀번호")를 켜고 → "저장".
4. 상단 탭에서 "Users" (사용자) 탭 클릭 → "사용자 추가" 클릭 → 본인이 쓸
   이메일 주소와 비밀번호를 직접 입력해서 계정을 만드세요. (이 갤러리
   페이지에는 회원가입 화면이 따로 없습니다 — 관리자는 딱 한 명, 본인뿐이라서
   Console에서 직접 계정을 만드는 방식입니다.)

## 4. 데이터 저장소 켜기 (Firestore)

1. 왼쪽 메뉴 "빌드" → "Firestore Database" 클릭 → "데이터베이스 만들기".
2. 위치는 기본값(또는 `asia-northeast3` 서울)을 선택 → "다음".
3. 보안 규칙은 일단 "테스트 모드에서 시작"으로 진행 (6번에서 다시 제대로 설정할
   것입니다) → "사용 설정".

## 5. 사진 파일 저장소 켜기 (Storage)

1. 왼쪽 메뉴 "빌드" → "Storage" 클릭 → "시작하기".
2. 위치는 4번과 동일하게 맞추는 걸 권장 → "완료"까지 기본값으로 진행.

## 6. 보안 규칙 설정 (중요 — 꼭 하세요)

이 갤러리는 "로그인한 사람만 쓰기(업로드/수정/삭제) 가능, 로그인 안 한 방문자는
읽기만 가능"이 목표입니다.

**Firestore 규칙** — 왼쪽 메뉴 "Firestore Database" → 상단 탭 "규칙" 클릭 →
아래 내용으로 전체 교체 → "게시":

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /photos/{photoId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null;
    }
  }
}
```

**Storage 규칙** — 왼쪽 메뉴 "Storage" → 상단 탭 "규칙" 클릭 → 아래 내용으로
전체 교체 → "게시":

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /photos/{uid}/{fileName} {
      allow read: if true;
      allow write, delete: if request.auth != null;
    }
  }
}
```

(더 좁히고 싶다면 `request.auth != null` 대신
`request.auth.token.email == "본인이메일@gmail.com"`처럼 이메일 하나로
제한할 수도 있습니다. 지금은 계정을 본인 하나만 만들었으니 위 규칙으로도
충분합니다.)

## 7. 코드에 값 붙여넣기

이 저장소의 `apps/gallery/firebase-config.js` 파일을 열어서, 2번에서 복사해둔
6개 값을 `REPLACE_ME` 자리에 그대로 붙여넣으세요:

```js
export const firebaseConfig = {
  apiKey: "여기에 apiKey 값",
  authDomain: "여기에 authDomain 값",
  projectId: "여기에 projectId 값",
  storageBucket: "여기에 storageBucket 값",
  messagingSenderId: "여기에 messagingSenderId 값",
  appId: "여기에 appId 값",
};
```

저장 후 커밋/푸시하면(또는 Claude에게 "커밋하고 푸시해줘"라고 요청하면),
https://delight0517.github.io/releasepilot-reports/apps/gallery/ 에서
"관리자 로그인" 버튼으로 3번에서 만든 계정으로 로그인 → 사진을 드래그해서
업로드해볼 수 있습니다.

---

## 자주 막히는 부분

- **로그인이 "실패"라고만 뜬다**: 3번에서 이메일/비밀번호가 정확한지, "사용자
  추가"로 계정을 만들었는지 확인하세요.
- **사진 업로드가 안 된다 / 권한 오류**: 6번 보안 규칙을 게시했는지, 로그인이
  된 상태인지(화면 위쪽에 "로그인됨: ..." 문구가 보여야 함) 확인하세요.
- **페이지 열자마자 "Firebase 설정이 아직 없어..." 경고만 보인다**: 7번에서
  `firebase-config.js`의 `REPLACE_ME`가 아직 남아있는 부분이 있습니다.

---

## 남은 미해결 질문

- 별도 네이티브 iOS 앱이 정말 필요한지는 아직 확인되지 않았습니다. 지금은
  반응형 웹(모바일 Safari 대응 + "홈 화면에 추가")으로 구현해뒀습니다 — 써보고
  네이티브 앱이 필요하다고 느껴지면 다시 요청해주세요.
