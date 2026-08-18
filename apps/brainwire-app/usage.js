/* 사용량 기반 자가재편 UI — 재사용 모듈
   설계 근거: 23_app_Releaser/files/Adaptive_UI_Usage_Blueprint.md
   다른 웹 앱에 이식할 때는 이 파일을 그대로 복사하고 REGISTRY만 갈면 된다.

   핵심 규칙 두 가지:
   1) 순서 계산은 앱 진입 시 1회만 (frozenOrder). 쓰는 도중에 버튼이 움직이면
      최악의 UX가 된다.
   2) 성역 없음 — 탭이든 홈이든 안 쓰면 접힌다. 단 '접힘 서랍 펼치기'와
      '사용량 패널' 자체는 접히지 않는다(탈출구). */

const USAGE_HALF_LIFE_DAYS = 14;
const USAGE_GRACE_DAYS = 7;      // 새로 등록된 기능은 이 기간 동안 최소 노출 보장
const USAGE_FOLD_THRESHOLD = 0.5; // 이 점수 미만이면 접힘 서랍으로

// 이 앱이 추적하는 모든 요소. 의미 기반 키 — 위치가 바뀌어도 통계가 유지된다.
const USAGE_REGISTRY = [
  { key:'tab.path',       label:'학습 경로 탭',     kind:'tab' },
  { key:'tab.admin',      label:'콘텐츠 관리 탭',   kind:'tab' },
  { key:'tab.usage',      label:'사용량 패널',      kind:'tab', pinned:true },
  { key:'sec.ingest',     label:'붙여넣기 투입함',  kind:'section' },
  { key:'sec.due',        label:'오늘 복습할 것',   kind:'section' },
  { key:'sec.path',       label:'학습 로드맵',      kind:'section' },
  { key:'sec.inbox',      label:'미분류 재고',      kind:'section' },
  { key:'sec.edit',       label:'커스텀 편집',      kind:'section' },
  { key:'act.quiz',       label:'퀴즈 열기',        kind:'action' },
  { key:'act.submit',     label:'답변 제출',        kind:'action' },
  { key:'act.skip',       label:'질문 스킵',        kind:'action' },
  { key:'act.discard-question', label:'질문 폐기',  kind:'action' },
  { key:'act.editName',   label:'이름 직접 수정',   kind:'action' },
  { key:'act.editColor',  label:'색상 직접 수정',   kind:'action' },
  { key:'act.delete',     label:'삭제',             kind:'action' },
  { key:'act.reset',      label:'진행도 초기화',    kind:'action' },
];

function usageStore(){
  if(!state.usage) state.usage = {};
  return state.usage;
}

function usageEntry(key){
  const store = usageStore();
  if(!store[key]){
    store[key] = { count:0, firstAt:new Date().toISOString(), lastAt:null };
  }
  return store[key];
}

// 사용 기록. 렌더 순서는 이 호출로 즉시 바뀌지 않는다(진입 시 1회 계산 규칙).
function track(key){
  const e = usageEntry(key);
  e.count += 1;
  e.lastAt = new Date().toISOString();
  saveState();
}

function daysBetween(iso, now){
  if(!iso) return Infinity;
  return (now - new Date(iso).getTime()) / 86400000;
}

// 최근성 가중 빈도. 빈도만 쓰면 예전에 많이 썼던 기능이 영원히 상단에 남는다.
function usageScore(key){
  const e = usageStore()[key];
  const now = Date.now();
  if(!e || e.count === 0){
    // 신규 유예: 등록 직후엔 "안 보여서 안 쓰이는" 함정을 막기 위해 노출시킨다.
    const age = e ? daysBetween(e.firstAt, now) : 0;
    return age < USAGE_GRACE_DAYS ? USAGE_FOLD_THRESHOLD + 0.01 : 0;
  }
  const decay = Math.pow(0.5, daysBetween(e.lastAt, now) / USAGE_HALF_LIFE_DAYS);
  const score = e.count * decay;
  if(daysBetween(e.firstAt, now) < USAGE_GRACE_DAYS){
    return Math.max(score, USAGE_FOLD_THRESHOLD + 0.01);
  }
  return score;
}

// 앱 진입 시 1회 확정. 이후 렌더에서는 이 순서를 그대로 쓴다.
let frozenOrder = null;
function freezeUsageOrder(){
  frozenOrder = {};
  USAGE_REGISTRY.forEach(item=>{
    frozenOrder[item.key] = { score: usageScore(item.key), folded: false };
  });
  USAGE_REGISTRY.forEach(item=>{
    if(item.pinned) return; // 탈출구는 접지 않는다
    frozenOrder[item.key].folded = frozenOrder[item.key].score < USAGE_FOLD_THRESHOLD;
  });
}

