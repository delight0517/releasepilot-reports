---
id: 2026-08-01_mac-app-releaser-marketing-game
type: feature
from: Windows (23_app_Releaser 세션)
to: Mac
created: 2026-08-01
status: done
---

## 요청 (Windows)

Windows 쪽 `23_app_Releaser`("LaunchPad" — 자기 앱을 Windows/Chrome/Firefox 스토어 등에
출시하도록 도와주는 도구, 이 Pomodoro 앱과는 별개 프로젝트)에 새 기능을 하나 만들었고,
같은 기능을 Mac 쪽에도 이식해달라는 사용자 요청을 받았습니다.

**참고**: 이 요청은 Pomodoro 앱 자체와는 무관하지만, 사용자가 명시적으로 이 공유 폴더에
남겨달라고 해서 여기 둡니다.

### 만든 기능: "🎯 마케팅 감각 게임 + 내 앱 계산기"

두 개 탭짜리 창:

1. **스토리 모드** — 5막짜리 미니게임. 각 막마다 선택지를 고르면, 그 선택이 실제로 어떤
   결과를 낳는지 **진짜 검증된 마케팅 프레임워크**로 계산해서 즉시 보여줍니다(허구의
   지수 공식이 아님):
   - Sean Ellis PMF 테스트("매우 실망" 응답 40% 이상 = 확장해도 안전)
   - Rogers 확산곡선(초기수용자는 전체의 13.5% — 처음엔 이 사람들만 노려라)
   - 깔때기 복리 효과(5단계를 각 10%씩 개선 = 1.1⁵-1 ≈ 61% 향상, 한 단계 몰빵보다 나음)
   - K-factor 바이럴 계수(초대수 × 초대전환율, K>1이면 저절로 확산)
   - CAC:LTV 3:1 룰(David Skok/Bessemer)
2. **내 앱에 적용** — 사용자가 자기 앱의 페르소나/시장규모/채널/예산을 입력하면 위
   프레임워크로 예상 클릭/설치/CAC/PMF 통과 여부를 실시간 계산 + "AI 리서치 프롬프트
   생성" 버튼(입력값 기반 리서치 프롬프트를 파일로 저장 — 실제 API 연동은 아직 없어서
   `claude -p`로 직접 실행하는 방식).

### Windows 쪽 실제 파일 (그대로 베끼지 말고 이 스펙을 Mac 네이티브 스택으로 재현할 것)

Windows 저장소 경로 `app dev/23_app_Releaser/`:
- `src/LaunchPad.App/MarketingMath.cs` — 순수 계산 로직(C#, 프레임워크 무관 — 공식/상수만
  옮기면 됨). 모든 숫자에 출처 주석 있음.
- `src/LaunchPad.App/MarketingGameWindow.xaml`/`.xaml.cs` — WPF UI(Windows 전용, 포팅
  대상 아님 — Mac은 SwiftUI 등 네이티브로 새로 만들 것).
- `files/MARKETING_LAUNCH_GUIDE.md` — 콘텐츠 원본 스펙(페르소나 템플릿, PMF 설문 템플릿,
  포지셔닝 문장 템플릿, 단계별 체크리스트). **이것부터 읽을 것.**
- `files/GUIDE_SOP.md` — Windows 쪽 "가이드 트랙" 표준 포맷 규칙(Mac에 동등한 가이드
  시스템이 있다면 그 컨벤션을 따르고, 없다면 이 문서의 원칙만 참고).

### Mac 쪽에 요청하는 것

1. Mac에 이미 "앱 출시 도우미" 앱이 있는지 먼저 확인(Windows 쪽엔 없어서 이 요청을 보낼
   때 확인 못 함 — 있다면 거기에 새 기능으로, 없다면 새로 만들지 사용자와 먼저 확인).
2. `MarketingMath.cs`와 동등한 순수 계산 모듈을 Swift(또는 실제 Mac 스택)로 작성 — 숫자와
   공식은 그대로, 출처 주석도 유지.
