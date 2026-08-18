/* 브레인와이어 프론트엔드
   설계 근거는 ../PLAN.md 참고. 핵심 전제 두 가지:
   1) AI는 배치로 돈다 — 즉답을 기다리지 않는다. 요청은 큐에 넣고, 결과는 다음에 앱을
      열었을 때 자동으로 반영된다(reconcilePendingJobs).
   2) 사용자가 손대는 지점은 붙여넣기와 답 쓰기 둘뿐 — 나머지(코스/유닛/색상/제목)는
      AI가 정하고, 사용자는 원할 때만 커스텀 편집으로 고친다. */

const PALETTE = [
  {name:'그린', color:'#58CC02', colorDark:'#4CAF00'},
  {name:'블루', color:'#1CB0F6', colorDark:'#1899D6'},
  {name:'오렌지', color:'#FF9600', colorDark:'#E08600'},
  {name:'퍼플', color:'#CE82FF', colorDark:'#B368E0'},
  {name:'레드', color:'#FF4B4B', colorDark:'#E63E3E'},
  {name:'골드', color:'#FFC800', colorDark:'#E5B400'},
];

const STAGES = [
  {key:'recall',  label:'인출', desc:'개념을 자기 말로 재구성'},
  {key:'connect', label:'연결', desc:'다른 레슨의 개념과 엮기'},
  {key:'apply',   label:'적용', desc:'새로운 상황에 넣어 판단'},
  {key:'create',  label:'창조', desc:'직접 만들어보기'},
];

const OFFSET_PATTERN = [0, 34, 58, 34, 0, -34, -58, -34];

function defaultState(){
  return {
    courses: [],
    inbox: [],
    pendingJobs: [],
    progress:{ streak:0, lastStudyDate:null, xp:0, gems:0 },
    selectedCourseId:null,
    activeTab:'path',
  };
}

let state = null;
let ui = { ingestBusy:false, notice:null };

// GitHub Pages 같은 정적 호스팅(로컬 서버 없음)에서는 index.html이
// window.BRAINWIRE_CLOUD_MODE=true를 미리 설정해둔다. 그러면 /api/* 대신
// cloudStore.js(GitHub Contents API 직접 호출)로 저장소를 읽고 쓴다.
const CLOUD_MODE = !!window.BRAINWIRE_CLOUD_MODE;

function ensureCloudToken(){
  if(!CLOUD_MODE || window.BrainwireCloud.hasToken()) return true;
  const t = prompt(
    '브레인와이어(클라우드 모드)를 쓰려면 releasepilot-hub 저장소 전용 GitHub 토큰이 필요해요.\n' +
    '(Contents: Read and write 권한만 있는 fine-grained PAT — 이 브라우저에만 저장됩니다)'
  );
  if(!t) return false;
  window.BrainwireCloud.setToken(t);
  return true;
}

/* ==================== 저장 / 로드 ==================== */
async function loadState(){
  try{
    if(CLOUD_MODE){
      if(!ensureCloudToken()) throw new Error('토큰 없음');
      state = (await window.BrainwireCloud.loadState()) || defaultState();
    } else {
      const res = await fetch('/api/state');
      const data = await res.json();
      state = data.state || defaultState();
    }
  }catch(e){
    console.error('상태 로드 실패', e);
    state = defaultState();
  }
  // 예전 버전 state에 없던 필드 보정
  state.inbox = state.inbox || [];
  state.pendingJobs = state.pendingJobs || [];
  state.courses = state.courses || [];
  if(!state.courses.find(c=>c.id===state.selectedCourseId)){
    state.selectedCourseId = state.courses.length ? state.courses[0].id : null;
  }
  freezeUsageOrder();
  render();
  await reconcilePendingJobs();
  await healOrphanedLessons();
}

// 사용량을 따라 꾸물꾸물 — 붙여넣기로 레슨이 몇백 개 한꺼번에 생겨도 질문 잡을
// 그만큼 한 번에 쏘지 않는다. "지금 당장 풀 수 있는" 레슨 개수를 상한선만큼만
// 유지하고, 그중 하나가 마스터되어 풀 밖으로 빠지면 그때 딱 하나만 보충한다.
const READY_POOL_SIZE = 6;

async function topUpQuestionPool(){
  const all = allLessons();
  // "풀 안에 있다" = 이미 질문이 준비됐거나(미마스터), 지금 준비 중인(잡 대기 중) 레슨.
  // 대기 중인 잡을 안 세면, 응답이 오기 전에 이 함수가 다시 불릴 때마다(리로드 등)
  // 매번 상한만큼 또 요청해버려서 풀이 무한정 불어난다.
  const inPool = x => (x.lesson.questions.length > 0 && x.lesson.mastery !== 'mastered')
    || hasPendingJobFor('questions', x.lesson.id);
  const poolCount = all.filter(inPool).length;
  const need = READY_POOL_SIZE - poolCount;
  if(need <= 0) return false;

  const candidates = all.filter(x => x.lesson.questions.length === 0 && !hasPendingJobFor('questions', x.lesson.id));
  const picked = candidates.slice(0, need);
  if(picked.length === 0) return false;

  await Promise.all(picked.map(x => requestQuestions(x.course, x.lesson)));
  return true;
}

// 질문이 비어 있는데 대기 중인 잡도 없는 레슨은 영영 '준비 중'에 갇힌다.
// (등록 요청이 유실됐거나, 잡이 지워졌거나.) 열 때마다 스스로 복구 — 단, 풀 상한 안에서만.
async function healOrphanedLessons(){
  const changed = await topUpQuestionPool();
  if(!changed) return;
  await saveState();
  render();
}

async function saveState(){
  try{
    if(CLOUD_MODE){
      if(!ensureCloudToken()) return;
      await window.BrainwireCloud.saveState(state);
    } else {
      await fetch('/api/state', {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(state)
      });
    }
  }catch(e){ console.error('저장 실패', e); }
}

