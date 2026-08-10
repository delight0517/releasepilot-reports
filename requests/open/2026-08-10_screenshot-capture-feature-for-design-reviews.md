---
id: 2026-08-10_screenshot-capture-feature-for-design-reviews
type: feature-request
from: Windows (23_app_Releaser 세션)
to: Mac
created: 2026-08-10
status: open
---

## 배경 (Windows)

클로이 박(디자인팀장) 리뷰가 지금까지 순수 텍스트 리포트만 낼 수 있었습니다 — "이미지 스크린샷이 없어서 설득력이 떨어진다"는 사용자 피드백을 받았습니다. 원인: 클로이 박을 운영하는 이 AI 세션(Claude Code)의 브라우저 도구는 스크린샷을 화면에 "보여줄" 수는 있지만 파일로 저장하는 기능이 없어서, 리포트에 실제 이미지를 넣을 방법이 없었습니다. 헤드리스 Edge로 우회 시도도 해봤지만 이 세션(샌드박스) 환경 자체가 GUI 브라우저 프로세스 실행을 막고 있어 실패했습니다.

사용자가 "그러면 되도록 기능을 만들어! 맥과 윈도우 모두!"라고 명시적으로 요청 — AI 세션 밖, 즉 **실제 앱 프로세스 안에서 도는 캡처 기능**을 양쪽 다 만들어달라는 뜻입니다.

## Windows 쪽에서 만든 것 (2026-08-10, 참고용)

- `Services/ScreenshotCaptureService.cs` — `System.Drawing` + `user32.dll` P/Invoke(`GetSystemMetrics`)로 전체 가상 화면을 PNG로 캡처. (주의: `System.Windows.Forms.SystemInformation`을 쓰려다 `UseWindowsForms=true`가 이 WPF 앱 전역에서 `Brush`/`Button`/`Color` 등 31개 타입 충돌 빌드 에러를 냈음 — WinForms 참조 없이 순수 P/Invoke로 우회했습니다. Flutter 쪽은 이 문제와 무관할 가능성이 높지만 참고삼아 남깁니다.)
- `Services/ReportPublishService.cs`에 `PublishAsset(localFilePath, slug, out publicUrl)` 추가 — 임의 파일(스크린샷 등)을 `reports/screenshots/<slug>/`에 커밋·푸시, 매니페스트 항목 없이 URL만 반환(리포트가 그 URL을 `<img>`로 직접 참조).
- `DesignLeadWindow`에 "📸 5초 후 화면 캡처 → 리포트 자산으로 저장" 버튼 추가 — 클릭하면 5초 카운트다운(그 사이 사용자가 원하는 창을 앞으로 가져올 시간) 후 전체 화면을 캡처해 위 저장소에 자동 업로드.

## Mac 쪽에 요청하는 것

1. ReleasePilot(Flutter)에도 동일한 기능 부탁드립니다 — 화면(또는 특정 창) 캡처 → `releasepilot-reports/reports/screenshots/<slug>/`에 커밋·푸시 → URL 반환. Flutter/macOS라면 `screencapture`(macOS 기본 내장 CLI, `Process.run('screencapture', ['-x', outputPath])`)가 Windows의 P/Invoke보다 훨씬 간단할 것 같습니다.
2. 경로 규칙은 위 Windows 쪽과 동일하게 맞춰주시면 나중에 리포트에서 서로 참조하기 편합니다: `reports/screenshots/<slug>/<timestamp>.png`.
3. 급하지 않습니다 — Mac 쪽 다른 작업과 순서 조율해서 진행해주세요.
