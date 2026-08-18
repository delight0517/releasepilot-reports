/* GitHub Contents API를 직접 호출해서, 로컬 서버 없이(GitHub Pages 등 정적 호스팅에서도)
   같은 releasepilot-hub 저장소의 apps/brainwire/data/{state.json,jobs.json}을 읽고 쓴다.
   로컬 서버(server/services/hubStore.js)가 git으로 커밋·푸시하는 것과 최종적으로 같은
   파일을 건드리므로, 박새로이의 배치 처리(RUNBOOK.md)는 프론트가 어느 쪽이든 그대로 쓸 수
   있다.

   토큰은 브라우저 localStorage에만 저장한다 — 서버가 없으니 다른 곳으로 보낼 데도 없다.
   반드시 이 repo 하나로만 범위를 좁힌 fine-grained PAT(Contents: Read and write)를 쓸 것 —
   허브 저장소는 여러 프로젝트가 공유하므로, 범위 넓은 토큰이 새면 피해가 브레인와이어
   밖으로 번진다. */

const CLOUD_OWNER = 'delight0517';
const CLOUD_REPO = 'releasepilot-hub';
const CLOUD_BRANCH = 'main';
const CLOUD_DATA_DIR = 'apps/brainwire/data';
const TOKEN_KEY = 'brainwire_gh_token';

function getToken(){ return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t){ localStorage.setItem(TOKEN_KEY, (t||'').trim()); }
function hasToken(){ return !!getToken(); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); }

function apiUrl(path){
  return `https://api.github.com/repos/${CLOUD_OWNER}/${CLOUD_REPO}/contents/${CLOUD_DATA_DIR}/${path}?ref=${CLOUD_BRANCH}`;
}

function b64EncodeUtf8(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUtf8(b64){
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

async function ghGet(path){
  const res = await fetch(apiUrl(path), {
    headers: { 'Authorization': `Bearer ${getToken()}`, 'Accept': 'application/vnd.github+json' },
  });
  if(res.status === 404) return { content: null, sha: null };
  if(!res.ok) throw new Error(`GitHub 읽기 실패 (${res.status}) — 토큰 권한/이름을 확인하세요.`);
  const data = await res.json();
  return { content: JSON.parse(b64DecodeUtf8(data.content)), sha: data.sha };
}

// 읽기→수정→쓰기 사이 sha가 바뀌면(다른 곳에서 먼저 씀) 409가 난다. 1인 전용 도구라
// 재시도 몇 번이면 충분 — 복잡한 락/병합은 안 한다 (hubStore.js와 같은 전제).
async function ghPut(path, data, message, sha){
  const body = {
    message,
    content: b64EncodeUtf8(JSON.stringify(data, null, 2)),
    branch: CLOUD_BRANCH,
  };
  if(sha) body.sha = sha;
  const res = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if(!res.ok){
    const errBody = await res.text().catch(()=> '');
    throw new Error(`GitHub 쓰기 실패 (${res.status}): ${errBody.slice(0,200)}`);
  }
  return res.json();
}

async function withRetry(fn, tries){
  tries = tries || 3;
  let lastErr;
  for(let i=0;i<tries;i++){
    try{ return await fn(); }
    catch(e){ lastErr = e; }
  }
  throw lastErr;
}

/* ==================== state.json ==================== */
async function loadState(){
  const { content } = await ghGet('state.json');
  return content;
}

async function saveState(state){
  await withRetry(async ()=>{
    const { sha } = await ghGet('state.json');
    await ghPut('state.json', state, `브레인와이어 상태 저장 ${new Date().toISOString()}`, sha);
  });
}

/* ==================== jobs.json ==================== */
async function loadJobs(){
  const { content } = await ghGet('jobs.json');
  return (content && content.jobs) || [];
}

function uid(){
  return 'j_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function enqueueJob(type, payload){
  const job = {
    id: uid(), type, status: 'pending', payload, result: null,
    createdAt: new Date().toISOString(), completedAt: null,
  };
  await withRetry(async ()=>{
    const { content, sha } = await ghGet('jobs.json');
    const jobs = (content && content.jobs) || [];
    jobs.push(job);
    await ghPut('jobs.json', { jobs }, `브레인와이어 잡큐 갱신 ${new Date().toISOString()}`, sha);
  });
  return job;
}

async function getJob(id){
  const jobs = await loadJobs();
  return jobs.find(j=>j.id===id) || null;
}

window.BrainwireCloud = {
  getToken, setToken, hasToken, clearToken,
  loadState, saveState, enqueueJob, getJob,
};
