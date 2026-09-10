# Everytime Reminder 웹사이트 작업 기록

2026-09-10 · Higgsfield 사용 없음 · 결제 0원 · 앱 빌드 없음

- 모바일 우선 소개 페이지로 개편: 시간표 연결, 자연어 리마인더, 밤/아침 브리핑, 위젯, 사전 알림.
- iOS·Android·Web 다운로드 영역 추가.
- Google Play 비공개 테스트 참여 안내 추가: 12명 이상, 14일 유지, 현재 0명.
- 참여 링크: https://play.google.com/apps/testing/com.rogan.everytime_reminder
- 페이지는 기존 실제 자산 `og-thumbnail.jpg`, `icon-180.png`를 사용.
- 로컬 HTTP 200, 주요 다운로드·테스터 링크 및 HTML 스크립트 검증 완료.
- iOS 버튼을 실제 다운로드 안내 페이지(`../../downloads/`)로 연결하고, 임시 Apple 홈 링크를 제거함.
- Android는 정식 출시 전까지 “비공개 테스트 참여자만 이용 가능” 안내를 다운로드 영역에 명시함.
- Android 버튼 문구를 “테스트 참여 후 설치”로 표시해 Play 항목 없음 혼동을 방지함.
- iOS는 현재 공개 App Store/TestFlight URL이 없어 안내 페이지로 연결; 실제 배포 URL 발급 후 단일 치환 필요.
- 다운로드 버튼 href 정적 검수 항목을 추가: iOS·Android·Web 링크는 빈 href/도메인 홈 링크 금지.
- GitHub push는 사용자 요청 전 대기. 저장소에 다른 변경이 있어 해당 파일 외 변경은 포함하지 않음.

- Google 그룹스 생성 완료: `class-reminder-testers@googlegroups.com`, 가입 링크 `https://groups.google.com/g/class-reminder-testers`.
- 그룹 가입 권한을 “웹상의 모든 사용자가 가입 가능”으로 변경해 승인 없이 자동 권한 부여되도록 설정함.
- Android 안내를 2단계 구조로 수정: 1단계 Google 그룹 가입, 2단계 Play 테스트 참여.
- Android 다운로드 영역 버튼을 그룹 가입 링크와 Play 참여 링크 두 개로 분리함.

- Android 모집 UX 피드백 반영: 홈페이지에는 단일 `Android 테스트 시작하기` CTA만 노출하고, 클릭 후 안내창에서 Google 그룹 가입과 Play 참여를 이어가도록 정리함.