/* ==================== 잡큐 ==================== */
async function enqueueJob(type, payload, context){
  let id;
  if(CLOUD_MODE){
    if(!ensureCloudToken()) throw new Error('토큰 없음');
    const job = await window.BrainwireCloud.enqueueJob(type, payload);
    id = job.id;
  } else {
    const res = await fetch('/api/jobs', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ type, payload })
    });
    const data = await res.json();
    if(data.error) throw new Error(data.error);
    id = data.id;
  }
  state.pendingJobs.push({ id, type, context: context||{}, requestedAt:new Date().toISOString() });
  return id;
}

// 앱을 열 때마다 실행 — 박새로이가 처리해둔 잡 결과를 state에 반영한다.
// 이 함수 덕분에 사용자는 결과를 기다리며 창을 켜둘 필요가 없다.
async function reconcilePendingJobs(){
  if(state.pendingJobs.length===0) return;
  let changed = false;
  // 처리 완료된 id만 모아서 나중에 걷어낸다. 배열을 통째로 갈아끼우면, 결과를 반영하는
  // 도중에 새로 등록된 잡(classify가 이어서 거는 questions 잡)이 같이 날아가 버린다.
  const resolvedIds = [];
  const snapshot = state.pendingJobs.slice();

  for(const pending of snapshot){
    let job = null;
    try{
      if(CLOUD_MODE){
        job = await window.BrainwireCloud.getJob(pending.id);
      } else {
        const res = await fetch('/api/jobs/' + pending.id);
        job = await res.json();
      }
    }catch(e){ continue; }

    if(!job || job.error || job.status !== 'done') continue;

    try{
      if(pending.type==='classify')       await applyClassifyResult(job.result);
      else if(pending.type==='questions') applyQuestionsResult(pending.context, job.result);
      else if(pending.type==='grade'){    applyGradeResult(pending.context, job.result); await topUpQuestionPool(); }
      else if(pending.type==='chunk')     await applyChunkResult(pending.context, job.result);
      changed = true;
    }catch(e){
      console.error('잡 결과 반영 실패', pending.type, e);
    }
    resolvedIds.push(pending.id);
  }

  if(resolvedIds.length){
    state.pendingJobs = state.pendingJobs.filter(p=>!resolvedIds.includes(p.id));
  }
  if(changed){
    await saveState();
    render();
  }
}

