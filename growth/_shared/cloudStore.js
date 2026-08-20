/* growth 트리 상담 챗 프로토타입용 공용 클라이언트 — brainwire-app의
   apps/brainwire-app/cloudStore.js와 완전히 같은 패턴(GitHub Contents API 직접 호출,
   로컬 서버 없이 정적 호스팅에서도 동작, 토큰은 브라우저 localStorage에만 저장).
   차이는 대상 저장소/경로뿐 — 이 저장소(releasepilot-reports) 안의
   growth/<slug>/interview_queue.json을 읽고 쓴다. slug는 페이지가 초기화 시 지정.

   토큰: 반드시 이 repo 하나로만 범위를 좁힌 fine-grained PAT(Contents: Read and write)를
   쓸 것 — 다른 프로젝트가 공유하는 넓은 토큰을 여기 붙여넣지 않는다. */

const CLOUD_OWNER = 'delight0517';
const CLOUD_REPO = 'releasepilot-reports';
const CLOUD_BRANCH = 'main';
const TOKEN_KEY = 'growth_counsel_gh_token';

function getToken(){ return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t){ localStorage.setItem(TOKEN_KEY, (t||'').trim()); }
function hasToken(){ return !!getToken(); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); }

function apiUrl(path){
  return `https://api.github.com/repos/${CLOUD_OWNER}/${CLOUD_REPO}/contents/${path}?ref=${CLOUD_BRANCH}`;
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

/* ==================== interview_queue.json (트리별) ==================== */
function queuePath(slug){ return `growth/${slug}/interview_queue.json`; }

async function loadQueue(slug){
  const { content } = await ghGet(queuePath(slug));
  return content || { turns: [], status: 'awaiting_user' };
}

// 사용자가 답을 보낼 때: user 턴을 추가하고 status를 'awaiting_assistant'로.
// sha 충돌(다른 곳에서 먼저 씀) 대비 재시도 — hubStore.js/brainwire cloudStore.js와 같은 전제.
async function submitUserTurn(slug, text){
  return withRetry(async ()=>{
    const { content, sha } = await ghGet(queuePath(slug));
    const queue = content || { turns: [], status: 'awaiting_user' };
    queue.turns.push({ role: 'user', text, createdAt: new Date().toISOString() });
    queue.status = 'awaiting_assistant';
    await ghPut(queuePath(slug), queue, `상담 큐: 사용자 답변 추가 (${slug})`, sha);
    return queue;
  });
}

window.GrowthCounselCloud = {
  getToken, setToken, hasToken, clearToken,
  loadQueue, submitUserTurn,
};
