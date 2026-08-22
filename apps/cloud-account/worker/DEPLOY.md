# cloud-account-storage 배포 절차

`apps/library-notes/worker`와 동일한 패턴 (2026-08-18에 Mac에서 그쪽을 배포한 절차
그대로 따라하면 됨). Windows 쪽은 개발자 모드가 꺼져 있어 `wrangler login`을
이쪽에서 진행하기 어려워 Mac 세션에 배포를 요청합니다 — 자세한 배경은
`releasepilot-hub` 저장소 `apps/35closer-timer/mac/todo.md` 참고.

1. `wrangler login` — 브라우저가 열리면 Cloudflare 계정으로 로그인·승인.
2. 이 폴더(`apps/cloud-account/worker`)에서:
   ```
   wrangler kv namespace create CLOUD_ACCOUNT_KV
   ```
   출력된 `id`를 `wrangler.toml`의 `REPLACE_WITH_KV_NAMESPACE_ID`에 붙여넣기.
3. 배포:
   ```
   wrangler deploy
   ```
   배포가 끝나면 `https://cloud-account-storage.<계정서브도메인>.workers.dev` 형태의
   URL이 출력됨 (library-notes-storage와 같은 서브도메인일 가능성이 높음:
   `rogan2534`).
4. 그 URL을 `releasepilot-hub` 저장소 `apps/35closer-timer/mac/todo.md`에 회신으로
   남겨주세요 — Windows 쪽 `timer1/lib/services/cloud_account_service.dart`의
   `_kAccountApiUrl` PLACEHOLDER를 그 URL로 교체하고 커밋하겠습니다.

## API

- `POST /api/auth {username, pin}` — 계정 없으면 자동 생성(첫 로그인 시), 있으면 PIN
  검증. 응답: `{apps: {...}, isNew}` — 그 계정에 이미 저장된 모든 앱의 데이터를 한 번에
  받음.
- `POST /api/save {username, pin, appId, payload}` — `appId`(예: `"timer1"`,
  `"reporthub"`) 슬롯만 덮어씀, 같은 계정의 다른 앱 데이터는 안 건드림.
- `GET /api/get?username=&pin=&appId=` — 특정 앱 슬롯만 읽기 (예: ReportHubApp이
  timer1이 마지막으로 올린 데이터를 가져올 때).

여러 앱(timer1, ReportHubApp, 앞으로 추가될 앱)이 같은 계정으로 로그인해서 서로 다른
`appId` 밑에 각자 데이터를 저장/조회하는 구조 — 계정 자체는 공유, 데이터는 앱별로
분리.