/* ==================== 유틸 ==================== */
function escapeHtml(str){
  if(str===undefined || str===null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function uid(prefix){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
function getCourse(id){ return state.courses.find(c=>c.id===id); }
function getSelectedCourse(){ return getCourse(state.selectedCourseId); }
function today(){ return new Date().toISOString().slice(0,10); }
function daysFromNow(n){
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}
function allLessons(){
  const out = [];
  state.courses.forEach(c=>c.units.forEach(u=>u.lessons.forEach(l=>out.push({course:c, unit:u, lesson:l}))));
  return out;
}
function findLessonById(id){
  const hit = allLessons().find(x=>x.lesson.id===id);
  return hit ? hit.lesson : null;
}
function findLessonContext(id){ return allLessons().find(x=>x.lesson.id===id) || null; }

// 대량 붙여넣기(200~300개) 시 oEmbed를 한 번에 다 쏘지 않고 일정 개수씩 나눠 돈다 —
// 무한 동시 fetch로 브라우저/유튜브를 압박하지 않으면서도 순차보다는 훨씬 빠르게.
async function mapWithConcurrency(items, limit, fn){
  const results = new Array(items.length);
  let next = 0;
  async function worker(){
    while(next < items.length){
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return results;
}

// 이미 재고/레슨 어디에든 있는 영상은 다시 안 넣는다 — 워치레이터 같은 큰 목록을
// 여러 번 붙여넣어도 매번 중복이 안 쌓이게.
function allKnownVideoIds(){
  const ids = new Set(state.inbox.map(i=>i.videoId).filter(Boolean));
  allLessons().forEach(x=>{
    if(x.lesson.youtubeUrl) extractVideoIds(x.lesson.youtubeUrl).forEach(id=>ids.add(id));
  });
  return ids;
}

function colorPair(hex){
  // AI가 준 색상 하나로 그림자용 어두운 색을 만든다.
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if(!m) return PALETTE[0];
  const n = parseInt(m[1], 16);
  const dark = [(n>>16)&255, (n>>8)&255, n&255].map(v=>Math.max(0, Math.round(v*0.82)));
  return { color:'#'+m[1], colorDark:'#'+dark.map(v=>v.toString(16).padStart(2,'0')).join('') };
}

/* ==================== 물류창고식 투입 (PLAN 4-5) ==================== */
const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?[^\s]*?v=|embed\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/g;

function extractVideoIds(raw){
  const ids = [];
  let m;
  YT_RE.lastIndex = 0;
  while((m = YT_RE.exec(raw)) !== null){
    if(!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

async function fetchTitle(videoId){
  try{
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v='+videoId)}&format=json`;
    const res = await fetch(url);
    if(!res.ok) return '';
    const data = await res.json();
    return data.title || '';
  }catch(e){ return ''; }
}

// 노션 페이지처럼 정보 밀도가 높은 긴 통글을 레슨 하나로 뭉개지 않기 위한 기준선
// (PLAN 4-6). 이보다 길면 분류 전에 먼저 청킹 잡을 돌린다.
const CHUNK_THRESHOLD = 1800;

// 뭘 붙여넣든 받는다: 링크 여러 개가 섞인 잡텍스트(플레이리스트/나중에 볼 동영상 페이지
// 통째로 복사)면 링크만 건져내고, 링크가 없으면 통글을 노트 한 덩어리로 받는다.
async function ingestRaw(raw){
  const text = (raw||'').trim();
  if(!text) return;

  ui.ingestBusy = true; render();

  const videoIds = extractVideoIds(text);

  if(videoIds.length === 0 && text.length > CHUNK_THRESHOLD){
    // 긴 통글(노션 페이지 등)은 바로 분류하지 않고 먼저 개념 단위로 쪼갠다 (PLAN 4-6).
    const firstLine = text.split('\n').find(l=>l.trim()) || '';
    const placeholder = {
      id: uid('i'), kind:'text', url:'', thumbnail:'',
      title: `(청킹 대기) ${firstLine.slice(0, 40) || '붙여넣은 글'}`,
      notes:'', status:'chunking',
    };
    state.inbox.push(placeholder);
    ui.ingestBusy = false;
    await enqueueJob('chunk', { text: text.slice(0, 12000) }, { inboxItemId: placeholder.id });
    ui.notice = '긴 글이라 먼저 개념 단위로 쪼개는 중이에요. 박새로이가 처리하면 자동으로 여러 레슨 후보로 나뉩니다.';
    await saveState();
    render();
    return;
  }

  const newItems = [];
  let dedupSkipped = 0;

  if(videoIds.length > 0){
    const known = allKnownVideoIds();
    const fresh = videoIds.filter(vid => !known.has(vid));
    dedupSkipped = videoIds.length - fresh.length;

    const titles = await mapWithConcurrency(fresh, 8, vid => fetchTitle(vid));
    fresh.forEach((vid, i) => {
      newItems.push({
        id: uid('i'), kind:'youtube', videoId: vid,
        url:`https://www.youtube.com/watch?v=${vid}`,
        thumbnail:`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        title: titles[i] || '(제목을 가져오지 못함)',
        notes:'', status:'pending',
      });
    });
  } else {
    const firstLine = text.split('\n').find(l=>l.trim()) || '';
    newItems.push({
      id: uid('i'), kind:'text', url:'', thumbnail:'',
      title: firstLine.slice(0, 60) || '붙여넣은 글',
      notes: text, status:'pending',
    });
  }

  ui.ingestBusy = false;

  if(newItems.length === 0){
    ui.notice = dedupSkipped > 0
      ? `${dedupSkipped}개 전부 이미 있는 영상이라 건너뛰었어요.`
      : '이미 재고에 있는 영상들이에요.';
    render();
    return;
  }

  state.inbox.push(...newItems);
  // 붙여넣은 원문을 그대로 같이 넘긴다 — 유튜브 페이지를 복사하면 제목이 이미 그 안에
  // 텍스트로 들어있어서, oEmbed 제목 조회가 실패해도 AI가 링크와 제목을 짝지을 수 있다.
  await requestClassification(newItems, text.slice(0, 6000));
  ui.notice = `${newItems.length}개를 재고에 넣었어요.` + (dedupSkipped>0 ? ` (중복 ${dedupSkipped}개는 건너뜀)` : '') + ' 박새로이가 처리하면 자동으로 분류됩니다.';
  await saveState();
  render();
}

// 청킹 잡 결과 반영 (PLAN 4-6). noise는 버리고, support는 직전 core에 배경지식으로
// 붙인다. 남은 core 조각들만 새 재고 항목이 되어 이어서 분류 잡을 탄다.
async function applyChunkResult(context, result){
  const placeholder = state.inbox.find(i=>i.id===context.inboxItemId);
  state.inbox = state.inbox.filter(i=>i.id!==(context && context.inboxItemId));
  if(!placeholder) return;

  const chunks = (result && result.chunks) || [];
  const newItems = [];
  let lastCore = null;

  chunks.forEach(c=>{
    if(!c || c.importance === 'noise') return;
    if(c.importance === 'support'){
      if(lastCore) lastCore.notes += `\n\n(배경) ${c.notes || ''}`;
      return;
    }
    const item = {
      id: uid('i'), kind:'text', url:'', thumbnail:'',
      title: (c.title || '').slice(0, 60) || '청크',
      notes: c.notes || '', status:'pending',
    };
    newItems.push(item);
    lastCore = item;
  });

  if(newItems.length === 0){
    ui.notice = '청킹 결과 남은 개념이 없었어요 — 원문을 다시 확인해주세요.';
    return;
  }

  state.inbox.push(...newItems);
  await requestClassification(newItems, '');
}

async function requestClassification(items, rawContext){
  const courseList = state.courses.map(c=>({
    name:c.name,
    units:c.units.map(u=>({ name:u.name, sub:u.sub }))
  }));
  const payload = {
    items: items.map(i=>({
      id:i.id, kind:i.kind, title:i.title,
      url:i.url,
      textPreview: i.notes ? i.notes.slice(0, 1200) : ''
    })),
    courseList,
    rawContext: rawContext || '',
  };
  try{
    await enqueueJob('classify', payload, {});
  }catch(e){
    ui.notice = '분류 요청 실패: ' + e.message;
  }
}

// 배치 결과를 실제 코스/유닛/레슨으로 꽂는다. 코스 이름·유닛 주제·색상까지 AI 결정.
async function applyClassifyResult(result){
  const assignments = (result && result.assignments) || [];
  assignments.forEach(a=>{
    const item = state.inbox.find(i=>i.id===a.itemId);
    if(!item || item.status==='filed') return;

    let course = state.courses.find(c=>c.name===a.courseName);
    if(!course){
      const pair = colorPair(a.courseColor) ;
      course = { id:uid('c'), name:a.courseName || '새 코스', color:pair.color, colorDark:pair.colorDark, units:[] };
      state.courses.push(course);
    }
    let unit = course.units.find(u=>u.name===a.unitName);
    if(!unit){
      const pair = colorPair(a.unitColor || a.courseColor);
      unit = { id:uid('u'), name:a.unitName || '유닛 1', sub:a.unitSub || '', color:pair.color, colorDark:pair.colorDark, lessons:[] };
      course.units.push(unit);
    } else if(a.unitSub){
      unit.sub = a.unitSub;
    }

    const lesson = {
      id: uid('l'),
      title: a.lessonTitle || item.title,
      youtubeUrl: item.url,
      notes: a.notes || item.notes || '',
      questions: [],
      stageIndex: 0,
      mastery: 'new',
      intervalDays: 0,
      dueDate: today(),
      lastScore: null,
      completed: false,
      awaitingGrade: false,
      aiFiled: true,
    };
    unit.lessons.push(lesson);
    item.status = 'filed';
    item.lessonId = lesson.id;

    if(!state.selectedCourseId) state.selectedCourseId = course.id;
  });

  // 새로 꽂힌 레슨들 중 풀 상한(READY_POOL_SIZE) 안에서만 질문을 이어서 요청 —
  // 붙여넣기 한 번에 레슨이 수백 개 생겨도 질문 잡은 한꺼번에 안 쏜다 (사용량을
  // 따라 꾸물꾸물). 등록이 끝날 때까지 기다려야 호출부의 saveState()가 반영한다.
  await topUpQuestionPool();
}

function hasPendingJobFor(type, lessonId){
  return state.pendingJobs.some(p=>p.type===type && p.context && p.context.lessonId===lessonId);
}

/* ==================== 질문 세트 (PLAN 4-2, 4-4) ==================== */
// 창조/연결 단계 질문이 그 레슨 하나에 갇히지 않도록, 같은 코스의 다른 레슨 제목을
// 함께 보낸다 — 이게 단순 암기와 갈리는 지점이다.
function requestQuestions(course, lesson){
  const siblings = [];
  course.units.forEach(u=>u.lessons.forEach(l=>{
    if(l.id !== lesson.id) siblings.push({ title:l.title, notes:(l.notes||'').slice(0,200) });
  }));
  const payload = {
    lessonTitle: lesson.title,
    notes: lesson.notes,
    courseName: course.name,
    siblingLessons: siblings.slice(0, 12),
    stages: STAGES.map(s=>({ key:s.key, label:s.label, desc:s.desc })),
  };
  return enqueueJob('questions', payload, { lessonId: lesson.id }).catch(e=>{
    console.error('질문 요청 실패', e);
  });
}

function applyQuestionsResult(context, result){
  const lesson = findLessonById(context.lessonId);
  if(!lesson) return;
  const qs = (result && result.questions) || [];
  lesson.questions = qs.filter(q=>q && q.text).map(q=>({
    stage: q.stage,
    text: q.text,
    format: q.format === 'ox' ? 'ox' : 'written',
    answer: typeof q.answer === 'boolean' ? q.answer : undefined,
    sourceExcerpt: q.sourceExcerpt || '',
  }));
}

/* ==================== 채점 & 간격 반복 (PLAN 4-1) ==================== */
function applyGradeResult(context, result){
  const lesson = findLessonById(context.lessonId);
  if(!lesson) return;
  const score = Math.max(0, Math.min(100, Math.round((result && result.score) || 0)));
  lesson.awaitingGrade = false;
  finalizeAnswer(lesson, score, (result && result.feedback) || '', (result && result.explanation) || '');
}

// AI 채점(느림, 배치)과 OX 즉답 채점(빠름, 클라이언트) 둘 다 여기로 모인다 —
// 점수를 받은 다음에 할 일(간격 반복 갱신, XP/스트릭)은 두 경로가 동일하다.
function finalizeAnswer(lesson, score, feedback, explanation){
  lesson.lastScore = score;
  lesson.lastFeedback = feedback;
  lesson.lastExplanation = explanation;
  lesson.completed = true;

  scheduleNext(lesson, score);

  const xpGain = Math.max(5, Math.round(score/10) + 5);
  state.progress.xp += xpGain;
  state.progress.gems += 5;
  updateStreak();
}

// 점수가 다음 등장 시점을 정한다 (SM-2 축약판). 점수가 아무것도 바꾸지 않던
// 프로토타입의 구멍을 메우는 부분.
function scheduleNext(lesson, score){
  const prev = lesson.intervalDays || 1;
  let next;
  if(score >= 90){ next = Math.max(4, Math.round(prev * 2.5)); lesson.stageIndex = Math.min(STAGES.length-1, (lesson.stageIndex||0) + 1); }
  else if(score >= 70){ next = Math.max(2, Math.round(prev * 1.7)); lesson.stageIndex = Math.min(STAGES.length-1, (lesson.stageIndex||0) + 1); }
  else if(score >= 50){ next = 2; }
  else { next = 1; lesson.stageIndex = Math.max(0, (lesson.stageIndex||0) - 1); }

  lesson.intervalDays = next;
  lesson.dueDate = daysFromNow(next);
  lesson.mastery = (lesson.stageIndex >= STAGES.length-1 && score >= 90) ? 'mastered'
                 : score >= 70 ? 'learning' : 'learning';
}

function updateStreak(){
  const t = today();
  const last = state.progress.lastStudyDate;
  if(last === t) return;
  const y = new Date(); y.setDate(y.getDate()-1);
  const yesterday = y.toISOString().slice(0,10);
  state.progress.streak = (last === yesterday) ? state.progress.streak + 1 : 1;
  state.progress.lastStudyDate = t;
}

function dueLessons(){
  return allLessons().filter(x=>{
    const l = x.lesson;
    if(l.awaitingGrade) return false;
    if(l.questions.length===0) return false;
    return !l.dueDate || l.dueDate <= today();
  });
}

/* ==================== 퀴즈 ==================== */
let quiz = null; // { lessonId, question, stage }

function openQuiz(lessonId){
  const ctx = findLessonContext(lessonId);
  if(!ctx) return;
  const lesson = ctx.lesson;

  if(lesson.awaitingGrade){
    quiz = { lessonId, phase:'awaiting' };
  } else if(lesson.questions.length === 0){
    if(!hasPendingJobFor('questions', lesson.id)) requestQuestions(ctx.course, lesson);
    saveState();
    quiz = { lessonId, phase:'not-ready' };
  } else {
    const idx = Math.min(lesson.stageIndex || 0, lesson.questions.length - 1);
    quiz = { lessonId, phase:'ask', question: lesson.questions[idx], stageIdx: idx };
  }
  showModal(); renderModal();
}

async function submitAnswer(answer){
  const ctx = findLessonContext(quiz.lessonId);
  if(!ctx || !answer) return;
  const lesson = ctx.lesson;

  track('act.submit');
  lesson.awaitingGrade = true;
  try{
    await enqueueJob('grade', {
      notes: lesson.notes,
      lessonTitle: lesson.title,
      stage: quiz.question.stage,
      question: quiz.question.text,
      answer,
    }, { lessonId: lesson.id });
    quiz.phase = 'submitted';
  }catch(e){
    lesson.awaitingGrade = false;
    quiz.phase = 'error';
    quiz.errorMsg = '제출 실패: ' + e.message;
  }
  await saveState();
  renderModal();
  render();
}

// OX 형식은 정오답이 명확해서 배치 채점을 기다릴 필요가 없다 — 즉석에서 채점하고
// 바로 다음 복습일을 보여준다 (Mac 세션 요청, PLAN 참고: "다음 복습: N일 후" 배지).
async function submitOxAnswer(userAnswer){
  const ctx = findLessonContext(quiz.lessonId);
  if(!ctx) return;
  const lesson = ctx.lesson;
  const correct = userAnswer === quiz.question.answer;

  track('act.submit');
  finalizeAnswer(
    lesson,
    correct ? 95 : 20,
    correct ? '정확히 맞혔어요!' : '아니에요 — 아래 근거 문장을 다시 확인해보세요.',
    quiz.question.sourceExcerpt ? `근거: "${quiz.question.sourceExcerpt}"` : ''
  );
  quiz.phase = 'ox-result';
  quiz.correct = correct;
  quiz.nextDueDate = lesson.dueDate;

  await topUpQuestionPool();
  await saveState();
  renderModal();
  render();
}

// 이번엔 답하지 않고 넘어가기 — 간격 반복 상태를 건드리지 않는다 (다음에 다시 나옴).
function skipQuestion(){
  track('act.skip');
  hideModal(); quiz = null; render();
}

// 질문 자체가 이상하면(AI가 잘못 만든 경우) 그 질문만 버린다 — 다음에 열 때
// healOrphanedLessons()가 새 질문 세트를 다시 요청해준다.
async function discardQuestion(){
  const ctx = findLessonContext(quiz.lessonId);
  if(!ctx) return;
  track('act.discard-question');
  ctx.lesson.questions = [];
  await saveState();
  hideModal(); quiz = null; render();
  await healOrphanedLessons();
}

function showModal(){ document.getElementById('quiz-modal').classList.remove('hidden'); }
function hideModal(){ document.getElementById('quiz-modal').classList.add('hidden'); }

function renderModal(){
  const ctx = quiz ? findLessonContext(quiz.lessonId) : null;
  const body = document.getElementById('quiz-modal-body');
  if(!ctx || !quiz){ body.innerHTML=''; return; }
  const lesson = ctx.lesson;

  let inner = `<button class="modal-close" data-action="close-modal">✕</button>`;
  inner += `<h2>${escapeHtml(lesson.title)}</h2>`;

  if(quiz.phase==='ask'){
    const stage = STAGES.find(s=>s.key===quiz.question.stage) || STAGES[quiz.stageIdx] || STAGES[0];
    inner += `<div class="modal-sub"><span class="stage-chip">${escapeHtml(stage.label)}</span> ${escapeHtml(stage.desc)}</div>
      <div class="question-box">${escapeHtml(quiz.question.text)}</div>`;
    if(quiz.question.format==='ox'){
      if(quiz.question.sourceExcerpt){
        inner += `<div class="muted" style="margin-bottom:10px;">근거: "${escapeHtml(quiz.question.sourceExcerpt)}"</div>`;
      }
      inner += `<div style="display:flex;gap:10px;margin-bottom:10px;">
          <button class="btn btn-primary" style="flex:1;" data-action="submit-ox" data-value="true">⭕ 맞다</button>
          <button class="btn btn-blue" style="flex:1;" data-action="submit-ox" data-value="false">❌ 아니다</button>
        </div>`;
    } else {
      inner += `<div class="field"><textarea id="answer-input" rows="7" placeholder="여기에 자신의 말로 답을 써보세요..."></textarea></div>
        <button class="btn btn-primary btn-block" data-action="submit-answer">제출하기</button>`;
    }
    inner += `<div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-outline" style="flex:1;" data-action="skip-question">스킵</button>
        <button class="btn-danger" data-action="discard-question">🚩 이상한 질문 폐기</button>
      </div>`;
    if(lesson.lastExplanation){
      inner += `<div class="feedback-box" style="margin-top:14px;"><strong>예나의 설명</strong><br>${escapeHtml(lesson.lastExplanation).replace(/\n/g,'<br>')}</div>`;
    }
    if(lesson.lastFeedback){
      inner += `<div class="muted" style="margin-top:14px;">지난 피드백: ${escapeHtml(lesson.lastFeedback)}</div>`;
    }
  } else if(quiz.phase==='ox-result'){
    inner += `<div class="modal-sub">${quiz.correct ? '⭕ 정답이에요!' : '❌ 아쉬워요'}</div>
      <div class="feedback-box">${escapeHtml(lesson.lastFeedback)}${lesson.lastExplanation ? '<br>'+escapeHtml(lesson.lastExplanation) : ''}</div>
      <div class="notice" style="margin:0 0 16px;">📅 다음 복습: ${escapeHtml(quiz.nextDueDate)}</div>
      <button class="btn btn-primary btn-block" data-action="close-modal">확인</button>`;
  } else if(quiz.phase==='submitted'){
    inner += `<div class="modal-sub">제출됐어요</div>
      <div class="feedback-box">예나가 채점 대기열에 넣었어요. 박새로이가 큐를 처리하면
      다음에 앱을 열 때 점수와 피드백이 자동으로 반영돼요. 창을 닫아도 괜찮아요.</div>
      <button class="btn btn-primary btn-block" data-action="close-modal">확인</button>`;
  } else if(quiz.phase==='awaiting'){
    inner += `<div class="modal-sub">채점 대기 중</div>
      <div class="feedback-box">이 레슨은 이미 답을 제출했고 채점을 기다리는 중이에요.</div>
      <button class="btn btn-primary btn-block" data-action="close-modal">확인</button>`;
  } else if(quiz.phase==='not-ready'){
    inner += `<div class="modal-sub">질문 준비 중</div>
      <div class="feedback-box">이 레슨의 질문 세트를 만들어 달라고 요청해뒀어요.
      박새로이가 처리하면 4단계(인출·연결·적용·창조) 질문이 채워집니다.</div>
      <button class="btn btn-primary btn-block" data-action="close-modal">확인</button>`;
  } else if(quiz.phase==='error'){
    inner += `<div class="error-text">${escapeHtml(quiz.errorMsg)}</div>
      <button class="btn btn-primary btn-block" data-action="close-modal">닫기</button>`;
  }
  body.innerHTML = inner;
}

/* ==================== 렌더 ==================== */
function render(){
  document.getElementById('stat-streak').textContent = state.progress.streak;
  document.getElementById('stat-gems').textContent = state.progress.gems;
  document.getElementById('stat-xp').textContent = state.progress.xp;

  // 탭도 성역이 아니다 — 안 쓰는 탭은 접힘 서랍으로 내려간다.
  const tabBar = document.getElementById('nav-tabs');
  const tabs = [
    { key:'tab.path',  id:'path',  label:'학습 경로' },
    { key:'tab.admin', id:'admin', label:'콘텐츠 관리' },
    { key:'tab.usage', id:'usage', label:'📊 사용량' },
  ];
  const ranked = rankSections(tabs.map(t=>t.key));
  let tabHtml = '';
  ranked.filter(r=>!r.folded).forEach(r=>{
    const t = tabs.find(x=>x.key===r.key);
    tabHtml += `<div class="nav-tab ${state.activeTab===t.id?'active':''}" data-action="switch-tab" data-tab="${t.id}">${t.label}</div>`;
  });
  const foldedTabs = ranked.filter(r=>r.folded);
  if(foldedTabs.length){
    tabHtml += `<div class="nav-tab folded-toggle" data-action="toggle-folded">⋯ ${foldedTabs.length}</div>`;
    if(ui.showFolded){
      foldedTabs.forEach(r=>{
        const t = tabs.find(x=>x.key===r.key);
        tabHtml += `<div class="nav-tab mini ${state.activeTab===t.id?'active':''}" data-action="switch-tab" data-tab="${t.id}">${t.label}</div>`;
      });
    }
  }
  tabBar.innerHTML = tabHtml;

  const main = document.getElementById('main-content');
  main.innerHTML = state.activeTab==='usage' ? renderUsagePanel()
                 : state.activeTab==='admin' ? renderAdminView()
                 : renderPathView();
}

// 섹션들을 점수순으로 재배치하고, 임계 미만은 최하단 서랍에 접어 넣는다.
// sections: [{key, label, html}]
function layoutSections(sections){
  const ranked = rankSections(sections.map(s=>s.key));
  let out = '';
  ranked.filter(r=>!r.folded).forEach(r=>{
    const s = sections.find(x=>x.key===r.key);
    if(s && s.html) out += s.html;
  });
  const folded = ranked.filter(r=>r.folded).map(r=>sections.find(x=>x.key===r.key)).filter(s=>s && s.html);
  if(folded.length){
    out += `<div class="folded-drawer">
      <button class="folded-head" data-action="toggle-folded">
        ${ui.showFolded ? '▾' : '▸'} 덜 쓰는 기능 ${folded.length}개
        <span class="muted">${escapeHtml(folded.map(s=>s.label).join(', '))}</span>
      </button>`;
    if(ui.showFolded) folded.forEach(s=>{ out += s.html; });
    out += `</div>`;
  }
  return out;
}

function renderNotice(){
  if(!ui.notice) return '';
  const html = `<div class="notice">${escapeHtml(ui.notice)}</div>`;
  return html;
}

function pendingSummary(){
  const n = state.pendingJobs.length;
  if(n===0) return '';
  return `<div class="notice pending">🕐 박새로이 처리 대기 중인 작업 ${n}건 — 처리되면 자동으로 반영돼요.</div>`;
}

/* ---------- 학습 경로 ---------- */
function renderPathView(){
  const head = renderNotice() + pendingSummary();

  if(state.courses.length===0){
    return head + renderIngestBox() + `<div class="empty-state"><div class="big">📦</div>
      아직 재고가 비어 있어요.<br>위에 영상 링크나 글을 그냥 붙여넣기만 하세요.</div>`;
  }

  const due = dueLessons();
  let dueHtml = '';
  if(due.length > 0){
    dueHtml = `<div class="due-section">
      <div class="due-title">오늘 복습할 것 ${due.length}개</div>
      <div class="due-list">`;
    due.slice(0, 8).forEach(x=>{
      const stage = STAGES[Math.min(x.lesson.stageIndex||0, STAGES.length-1)];
      dueHtml += `<button class="due-card" data-action="open-quiz" data-lesson-id="${x.lesson.id}"
          style="border-left:5px solid ${x.unit.color}">
          <span class="stage-chip">${escapeHtml(stage.label)}</span>
          <span class="due-card-title">${escapeHtml(x.lesson.title)}</span>
          <span class="muted">${escapeHtml(x.course.name)}</span>
        </button>`;
    });
    dueHtml += `</div></div>`;
  }

  return head + layoutSections([
    { key:'sec.due',    label:'오늘 복습할 것', html: dueHtml },
    { key:'sec.ingest', label:'붙여넣기 투입함', html: renderIngestBox() },
    { key:'sec.path',   label:'학습 로드맵',     html: renderRoadmap() },
  ]);
}

function renderRoadmap(){
  let html = '';
  const course = getSelectedCourse();
  const chips = state.courses.map(c=>`
    <div class="course-chip" data-action="select-course" data-course-id="${c.id}"
      style="${c.id===course.id?`border-color:${c.color};color:${c.color};background:${c.color}1A;`:''}">
      ${escapeHtml(c.name)}
    </div>`).join('');
  html += `<div class="course-chips">${chips}</div>`;

  if(!course || course.units.every(u=>u.lessons.length===0)){
    return html + `<div class="empty-state"><div class="big">✏️</div>이 코스에는 아직 레슨이 없어요.</div>`;
  }

  let idx = 0;
  let body = '';
  course.units.forEach(unit=>{
    body += `<div class="unit-banner" style="--unit-color:${unit.color}">
        <div class="unit-eyebrow">${escapeHtml(unit.name)}</div>
        <div class="unit-name">${escapeHtml(unit.sub || '')}</div>
      </div>`;
    unit.lessons.forEach(lesson=>{
      const st = lessonVisualState(lesson);
      const offset = OFFSET_PATTERN[idx % OFFSET_PATTERN.length];
      const nodeColor = st==='waiting' ? 'var(--color-locked)' : unit.color;
      const shadowColor = st==='waiting' ? 'var(--color-locked-dark)' : unit.colorDark;
      const icon = st==='mastered' ? '★' : st==='done' ? '✓' : st==='waiting' ? '🕐' : '▶';
      const stage = STAGES[Math.min(lesson.stageIndex||0, STAGES.length-1)];
      body += `<div class="node-row">
          <div class="connector ${idx===0?'hide':(st!=='waiting'?'done':'')}"></div>
          <div class="node-shift" style="transform:translateX(${offset}px)">
            ${st==='due' ? '<div class="node-label">복습</div>' : ''}
            <button class="node ${st}" style="--node-color:${nodeColor};--shadow-color:${shadowColor}"
              data-action="open-quiz" data-lesson-id="${lesson.id}">${icon}</button>
          </div>
          <div class="lesson-title-under">${escapeHtml(lesson.title)}
            <div class="muted" style="font-size:11px;">${escapeHtml(stage.label)}${lesson.lastScore!==null&&lesson.lastScore!==undefined?` · ${lesson.lastScore}점`:''}</div>
          </div>
        </div>`;
      idx++;
    });
  });
  return html + `<div class="path-wrap">${body}</div>`;
}

// PLAN 4-3: 엄격한 선형 잠금을 없앴다. 모든 레슨은 열 수 있고, 시각 상태는
// "지금 볼 것/이미 한 것/아직 준비 안 된 것"만 구분한다.
function lessonVisualState(lesson){
  if(lesson.awaitingGrade || lesson.questions.length===0) return 'waiting';
  if(lesson.mastery==='mastered') return 'mastered';
  if(!lesson.dueDate || lesson.dueDate <= today()) return 'due';
  return 'done';
}

/* ---------- 투입 박스 ---------- */
function renderIngestBox(){
  return `<div class="ingest-wrap">
    <form id="ingest-form" class="ingest-card">
      <div class="ingest-title">📦 아무거나 넣으세요</div>
      <div class="muted" style="margin-bottom:10px;">
        유튜브 링크 하나, 플레이리스트나 '나중에 볼 동영상' 페이지 전체 복붙, 그냥 글 —
        뭘 넣든 AI가 코스·유닛·색상까지 알아서 분류해요.
      </div>
      <textarea name="raw" rows="4" placeholder="여기에 그냥 붙여넣기 (Ctrl+V)"></textarea>
      <button class="btn btn-blue btn-block" type="submit" ${ui.ingestBusy?'disabled':''} style="margin-top:10px;">
        ${ui.ingestBusy ? '재고 확인 중...' : '재고에 넣기'}
      </button>
    </form>
  </div>`;
}

/* ---------- 콘텐츠 관리 / 커스텀 편집 ---------- */
function renderAdminView(){
  return `<div class="admin-wrap">` + renderNotice() + pendingSummary()
    + layoutSections([
        { key:'sec.inbox', label:'미분류 재고',  html: renderInboxSection() },
        { key:'sec.edit',  label:'커스텀 편집',  html: renderEditSection() },
      ])
    + `<div class="footer-tools">
        <button class="btn btn-outline" data-action="reset-progress">진행도 초기화 (테스트용)</button>
      </div></div>`;
}

function renderInboxSection(){
  let html = '';
  const unfiled = state.inbox.filter(i=>i.status!=='filed');
  html += `<div class="section-title">미분류 재고 (${unfiled.length})</div><div class="card">`;
  if(unfiled.length===0){
    html += `<div class="empty-hint">미분류 재고가 없어요. 전부 선반에 꽂혔습니다.</div>`;
  } else {
    unfiled.forEach(i=>{
      html += `<div class="list-row">
        <div style="flex:1;">
          <strong>${escapeHtml(i.title)}</strong>
          <div class="muted">${i.status==='chunking' ? '개념 단위로 쪼개는 중 (박새로이 처리 대기)' : (i.kind==='youtube' ? escapeHtml(i.url) : '붙여넣은 글')}</div>
        </div>
        <button class="btn-danger" data-action="delete-inbox" data-item-id="${i.id}">삭제</button>
      </div>`;
    });
  }
  html += `</div>`;
  return html;
}

function renderEditSection(){
  let html = `<div class="section-title">커스텀 편집 — AI가 정한 걸 직접 고치기</div>`;
  if(state.courses.length===0){
    html += `<div class="card"><div class="empty-hint">아직 코스가 없어요.</div></div>`;
  }

  state.courses.forEach(course=>{
    html += `<div class="card">
      <div class="edit-head">
        <input type="color" value="${course.color}" data-action="edit-course-color" data-course-id="${course.id}" title="코스 색상">
        <input type="text" value="${escapeHtml(course.name)}" data-action="edit-course-name" data-course-id="${course.id}" class="edit-name">
        <button class="btn-danger" data-action="delete-course" data-course-id="${course.id}">코스 삭제</button>
      </div>`;

    course.units.forEach(unit=>{
      html += `<div class="edit-unit">
        <div class="edit-head">
          <input type="color" value="${unit.color}" data-action="edit-unit-color" data-course-id="${course.id}" data-unit-id="${unit.id}" title="유닛 색상">
          <input type="text" value="${escapeHtml(unit.name)}" data-action="edit-unit-name" data-course-id="${course.id}" data-unit-id="${unit.id}" class="edit-name" style="max-width:110px;">
          <input type="text" value="${escapeHtml(unit.sub||'')}" data-action="edit-unit-sub" data-course-id="${course.id}" data-unit-id="${unit.id}" class="edit-name" placeholder="유닛 주제">
          <button class="btn-danger" data-action="delete-unit" data-course-id="${course.id}" data-unit-id="${unit.id}">삭제</button>
        </div>`;
      unit.lessons.forEach(lesson=>{
        const stage = STAGES[Math.min(lesson.stageIndex||0, STAGES.length-1)];
        html += `<div class="list-row">
          <div style="flex:1;">
            <input type="text" value="${escapeHtml(lesson.title)}" data-action="edit-lesson-title" data-lesson-id="${lesson.id}" class="edit-name" style="width:100%;">
            <div class="muted">${escapeHtml(stage.label)} 단계 · 질문 ${lesson.questions.length}개
              ${lesson.dueDate ? ` · 다음 복습 ${escapeHtml(lesson.dueDate)}` : ''}
              ${lesson.awaitingGrade ? ' · 채점 대기' : ''}</div>
          </div>
          <button class="btn-danger" data-action="delete-lesson" data-course-id="${course.id}" data-unit-id="${unit.id}" data-lesson-id="${lesson.id}">삭제</button>
        </div>`;
      });
      if(unit.lessons.length===0) html += `<div class="empty-hint">레슨 없음</div>`;
      html += `</div>`;
    });
    html += `</div>`;
  });

  return html;
}

/* ==================== 편집 액션 ==================== */
function deleteCourse(courseId){
  if(!confirm('이 코스와 모든 유닛/레슨을 삭제할까요?')) return;
  state.courses = state.courses.filter(c=>c.id!==courseId);
  if(state.selectedCourseId===courseId){
    state.selectedCourseId = state.courses.length ? state.courses[0].id : null;
  }
  saveState(); render();
}
function deleteUnit(courseId, unitId){
  if(!confirm('이 유닛과 안의 모든 레슨을 삭제할까요?')) return;
  const c = getCourse(courseId); if(!c) return;
  c.units = c.units.filter(u=>u.id!==unitId);
  saveState(); render();
}
function deleteLesson(courseId, unitId, lessonId){
  if(!confirm('이 레슨을 삭제할까요?')) return;
  const c = getCourse(courseId); if(!c) return;
  const u = c.units.find(x=>x.id===unitId); if(!u) return;
  u.lessons = u.lessons.filter(l=>l.id!==lessonId);
  saveState(); render();
}
function resetProgress(){
  if(!confirm('모든 완료 기록, 스트릭, XP, 젬을 초기화할까요?')) return;
  allLessons().forEach(x=>{
    Object.assign(x.lesson, { completed:false, mastery:'new', stageIndex:0, intervalDays:0, dueDate:today(), lastScore:null, lastFeedback:'', lastExplanation:'', awaitingGrade:false });
  });
  state.progress = { streak:0, lastStudyDate:null, xp:0, gems:0 };
  saveState(); render();
}

/* ==================== 이벤트 ==================== */
document.addEventListener('click', (e)=>{
  const t = e.target.closest('[data-action]');
  if(!t) return;
  const action = t.dataset.action;
  if(t.tagName==='INPUT') return; // 편집 인풋은 change 이벤트에서 처리

  if(action==='switch-tab'){ ui.notice=null; state.activeTab = t.dataset.tab; track('tab.'+t.dataset.tab); render(); }
  else if(action==='select-course'){ state.selectedCourseId = t.dataset.courseId; saveState(); render(); }
  else if(action==='open-quiz'){ track('act.quiz'); openQuiz(t.dataset.lessonId); }
  else if(action==='reset-usage'){ resetUsage(); }
  else if(action==='close-modal'){ hideModal(); quiz=null; render(); }
  else if(action==='submit-answer'){
    const ta = document.getElementById('answer-input');
    const val = ta ? ta.value.trim() : '';
    if(val) submitAnswer(val);
  }
  else if(action==='submit-ox'){ submitOxAnswer(t.dataset.value === 'true'); }
  else if(action==='skip-question'){ skipQuestion(); }
  else if(action==='discard-question'){ discardQuestion(); }
  else if(action==='delete-course'){ track('act.delete'); deleteCourse(t.dataset.courseId); }
  else if(action==='delete-unit'){ track('act.delete'); deleteUnit(t.dataset.courseId, t.dataset.unitId); }
  else if(action==='delete-lesson'){ track('act.delete'); deleteLesson(t.dataset.courseId, t.dataset.unitId, t.dataset.lessonId); }
  else if(action==='delete-inbox'){
    track('act.delete');
    state.inbox = state.inbox.filter(i=>i.id!==t.dataset.itemId);
    saveState(); render();
  }
  else if(action==='reset-progress'){ track('act.reset'); resetProgress(); }
  else if(action==='toggle-folded'){ ui.showFolded = !ui.showFolded; render(); }
});

document.addEventListener('change', (e)=>{
  const t = e.target.closest('[data-action]');
  if(!t || t.tagName!=='INPUT') return;
  const action = t.dataset.action;
  const course = getCourse(t.dataset.courseId);
  const unit = course ? course.units.find(u=>u.id===t.dataset.unitId) : null;

  if(action==='edit-course-name' && course){ track('act.editName'); course.name = t.value.trim() || course.name; }
  else if(action==='edit-course-color' && course){ track('act.editColor'); Object.assign(course, colorPair(t.value)); }
  else if(action==='edit-unit-name' && unit){ track('act.editName'); unit.name = t.value.trim() || unit.name; }
  else if(action==='edit-unit-sub' && unit){ track('act.editName'); unit.sub = t.value.trim(); }
  else if(action==='edit-unit-color' && unit){ track('act.editColor'); Object.assign(unit, colorPair(t.value)); }
  else if(action==='edit-lesson-title'){
    track('act.editName');
    const lesson = findLessonById(t.dataset.lessonId);
    if(lesson) lesson.title = t.value.trim() || lesson.title;
  } else return;

  saveState(); render();
});

document.addEventListener('submit', (e)=>{
  e.preventDefault();
  if(e.target.id==='ingest-form'){
    const raw = e.target.raw.value;
    e.target.raw.value = '';
    ingestRaw(raw);
  }
});

loadState();
