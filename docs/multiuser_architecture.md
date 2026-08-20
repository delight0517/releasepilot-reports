# 멀티유저 성장 트리 + 상담 시스템 — 아키텍처 설계 (2026-08-19)

사용자 결정(2026-08-19): 처음부터 멀티유저로 설계, 호스팅은 **무료/저렴 티어부터 시작**
(Render/Vercel/Supabase 계열). 여러 사람이 각자 로그인해서 자기 성장 트리를 만들고,
예나/로이 상담을 받고, 김근후 데이터도 이 시스템으로 이전하고, 히스토리를 남긴다.

**지금의 "정적 사이트 + 개인 GitHub PAT" 프로토타입(`growth/_shared/cloudStore.js`)은
이 용도로는 못 쓴다** — PAT는 저장소 전체 쓰기 권한이라 여러 사용자가 공유하면 서로의
데이터를 지울 수 있다. 진짜 계정별 격리가 필요하면 인증+DB가 있는 백엔드가 필수.

## 선택한 스택: Supabase

이유:
- **인증을 직접 구현할 필요가 없다** — 이메일/비밀번호, 매직링크, OAuth(구글 등)를
  기본 제공. "누가 로그인했는가"를 직접 짜는 게 이 프로젝트에서 가장 위험한 부분(보안
  실수 나기 쉬움)인데, 여기서 안전하게 검증된 걸 그대로 씀.
  - Client secret은 브라우저에 노출되면 안 되는데, Supabase의 Row Level Security(RLS)는
  DB 자체가 "이 로그인 사용자는 자기 행만 읽고 쓸 수 있다"를 강제해서, 프론트가 실수로
  다른 사람 데이터를 건드려도 DB가 막아준다.
- Postgres라 나중에 이 트리 안에서 관계형 쿼리(예: "이 사람의 모든 상담 기록")가 쉬움.
- 무료 티어 존재(프로젝트 1개, 500MB DB, 인증 50,000 MAU 등 — **정확한 한도는 가입 시점에
  Supabase 사이트에서 직접 확인할 것, 여기 숫자를 확정 사실로 믿지 말 것**, 요금 정책은
  자주 바뀐다).
- 정적 프론트(GitHub Pages 그대로 유지 가능) + Supabase가 백엔드 역할 — 별도 서버(Render
  Express 앱 같은 것)를 새로 안 띄워도 된다. brainwire처럼 Render에 서버를 올릴 필요가
  없다는 뜻 — 더 단순.

**AI(예나/로이 상담) 처리는 여전히 브레인와이어와 같은 원칙**: 라이브 API 키를 프론트/
Supabase 어디에도 넣지 않는다. 상담 턴은 브레인와이어의 `jobs`처럼 큐에 쌓이고, 이미
비용을 지불한 로컬/클라우드 Claude 세션(지금의 `yena-career-checkin` 루틴처럼)이 배치로
처리한다 — 사용자가 실시간 API 요금을 새로 지불하는 구조를 만들지 않는다.

## 데이터 모델 (초안)

```sql
-- 사용자는 Supabase Auth가 관리(auth.users) — 별도 테이블 불필요, auth.uid()로 참조.

create table trees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  slug text not null,               -- URL용, 소유자 안에서만 유일하면 됨
  person_name text not null,
  topic text not null,
  guide_persona text default '예나',
  created_at timestamptz default now(),
  unique (owner_id, slug)
);

create table tree_nodes (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid references trees(id) on delete cascade not null,
  node_key text not null,           -- growth_tree.json의 id와 대응
  tier int not null,
  weight int not null,
  title text not null,
  requires text[] default '{}',
  status text default 'todo' check (status in ('todo','done')),
  -- why/whySimple/action/successEffect/failureCost/... 등 growth_tree_schema.md 필드 그대로
  payload jsonb not null,           -- 스키마의 나머지 필드는 유연하게 jsonb로(스키마 변경에 강함)
  unlocked_first_seen_at date,
  last_nudge_at date,
  created_at timestamptz default now(),
  unique (tree_id, node_key)
);

create table counseling_sessions (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid references trees(id) on delete cascade not null,
  trigger text not null,            -- 'user_initiated' | 'scheduled_stall_checkin'
  status text default 'in_progress',-- 'in_progress' | 'synthesis_confirmed' | 'archived'
  created_at timestamptz default now()
);

create table counseling_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references counseling_sessions(id) on delete cascade not null,
  round int not null,
  role text not null check (role in ('assistant','user')),
  persona text,                     -- '예나' | '로이' | null(사용자 턴)
  text text not null,
  extracted jsonb,                  -- adaptive_discovery_interview_method.md의 extracted[] 구조
  created_at timestamptz default now()
);

-- RLS: 각 테이블에 "owner_id = auth.uid()" (trees) 또는 tree_id를 통한 소유권 체크를
-- 반드시 건다 — 이게 없으면 Supabase 접속 키가 있는 누구나 모든 사람 데이터를 볼 수 있음.
-- 실제 SQL은 구현 시점에 Supabase 콘솔에서 RLS 정책으로 작성.
```

- `payload jsonb`로 `growth_tree_schema.md`의 나머지 필드(`why`, `whySimple`, `resources`,
  `personalIdeas` 등)를 유연하게 담는다 — 스키마가 바뀌어도 마이그레이션 없이 대응 가능.
- `counseling_turns.extracted`가 `adaptive_discovery_interview_method.md`에 이미 정의된
  JSON 구조(`{tag, value, confidence, corrects}`)를 그대로 담는다 — 문서와 실제 DB가
  같은 모델을 쓰게.

## 김근후 데이터 이전

`growth/geunhoo/growth_tree.json`을 위 `trees`/`tree_nodes` 테이블로 옮기는 1회성
마이그레이션 스크립트(Node/Python, Supabase 클라이언트로 insert)를 만든다 — **김근후 본인
계정이 먼저 있어야** owner_id를 채울 수 있으므로, 계정 시스템이 실제로 동작한 뒤에
진행하는 순서. 지금은 순서만 못박아둔다: 계정 시스템 완성 → 김근후 로그인 → 마이그레이션
스크립트 실행.

## 다음 세션이 할 일 (순서대로, 이번 세션에선 설계까지만)

1. **사용자가 직접**: supabase.com에서 무료 프로젝트 생성 (이건 제가 대신 못 함 — 계정
   가입/약관 동의가 필요한 행동).
2. 프로젝트 생성 후 나오는 `Project URL`/`anon public key`를 다음 세션에 전달(또는
   `.env`류 파일에 직접 입력 — **service_role key는 절대 프론트에 노출하지 말 것**, anon
   key만 클라이언트에 씀).
3. 위 SQL로 스키마 생성 + RLS 정책 작성.
4. 로그인 UI(이메일/매직링크로 시작 — OAuth는 나중) + "내 트리 만들기" 플로우 스캐폴딩.
5. 예나/로이 상담 채팅 UI를 이 DB 기반으로 다시 연결(`growth/_shared/cloudStore.js`의
   GitHub 버전은 1인 프로토타입 참고용으로 남겨두되, 실제 멀티유저는 Supabase 클라이언트로
   교체).
6. 김근후 데이터 마이그레이션 스크립트 실행.

## 원칙 재확인
- 라이브 AI API 키는 어디에도 안 넣는다(브레인와이어와 동일 원칙) — 상담 생성은 배치.
- 결제/계정 생성은 사용자 본인만 할 수 있다 — Claude 세션은 코드/설정까지만 준비한다.
- RLS 없이는 절대 배포하지 않는다 — 이건 "나중에 추가"가 아니라 스키마 만드는 시점에
  같이 만든다.
