---
id: 2026-08-11_windows-apps-no-download-yet
type: bug-report+feature-request
from: mac
to: windows
created: 2026-08-11
status: open
---

## 배경

사용자가 릴리저 허브 웹사이트(`downloads/`)를 보고 "Windows 앱들이 하나도
다운로드가 안 된다, 왜 그런지 확인하고 되게 하라"고 요청했습니다.

## 조사한 것 (Mac, 2026-08-11)

`progress/data.json`(다운로드 페이지가 읽는 데이터)을 직접 까보니, **Windows가
뭘 빠뜨린 게 아니라 애초에 "실제로 올린 빌드의 URL"을 기록할 필드 자체가
없었습니다** — `tool/launch_progress_cli.dart`의 `PlatformDistribution`은
진행 단계(%)만 보고 `not_built`/`unsigned_warning`/`store_track` 상태를
계산할 뿐, 실제 다운로드 링크(`downloadUrl`)를 담는 곳이 어디에도 없었습니다.
그래서 어떤 앱이든(Mac 쪽도 마찬가지) 빌드가 끝났어도 웹에 뜨는 버튼은 항상
"준비 중"이었습니다 — Windows만의 문제가 아니라 **Mac/Windows 공통 스키마 공백**
이었습니다.

## Mac 쪽에서 이미 고친 것

`tool/launch_progress_cli.dart` + 앱 내부 모델(`launch_progress.dart`,
`launch_progress_store.dart`)에 `downloadUrls: {platform: url}` 필드를
추가했습니다:

```
dart run tool/launch_progress_cli.dart set --app <슬러그> --stage <단계> \
  --download-urls "windows=https://delight0517.github.io/releasepilot-reports/downloads/<slug>/app.exe"
```

- 값이 있으면(그리고 platform이 `windows`/`mac`이고 상태가 `unsigned_warning`
  이상이면) `progress/data.json`의 `distribution[].downloadUrl`에 실제 URL이
  채워지고, 다운로드 페이지 버튼이 "경고 감수하고 다운로드"로 바뀝니다.
- 값이 없으면 문구가 "로컬 빌드는 있으나 아직 어디에도 업로드되지 않았습니다"로
  더 정직하게 바뀝니다(이전엔 "서명/공증 여부 확인 안 됨"으로 애매했음).
- 빈 문자열(`windows=`)을 주면 그 플랫폼 링크를 지울 수 있습니다.
- 이미 `progress/data.json`을 재수출해서 push했습니다(`8b995f7`) — 지금 사이트는
  더 정직한 문구로 바뀌어 있지만, 실제 다운로드 링크는 아직 어떤 앱도 없습니다
  (Mac 쪽도 아직 하나도 안 올림 — Mac 몫도 남아 있음, 별개로 처리 예정).

## Windows 쪽에 요청하는 것

1. **같은 필드/명령 스키마로 미러링**: Windows LaunchPad의 진행률 CLI(또는
   동등 기능)에 `downloadUrls` 개념을 추가해주세요 — Mac Dart 코드를 그대로
   쓸 필요는 없고, `entry['downloadUrls'] = {platform: url}`과 계산 로직
   (`unsigned_warning` 이상 + URL 있음 → 다운로드 버튼)만 같으면 됩니다.
   `progress/data.json`은 두 플랫폼이 공유하는 파일이라 스키마가 갈리면 한쪽이
   덮어쓸 때 다른 쪽 필드가 사라질 수 있으니, 정확히 이 필드명(`downloadUrls`)을
   써주세요.
2. **학습 OX 퀴즈(ox-quiz)**: `progress/data.json` 기준 이미 Windows 빌드가
   있다고 기록돼 있습니다(status: unsigned_warning). 이 빌드를 어딘가
   공개 URL로 올리고(예: 이 저장소의 `downloads/<slug>/` 경로, 또는 GitHub
   Releases) `--download-urls windows=<url>`로 기록해주세요.
3. **4VPN Blocker**: Windows 포팅 진행 중이라고 알고 있는데 아직 `not_built`
   단계입니다 — Windows 빌드가 실제로 실행 가능한 상태가 되면 `--stage
   build_signed` 이상으로 올리고 같은 방식으로 URL을 기록해주세요.
4. 참고로 `docs/19_hub_bridge.md`에 이미 "3일 자동 동기화" 파이프라인이 있어서
   (`launch_progress_cli.dart export` → `progress/data.json` → git push),
   이 필드를 채워두면 다음 자동 동기화 때 자동으로 사이트에 반영됩니다 — 수동
   push 안 해도 됩니다.

## 급한 정도

급하지 않습니다 — 실제 빌드 업로드는 Windows 세션 일정에 맞춰 진행해주세요.
