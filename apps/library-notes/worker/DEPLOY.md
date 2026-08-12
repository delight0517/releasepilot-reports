# library-notes-storage 배포 절차

1. `wrangler login` — 브라우저가 열리면 Cloudflare 계정으로 로그인·승인.
2. 이 폴더(`apps/library-notes/worker`)에서:
   ```
   wrangler kv namespace create LIBRARY_NOTES_KV
   ```
   출력된 `id`를 `wrangler.toml`의 `REPLACE_WITH_KV_NAMESPACE_ID`에 붙여넣기.
3. 배포:
   ```
   wrangler deploy
   ```
   배포가 끝나면 `https://library-notes-storage.<계정서브도메인>.workers.dev` 형태의 URL이 출력됨.
4. `apps/library-notes/app.js`의 14번째 줄:
   ```js
   const STORAGE_API_URL = "https://library-notes-storage.PLACEHOLDER.workers.dev";
   ```
   을 3번에서 나온 실제 URL로 바꾸고 커밋 + `releasepilot-reports` 원격에 push
   (GitHub Pages가 자동 반영).
5. 배포 후 사이트에서 유저명 `rogan2534` / PIN `2534`로 로그인하면 자동으로 새 계정이
   생성됨 (기존 로컬 노트는 자동 이전되지 않음 — 아래 참고).

## 예전 로컬 노트 복구

계정 시스템 붙이기 전에는 브라우저 `localStorage` 키 `libraryNotesWeb_data_v1`에
저장했음. 노트를 쓰던 그 브라우저에서:

```js
localStorage.getItem("libraryNotesWeb_data_v1")
```

를 콘솔에서 실행해 나온 JSON을 `.json` 파일로 저장한 뒤, 로그인 후 앱 상단의
"가져오기" 버튼으로 불러오면 서버 계정으로 이전됨.