3. 스토리 모드(5막) + "내 앱에 적용" 계산기 UI 구현.
4. AI 리서치 프롬프트 생성 기능(파일 저장 + 클립보드 복사)도 동일하게.
5. 다 만들면 이 파일에 "## 응답 (Mac)" 섹션을 추가해서 뭘 만들었는지 남기고, 이 파일을
   `requests/done/`으로 옮길 것.

### 참고: 사용자가 실제로 한 말 (원문, 맥락용)
> "app realeaser에 다 만들어서 내가 이거를 통해서 실시간 계산 및 마켓팅에 대한 감을
> ui와 상황 설명 등을 통해서 되도록 개발자를 위한 스토리형 게임을 만들어봐! 상황
> 대입되도록. 그리고 실제 나의 앱으로 옮겨서 예상 인구 및 ai를 통해서 자료조사, 광고,
> 기대 등을 계산할 수 있게 해줘!"

## 응답 (Mac)

2026-07-31, Mac `23AppdeveloperReleaser` 세션에서 처리 완료.

1. **Mac 쪽 "앱 출시 도우미" 앱은 이미 있음** — `app_release_copilot`(코드네임
   ReleasePilot), Flutter/Dart 기반, iOS/Android/macOS 커버. **SwiftUI 새로 만들지
   않고 이 Flutter 앱에 새 기능으로 추가함** — Mac/Windows LaunchPad가 사실상 같은
   제품이라는 기존 결정(2026-07-24 확인) 때문. 참고 문서:
   `app_release_copilot/docs/06_agentic_release_vision.md`.
2. `MarketingMath.cs` → `app_release_copilot/client/lib/features/marketing_game/models/marketing_math.dart`
   로 1:1 포팅. 상수(Rogers 13.5%, PMF 40%, LTV:CAC 3:1)·공식(funnelCompoundGain,
   kFactor, cac 등)·채널별 CTR/스토어 전환율 벤치마크 테이블 그대로 유지, 출처 주석도 유지.
3. 스토리 모드(5막) + "내 앱에 적용" 계산기 UI 구현:
   `.../marketing_game/models/scenario.dart` (5막 시나리오, 선택지별 결과 텍스트 1:1 이식)
   `.../marketing_game/presentation/screens/marketing_game_screen.dart` (2탭 화면 —
   Windows판과 동일하게 스토리 모드는 한 스텝씩 진행형, 계산기 탭은 실시간 입력→결과).
4. AI 리서치 프롬프트 생성 — 프롬프트 문구 동일하게 포팅, 파일로 저장(`file_picker`
   저장 다이얼로그) + 클립보드 복사 둘 다 구현, 상태 텍스트에 `claude -p "$(cat '<path>')"`
   실행 안내 그대로 유지.
5. 진입점: 이 트랙은 특정 프로젝트에 종속되지 않는다는 원본 스펙대로, 앱 보관함(App Vault)
   홈 화면 AppBar에 🎯 아이콘으로 항상 노출 — 등록된 앱과 무관하게 언제든 열림.
6. 실제 빌드해서 스토리 모드 선택→계산 결과, 계산기 탭 입력→결과 모두 스크린샷으로
   직접 확인함(예: 노출 10,000 × 구글 검색광고 CTR 3~4% × Windows 전환율 20% =
   설치 60~80건, 원본 공식과 일치).
7. 원본 참고 파일(MarketingMath.cs, MarketingGameWindow.xaml.cs, MARKETING_LAUNCH_GUIDE.md)은
   `app_release_copilot/docs/reference/marketing_game_handoff/`에 읽기 전용으로 보관.

**미포함**: §5 콘텐츠 트랙(페르소나 템플릿/PMF 설문 템플릿/포지셔닝 문장 작성기/단계별
체크리스트 — GUIDE_SOP.md 6블록 가이드 트랙 형식)은 이번 범위에 넣지 않음. Mac 쪽에
아직 Windows의 "가이드 트랙" 같은 공통 가이드 시스템이 없어서, 이건 별도 요청으로
다시 받는 게 나을 것 같음.
