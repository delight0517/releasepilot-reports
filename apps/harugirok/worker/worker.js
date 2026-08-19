// harugirok-storage — Cloudflare Worker backend for the 사계기록(하루기록) web
// companion + the native app's "피드백 보내기" button.
// Storage: one Workers KV namespace (binding name: HARUGIROK_KV).
//   account:<username>        -> { pin, data: {checkins, addictionModules}, updatedAt }
//   feedback:<timestamp>      -> { message, diagnostics, createdAt }
//
// Username+4-digit PIN is deliberately weak auth (same pattern as
// library-notes-storage's app.js comment) — this is a personal recovery
// companion tool, not a security-sensitive account system.
//
// This is a completely separate Worker/KV namespace from
// library-notes-storage — do not merge them.

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  });
}

function isValidUsername(u) {
  return typeof u === "string" && u.length >= 2 && u.length <= 24;
}
function isValidPin(p) {
  return typeof p === "string" && /^[0-9]{4}$/.test(p);
}

async function getAccount(env, username) {
  const raw = await env.HARUGIROK_KV.get(`account:${username}`);
  return raw ? JSON.parse(raw) : null;
}
async function putAccount(env, username, account) {
  await env.HARUGIROK_KV.put(`account:${username}`, JSON.stringify(account));
}

async function requireAuth(env, username, pin) {
  if (!isValidUsername(username) || !isValidPin(pin)) {
    return { error: json({ error: "유저명 또는 PIN 형식이 올바르지 않습니다." }, 400) };
  }
  const account = await getAccount(env, username);
  if (!account) return { error: json({ error: "존재하지 않는 계정입니다." }, 404) };
  if (account.pin !== pin) return { error: json({ error: "PIN이 일치하지 않습니다." }, 401) };
  return { account };
}

// ── 계정/데이터 ──────────────────────────────────────────────────────────
async function handleAuth(env, req) {
  const { username, pin } = await req.json().catch(() => ({}));
  if (!isValidUsername(username) || !isValidPin(pin)) {
    return json({ error: "유저명은 2~24자, PIN은 숫자 4자리여야 합니다." }, 400);
  }
  let account = await getAccount(env, username);
  let isNew = false;
  if (!account) {
    account = {
      pin,
      data: { checkins: [], addictionModules: [] },
      updatedAt: new Date().toISOString(),
    };
    await putAccount(env, username, account);
    isNew = true;
  } else if (account.pin !== pin) {
    return json({ error: "PIN이 일치하지 않습니다." }, 401);
  }
  return json({ data: account.data, isNew });
}

async function handleSave(env, req) {
  const { username, pin, checkins, addictionModules } = await req.json().catch(() => ({}));
  const { account, error } = await requireAuth(env, username, pin);
  if (error) return error;

  account.data = {
    checkins: checkins || [],
    addictionModules: addictionModules || [],
  };
  account.updatedAt = new Date().toISOString();
  await putAccount(env, username, account);
  return json({ ok: true });
}

// ── 피드백 (요청 2번) ────────────────────────────────────────────────────
// 사람이 나중에 읽고 바로 행동할 수 있는 key:value 텍스트로 저장한다.
// 일기 원문 등 민감한 내용은 클라이언트가 애초에 보내지 않는다(화면 이름/
// 앱 버전/최근 breadcrumb 로그 정도의 진단 메타데이터만).
async function handleFeedback(env, req) {
  const body = await req.json().catch(() => ({}));
  const { message, screen, appVersion, platform, recentLogs, username } = body;
  if (typeof message !== "string" || !message.trim()) {
    return json({ error: "message가 필요합니다." }, 400);
  }
  const now = new Date();
  const key = `feedback:${now.toISOString()}`;
  const record = {
    message: message.trim(),
    screen: typeof screen === "string" ? screen : "",
    appVersion: typeof appVersion === "string" ? appVersion : "",
    platform: typeof platform === "string" ? platform : "",
    username: typeof username === "string" ? username : "",
    recentLogs: Array.isArray(recentLogs) ? recentLogs.slice(0, 20) : [],
    createdAt: now.toISOString(),
  };
  await env.HARUGIROK_KV.put(key, JSON.stringify(record));
  return json({ ok: true, key });
}

async function handleFeedbackList(env) {
  const list = await env.HARUGIROK_KV.list({ prefix: "feedback:" });
  const items = [];
  for (const k of list.keys) {
    const raw = await env.HARUGIROK_KV.get(k.name);
    if (!raw) continue;
    items.push({ key: k.name, ...JSON.parse(raw) });
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json({ feedback: items });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/auth" && request.method === "POST") return await handleAuth(env, request);
      if (url.pathname === "/api/save" && request.method === "POST") return await handleSave(env, request);
      if (url.pathname === "/feedback" && request.method === "POST") return await handleFeedback(env, request);
      if (url.pathname === "/feedback" && request.method === "GET") return await handleFeedbackList(env);
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: `서버 오류: ${e.message}` }, 500);
    }
  },
};
