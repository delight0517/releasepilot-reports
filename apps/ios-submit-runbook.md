# iOS 제출 자율 재개 Runbook (박새로이)

> 목적: 웹 폼(Xcode/ASC) 클릭 작업이 막히면, 에이전트가 스스로 멈춤을
> 감지하고 우회법을 순서대로 시도한 뒤, 그래도 안 되면 사용자에게
> "정확히 무엇을" 요구할지 보고한다. (로간님 지시 2026-[REDACTED])

## 멈춤 감지 신호
다음 중 하나면 "멈춤"으로 간주하고 아래 우회 체인 실행:
- computer_use 클릭 결과 `effect: unverifiable` 이고 capture_after에서 화면이 안 바뀜
- Safari/Firefox 창이 stale (window_not_found) 또는 복제됨 (여러 window_id)
- 스크롤이 안 먹힘 (ambiguous_window_target 등)
- "No active window" / "call capture() first"

## 자율 재개 우회 체인 (순서대로)
1. **foreground 클릭**: background AX 클릭이 SPA 링크 안 통하면 `delivery_mode:"foreground"` 로 재시도
2. **capture_after 검증**: 클릭 직후 capture 해서 화면 전환 확인. 안 바뀌면 3으로
3. **다른 브라우저**: Safari 안 되면 Firefox, Firefox 안 되면 Safari
4. **URL 직접 이동**: 앱 상세 URL을 주소창에 직접 입력 (앱 ID 모르면 목록에서 재클릭)
5. **키보드 우회**: 스크롤 멈추면 `cmd+down` / Page Down / 스페이스
6. **윈도우 명시**: 여러 창 뜨면 반드시 `window_id` 파라미터 붙임
7. **그래도 안 되면**: 사용자에게 "무엇이 막혔는지 + 정확히 무슨 입력이 필요한지" 1줄 보고 후 대기

## 현재 진행 (2026-[REDACTED])
- ✅ 3개 업로드 완료 (PomodoroCage / RiseSync / harugirok)
- ✅ 메타데이터 초안 작성 (ios-release-tracker.md)
- ✅ 스크린샷 확보 (PomodoroCage 3 / RiseSync 1 / harugirok 1)
- ✅ RiseSync 상세 페이지 도달 (iOS App Version 1.0, Prepare for Submission)
- ⏳ 스크린샷 업로드 + 설명 입력 + Add for Review (3개 앱 반복)
- ⏳ 제출 후 심사 상태 폴링

## 주의
- 제출(submit)은 로간님 Apple ID 세션 필요 (2FA는 로간님)
- API 키(Issuer ID) 없으므로 ASC API 자동화 불가 → 웹 폼 클릭 방식만 가능
- 비전 키(401) 없으므로 화면은 AX 트리로만 판단 (이미지 직접 못 봄)
