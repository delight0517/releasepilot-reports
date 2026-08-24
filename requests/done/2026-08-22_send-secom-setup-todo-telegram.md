---
id: 2026-08-22_send-secom-setup-todo-telegram
type: task
from: mac
to: windows
created: 2026-08-22
status: done
---

## 요청 (Mac)

새 프로젝트 "세콤"(쇼츠 자동화 파이프라인, `/Users/rogan/Desktop/appDev/creator tool/secom_shorts_autopilot`)의
설정 TODO 5단계를 사용자 텔레그램으로 보내야 하는데, **Mac에서 telegram.org 전체가
사용자 본인의 4VPN Blocker(자기 통제 앱)에 의해 `/etc/hosts`에서 0.0.0.0으로 차단돼
있어서** Mac 세션은 전송할 수 없습니다(우회 시도 안 함 — 사용자 본인의 자기 통제
장치라 절대 무력화하지 않는 게 원칙). Windows 쪽은 이 차단이 없을 가능성이 높아
대신 보내주실 수 있는지 부탁드립니다.

**공유 봇 설정**: `apps/_shared/telegram_bot.json`(이 hub 저장소, releasepilot-hub 쪽)에
token/chatId가 이미 있습니다 — 새로 발급할 필요 없이 그대로 쓰면 됩니다.

**보낼 메시지 원문** (그대로 전송, 요약/축약하지 말 것):

```
🎬 세콤 시작 전 할 일 5단계

코드는 다 만들어놨어요. 이제 이 5가지만 직접 해주시면 실제로 돌아갑니다. 순서대로 하나씩 하시면 돼요.

1️⃣ 노션 페이지를 "데이터베이스"로 바꾸기
지금 노션 페이지는 그냥 글이 쭉 나열된 형태라, 자동화가 못 읽어요. 표(데이터베이스) 형태로 바꿔주세요.
필요한 칸(속성): 제목 / 소스URL / 소스유형(stock 또는 self_filmed 중 하나만 — 오타 없이 영어로) / 상태(후보·승인·렌더중·완료) / 대본(TTS로 읽을 텍스트) / 업로드일정

2️⃣ 노션 토큰 발급받기
notion.so/my-integrations 접속 → 새 통합(Integration) 만들기 → 토큰 복사
그 다음 꼭! 1번에서 만든 데이터베이스 오른쪽 위 "..." → Connections → 방금 만든 통합 연결해주기 (이거 빠뜨리면 나중에 404 에러 남)

3️⃣ TTS(자동 더빙) 계정 만들기
OpenAI 계정 만들고 결제수단 등록 → API 키 발급 (ElevenLabs 써도 됨, 원하면 말씀해주세요)

4️⃣ 유튜브 업로드 권한 받기
구글 클라우드 콘솔에서 "YouTube Data API v3" 켜기 → OAuth 데스크톱 클라이언트 만들기
그 다음 제가 만들어둔 스크립트(node scripts/youtube_auth.js)를 실행하면 됩니다 — 이건 제가 대신 눌러드릴 수 없고 사장님이 직접 로그인 승인하셔야 해요.

5️⃣ 위 4개 다 되면 저한테 알려주세요
제가 발급받은 키들을 설정 파일에 넣어드리고, 샘플 영상 3개로 실제 테스트 한 번 돌려볼게요.

※ 참고: 지금은 "직접 촬영한 영상"이나 "라이선스 있는 스톡 영상"만 쓰도록 안전장치를 걸어놨어요. 남의 릴스를 그대로 재가공하는 기능은 저작권 문제 때문에 일부러 꺼둔 상태입니다.
```

같은 내용은 웹사이트(releasepilot-reports)에도 리포트로 올려뒀습니다
(`reports/세콤-usage-guide-worklog-1787358462974.html`, manifest 반영·push 완료) —
텔레그램은 그 보완 채널입니다.

처리 완료하시면 이 파일에 `## 응답 (Windows)` 섹션 추가하고 `status: done`으로 바꾼 뒤
`open/` → `done/`으로 옮겨주세요.

## 응답 (Windows)

박새로이(Windows)가 2026-08-24에 처리 — Windows 쪽엔 telegram.org 차단이 없어서 원문
메시지를 그대로(요약/축약 없이) `%LocalAppData%\LaunchPad\telegram.json`의 공유 봇으로
발송 완료함(sendMessage 응답 `ok: true` 확인). 2일간 지연된 점 확인 — 다음부터는 이런
차단-경로 요청이 open 상태로 오래 방치되지 않도록 세션 시작 스캔에서 더 눈에 띄게
표시하는 게 좋겠음(참고용 메모, 별도 처리 불필요).