function isFolded(key){
  if(!frozenOrder) return false;
  return !!(frozenOrder[key] && frozenOrder[key].folded);
}

// 섹션 키 배열을 점수 내림차순으로. 접힌 것은 제외하고 반환한다.
function rankSections(keys){
  if(!frozenOrder) return keys.map(k=>({key:k, folded:false}));
  return keys
    .map(k=>({ key:k, score:(frozenOrder[k]||{}).score||0, folded:isFolded(k) }))
    .sort((a,b)=> b.score - a.score);
}

/* ==================== 사용량 패널 (개발자용) ==================== */
function renderUsagePanel(){
  const now = Date.now();
  const rows = USAGE_REGISTRY.map(item=>{
    const e = usageStore()[item.key] || { count:0, lastAt:null, firstAt:null };
    return {
      ...item,
      count: e.count,
      lastAt: e.lastAt,
      ageDays: daysBetween(e.firstAt, now),
      sinceDays: daysBetween(e.lastAt, now),
      score: usageScore(item.key),
    };
  }).sort((a,b)=> b.score - a.score);

  const max = Math.max(1, ...rows.map(r=>r.score));
  const dead = rows.filter(r=> r.count===0 && r.ageDays >= USAGE_GRACE_DAYS);
  const cold = rows.filter(r=> r.count>0 && r.sinceDays >= 14);

  let html = `<div class="admin-wrap">
    <div class="section-title">기능별 사용 점수</div>
    <div class="muted" style="margin-bottom:14px;">
      최근성 가중 빈도 (반감기 ${USAGE_HALF_LIFE_DAYS}일). 점수 ${USAGE_FOLD_THRESHOLD} 미만은
      자동으로 접혀서 최하단으로 내려갑니다 — 다음 실행부터 반영돼요.
    </div>
    <div class="card">`;

  rows.forEach(r=>{
    const pct = Math.round((r.score / max) * 100);
    const barColor = r.score < USAGE_FOLD_THRESHOLD ? 'var(--color-locked)'
      : r.score >= max*0.6 ? 'var(--color-primary)' : 'var(--color-blue)';
    html += `<div class="usage-row">
      <div class="usage-label">${escapeHtml(r.label)}
        <span class="muted">· ${escapeHtml(r.kind)}${r.pinned?' · 고정':''}</span></div>
      <div class="usage-bar-wrap"><div class="usage-bar" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="usage-num">${r.count}회 · ${r.score.toFixed(1)}</div>
    </div>`;
  });
  html += `</div>`;

  html += `<div class="section-title">삭제 후보 — 한 번도 안 쓰인 기능 (${dead.length})</div><div class="card">`;
  html += dead.length
    ? dead.map(r=>`<div class="list-row"><div><strong>${escapeHtml(r.label)}</strong>
        <div class="muted">등록 후 ${Math.floor(r.ageDays)}일 동안 사용 0회 — 유지비만 쓰는 중</div></div></div>`).join('')
    : `<div class="empty-hint">없어요. 모든 기능이 최소 한 번은 쓰였습니다.</div>`;
  html += `</div>`;

  html += `<div class="section-title">개선/재노출 후보 — 식은 기능 (${cold.length})</div><div class="card">`;
  html += cold.length
    ? cold.map(r=>`<div class="list-row"><div><strong>${escapeHtml(r.label)}</strong>
        <div class="muted">${r.count}회 썼지만 최근 ${Math.floor(r.sinceDays)}일간 사용 0 — 기능이 나쁜 게 아니라 발견이 안 되는 걸 수도</div></div></div>`).join('')
    : `<div class="empty-hint">없어요.</div>`;
  html += `</div>`;

  html += `<div class="footer-tools">
    <button class="btn btn-outline" data-action="reset-usage">사용량 통계 초기화</button>
    <div class="muted" style="margin-top:8px;">UI를 크게 바꾼 뒤에는 이전 통계가 오염이라 리셋하세요.</div>
  </div></div>`;
  return html;
}

function resetUsage(){
  if(!confirm('사용량 통계를 전부 초기화할까요? (학습 기록은 그대로입니다)')) return;
  state.usage = {};
  freezeUsageOrder();
  saveState(); render();
}
