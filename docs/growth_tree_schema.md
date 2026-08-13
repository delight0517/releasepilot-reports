# growth_tree.json 스키마 — AI 보고서를 게임 스킬트리로

`releasepilot-reports`(정적 파일+git만 원칙)에 딸린 "성장 트리(growth_tree)"
리포트 종류가 읽는 JSON 형식이다. `growth/<slug>/growth_tree.json` 하나가
`growth/<slug>/index.html`(스킬트리 화면)과 `growth_tree_viewer` iOS 앱
둘 다에서 그대로 읽힌다 — 파일 하나로 웹/앱 양쪽을 같이 갱신한다.

실제 사례: [`growth/geunhoo/growth_tree.json`](../../growth/geunhoo/growth_tree.json)
(김근후 인스타그램 성장 트리, 11칸/4단계).

## 최상위 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `schemaVersion` | number | 지금은 `1`. 스키마가 바뀌면 올린다. |
| `person` | string | 대상자 이름(표시용). |
| `slug` | string | URL/파일 경로에 쓰는 식별자(`growth/<slug>/`). 영문 소문자+하이픈. |
| `topic` | string | 이 트리가 다루는 주제 한 줄. |
| `sourceReport` | object | `{title, date, file}` — 원본 AI 보고서 메타데이터. `file`은 같은 폴더에 함께 두는 원문 마크다운 파일명(예: `source_report.md`). |
| `generatedAt` | string | 트리를 만든 날짜(YYYY-MM-DD). |
| `guide` | string | 이 트리를 설명해주는 페르소나 이름(기본 "예나"). |
| `note` | string | 화면에 표시되는 정직성 고지 — 숫자를 지어내지 않았다는 점을 명시. |
| `nodes` | array | 아래 노드 객체 배열. |

## 노드 객체 (`nodes[]`)

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 고유 식별자(영문 snake_case) — `mark_growth_node.sh`가 이 값으로 노드를 찾는다. |
| `tier` | number | 몇 단계인지(1부터). 트리 화면은 tier별로 묶어서 세로로 배치한다. |
| `weight` | number | 이 노드의 비중(점수) — 전체 노드 weight 합은 항상 100이 되게 맞춘다. 화면 상단 진행도 %는 `완료된 노드의 weight 합`이다. **이게 화면에 나오는 유일한 숫자형 %** — 성공 확률 같은 걸 지어내는 필드는 없다. |
| `title` | string | 카드에 보이는 짧은 제목. |
| `category` | string | 배지로 표시되는 분류(예: "포지셔닝", "콘텐츠", "실험", "측정"). |
| `requires` | string[] | 선행 조건 노드 `id` 목록. 전부 `status: "done"`이어야 잠금 해제(AND 조건, OR 아님). 빈 배열이면 처음부터 열려 있음. |
| `status` | `"todo" \| "done"` | 완료 여부. `mark_growth_node.sh`로만 바꾼다(웹 화면의 "완료로 표시" 버튼은 새로고침하면 원복되는 미리보기 전용). |
| `sourceSection` | string | 원본 보고서의 어느 절을 근거로 하는지(예: `"§4, §11 우선순위 1"`). **필수** — 이 필드가 없으면 안 된다(지어낸 근거 없는 노드 방지). |
| `why` | string | 보고서 근거용 formal 설명(원본 문장에 가까움) — 상세 화면엔 기본으로 안 보이고 "원문 근거 문장 보기" 토글 뒤에 있다. |
| `whySimple` | string | 예나가 쉬운 비유로 풀어쓴 "왜 필요한가" — 상세 화면에서 기본으로 보이는 주 설명. `<b>` 태그로 강조 가능(웹/iOS 둘 다 렌더링). 지어내지 않고 `why`의 재서술만. **2026-08-13 추가.** |
| `journeyContext` | string | 이 노드가 트리 전체에서 어떤 역할/위치인지 한 문장(예: "1단계 세 칸 중 하나로…"). 구조적 사실만, 원본 보고서 범위를 벗어난 예측 금지. **2026-08-13 추가.** |
| `glossary` | object | `{"용어": "쉬운 뜻"}` 형태. 노드 안에 전문용어가 나오면 채우고, 없으면 `{}`. **2026-08-13 추가.** |
| `action` | string | 구체적으로 뭘 하면 되는지. |
| `successEffect` | string | 이 노드를 완료했을 때 실제로 좋아지는 것 — **반드시 원본 보고서가 실제로 주장한 근거**에 연결(숫자·확률 지어내지 않음). |
| `failureCost` | string | 안 했을 때 유지되는/악화되는 상황 — 마찬가지로 원본 근거 기반. |
| `resources` | array | (선택) `{"label": "표시 이름", "url": "실제 URL"}` 목록 — 이 노드를 실행할 때 참고할 외부 자료. **반드시 실제로 존재하고 접근 가능한 URL만** 넣는다(WebSearch 등으로 확인 없이 지어낸 URL 절대 금지). 없으면 필드 자체를 생략하거나 빈 배열. **2026-08-13 추가**(첫 사례: `discovery_reels_batch`의 릴스 트렌드 출처). |
| `personalIdeas` | array of string | (선택) 이 대상자(person) 개인 맥락에 맞춘 구체적 아이디어 — 일반론이 아니라 "이 사람이라면 이렇게" 수준으로 퍼스널라이즈. 없으면 생략. **2026-08-13 추가.** |

## 새 트리 만드는 법 (재사용 시스템)

1. 아무 AI 보고서(마케팅 진단, 학습 계획, 전략 리포트 등 실행 항목이 있는 것)를 준비.
2. 허브 홈의 "성장 트리" 리포트 카드 → "나도 만들어보기" 프롬프트를 복사해서
   Claude(또는 다른 AI)에 보고서와 함께 붙여넣는다.
3. 결과로 나온 `growth_tree.json`을 `growth/<slug>/growth_tree.json`에,
   원문을 `growth/<slug>/source_report.md`에 저장.
4. `growth/geunhoo/index.html`을 복사해서 `growth/<slug>/index.html`을 만들고
   fetch 경로만 새 슬러그로 바꾼다(현재는 이 정도만 하면 됨 — 아직 슬러그를
   자동으로 감지하는 공용 템플릿화는 안 돼 있음, 다음 개선 과제).
5. 커밋 + push.

## 진행 상황 기록 (완료 표시)

```bash
scripts/mark_growth_node.sh <slug> <node_id> done
scripts/mark_growth_node.sh <slug> <node_id> todo   # 되돌리기
```

커밋/push는 스크립트가 하지 않는다(`add_photo.sh`와 동일한 원칙) — 직접
`git add && git commit && git push`하거나, Claude Code 세션에 "growth/<slug>에서
<node_id> 완료 표시해줘"라고 말하면 된다.
