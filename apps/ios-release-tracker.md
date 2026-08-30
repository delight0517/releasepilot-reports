# iOS 앱스토어 출시 트래킹 — 2026-[REDACTED] (박새로이)

> 담당: 박새로이 · 목표: 4개 앱 전부 심사 제출까지
> 팀: V3J8MR637G (GeunHu Kim / rogan2534@gmail.com)

## ⚠️ 심사 상태 정의 (중요)
현재 "심사 중" 아님. upload(1단계)만 끝. 실제 심사 시작까지:
1. ✅ 빌드 업로드 (3개 완료, growth_tree_viewer는 블로커)
2. ⏳ 빌드 처리 대기 (애플 자동 검증)
3. ⬜ 메타데이터 입력 (스크린샷/설명/개인정보처리방침)
4. ⬜ 제출(submit) → 이때 비로소 "심사 중"

## 📊 상태판
| 앱 | Bundle ID | 업로드 | ASC레코드 | 스크린샷 | 메타데이터 | 제출 |
|----|-----------|------|----------|---------|-----------|------|
| PomodoroCage | com.rogan.pomodorocage | ✅ | ✅ | ✅ 3장 | 📝 초안작성 | ⏳ 웹제출 |
| RiseSync | com.rogan.risesync | ✅ | ✅ | ✅ 1장 | 📝 초안작성 | ⏳ 웹제출 |
| harugirok | com.rogan.harugirok | ✅ | ✅ | ✅ 1장 | 📝 초안작성 | ⏳ 웹제출 |


## 📝 메타데이터 초안 (박새로이 작성 — 로간님 승인 후 제출)

### 1. PomodoroCage (Auto Pomodoro)
- **부제목**: 집중을 부르는 뽀모도로 타이머
- **설명**:
```
Auto Pomodoro는 작업 집중도를 높여주는 심플한 뽀모도로 타이머입니다.
25분 집중 / 5분 휴식 사이클로 뇌에 리듬을 심어주고, 매일 완료한 사이클을 기록해
꾸준한 성취감을 줍니다. 잠금 모드 연동으로 집중 시간에 방해 알림을 자동 차단하고,
오늘의 뽀모도로 개수를 한눈에 보여줍니다. 공부·작업·독서 모두에 사용하세요.
```
- **키워드**: 뽀모도로,집중,타이머,생산성,공부,작업,휴식,습관,성취,포모도로
- **개인정보처리방침**: https://delight0517.github.io/releasepilot-reports/privacy-policy/index.html

### 2. RiseSync
- **부제목**: 기상 루틴을 지키는 자동 잠금
- **설명**:
```
RiseSync는 정해진 기상 시간에 기기를 자동으로 잠그고, 설정한 루틴 알람으로
하루를 여는 습관 형성 앱입니다. macOS/Windows와 연동되어 한쪽에서 설정한
잠금 스케줄이 다른 쪽에도 동기화됩니다. "조금만 더 자야지"를 끊어내고
계획대로 일어나고 싶은 분을 위해 설계했습니다.
```
- **키워드**: 기상,알람,루틴,습관,잠금,모닝,동기화,생산성, wakeup, routine
- **개인정보처리방침**: https://delight0517.github.io/releasepilot-reports/privacy-policy/index.html

### 3. harugirok (사계기록)
- **부제목**: 나의 계절을 기록하는 일기
- **설명**:
```
사계기록(harugirok)은 매일의 날씨와 마음, 작은 순간을 계절별로 기록하는
가벼운 일기 앱입니다. 작성한 기록은 버전·타임스탬프와 함께 보관되어
나중에 "그때 그날"을 정확히 돌아볼 수 있습니다. 캘린더 뷰로 한 해의 흐름을
한눈에 확인하고, 되돌아보며 위로받으세요.
```
- **키워드**: 일기,기록,계절,날씨,추억,캘린더,감정,일상,다이어리,기록장
- **개인정보처리방침**: https://delight0517.github.io/releasepilot-reports/privacy-policy/index.html

## 🔜 진행 체크리스트 (박새로이)
- [x] OpenClaw 키 세팅 + 기동
- [x] Xcode 로그인 → 배포 인증서 발급
- [x] PomodoroCage export+upload ✅ (bb41d4cc)
- [x] RiseSync export+upload ✅ (6a53c8a6)
- [x] harugirok flutter build+upload ✅ (15d96db1)
- [x] PomodoroCage 스크린샷 3장 확보
- [x] RiseSync/harugirok 스크린샷 시뮬레이터 찰영
- [ ] 3개 메타데이터 웹 입력 (OpenClaw 클릭 위임)
- [ ] 3개 제출(submit)

## 🛠 자동화 자산
- /Users/rogan/.hermes/scripts/ios_release_wrapper.sh (범용)
- /Users/rogan/.hermes/scripts/openclaw_setup_agent.sh
- OpenClaw main 기동됨 (gpt-5.5)
- .p8 키: AuthKey_6D2427DA45.p8 (Issuer ID는 ASC웹에만 — 확보 못 함)

---
*박새로이 최종 갱신 2026-[REDACTED]*
