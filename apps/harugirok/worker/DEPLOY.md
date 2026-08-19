# harugirok-storage 배포 절차

library-notes-storage와 완전히 별도인 Worker/KV다 — 절대 공유하지 않는다.

1. `wrangler login` — 브라우저가 열리면 Cloudflare 계정으로 로그인·승인 (이미
   로그인돼 있으면 생략).
2. 이 폴더(`apps/harugirok/worker`)에서:
   ```
   wrangler kv namespace create HARUGIROK_KV
   ```
   출력된 `id`를 `wrangler.toml`의 `REPLACE_WITH_KV_NAMESPACE_ID`에 붙여넣기.
3. 배포:
   ```
   wrangler deploy
   ```
   배포가 끝나면 `https://harugirok-storage.<계정서브도메인>.workers.dev` 형태의
   URL이 출력됨.
4. `apps/harugirok/app.js`의 `STORAGE_API_URL`과, Flutter 앱
   `lib/services/feedback_service.dart`의 `_baseUrl`을 3번에서 나온 실제
   URL로 바꾸고 커밋 + push (GitHub Pages가 자동 반영, Flutter 쪽은 다음
   빌드/배포에 반영).
5. 배포 후 웹 페이지에서 유저명(2~24자) / PIN(숫자 4자리)으로 로그인하면
   자동으로 새 계정이 생성됨.

## 엔드포인트

- `POST /api/auth` `{username, pin}` — 로그인/계정 생성
- `POST /api/save` `{username, pin, checkins, addictionModules}` — 저장
- `POST /feedback` `{message, screen, appVersion, platform, recentLogs, username?}` —
  네이티브 앱/웹 양쪽의 "피드백 보내기" 버튼이 호출. `feedback:<ISO시각>` 키로
  저장되며, 사람이 나중에 KV를 열어 바로 읽을 수 있는 평문 JSON이다.
- `GET /feedback` — 저장된 피드백 전체 목록(최신순). 나중에 Claude가 이걸
  보고 고칠 때 사용.
