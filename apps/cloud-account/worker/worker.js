// cloud-account-storage — shared Cloudflare Worker account backend for
// multiple apps (first consumers: timer1/Vintage Pomodoro on Windows,
// ReportHubApp on iOS) to log into the SAME account and sync data between
// devices, without each app needing its own backend.
//
// Modeled directly on apps/library-notes/worker/worker.js (2026-08-12) but
// generalized: instead of a hardcoded {folders, documents} shape, each
// account stores an `apps` map keyed by appId, and each app owns whatever
// JSON shape it wants under its own key — so timer1 and ReportHubApp (or
// any future app) can share one account without colliding.
//
// Storage: one Workers KV namespace (binding name: CLOUD_ACCOUNT_KV).
//   account:<username> -> { pin, apps: { [appId]: {payload, updatedAt} }, createdAt }
//
// Username+4-digit PIN is deliberately weak auth (same tradeoff as
// library-notes) — personal cross-device sync, not a security-sensitive
// account system. A `google` field is reserved on the account record for a
// later phase (linking a Google identity) but nothing here issues or checks
// Google tokens yet.

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
function isValidAppId(a) {
  return typeof a === "string" && /^[a-z0-9_-]{1,32}$/.test(a);
}

async function getAccount(env, username) {
  const raw = await env.CLOUD_ACCOUNT_KV.get(`account:${username}`);
  return raw ? JSON.parse(raw) : null;
}
async function putAccount(env, username, account) {
  await env.CLOUD_ACCOUNT_KV.put(`account:${username}`, JSON.stringify(account));
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

// POST /api/auth {username, pin} -> creates the account on first login
// (matches library-notes' own auto-register-on-first-login behavior),
// otherwise verifies the PIN. Returns the account's full `apps` map so a
// freshly-logging-in device can immediately see every app's synced data.
async function handleAuth(env, req) {
  const { username, pin } = await req.json().catch(() => ({}));
  if (!isValidUsername(username) || !isValidPin(pin)) {
    return json({ error: "유저명은 2~24자, PIN은 숫자 4자리여야 합니다." }, 400);
  }
  let account = await getAccount(env, username);
  let isNew = false;
  if (!account) {
    account = { pin, apps: {}, google: null, createdAt: new Date().toISOString() };
    await putAccount(env, username, account);
    isNew = true;
  } else if (account.pin !== pin) {
    return json({ error: "PIN이 일치하지 않습니다." }, 401);
  }
  return json({ apps: account.apps, isNew });
}

// POST /api/save {username, pin, appId, payload} -> overwrites this app's
// slot only; every other app's data under the same account is untouched.
async function handleSave(env, req) {
  const { username, pin, appId, payload } = await req.json().catch(() => ({}));
  if (!isValidAppId(appId)) return json({ error: "appId 형식이 올바르지 않습니다." }, 400);
  const { account, error } = await requireAuth(env, username, pin);
  if (error) return error;

  account.apps[appId] = { payload: payload ?? null, updatedAt: new Date().toISOString() };
  await putAccount(env, username, account);
  return json({ ok: true });
}

// GET /api/get?username=&pin=&appId= -> read one app's slot, so e.g.
// ReportHubApp can pull the payload timer1 last pushed.
async function handleGet(env, url) {
  const username = url.searchParams.get("username") || "";
  const pin = url.searchParams.get("pin") || "";
  const appId = url.searchParams.get("appId") || "";
  if (!isValidAppId(appId)) return json({ error: "appId 형식이 올바르지 않습니다." }, 400);
  const { account, error } = await requireAuth(env, username, pin);
  if (error) return error;

  return json(account.apps[appId] || { payload: null, updatedAt: null });
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
      if (url.pathname === "/api/get" && request.method === "GET") return await handleGet(env, url);
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: `서버 오류: ${e.message}` }, 500);
    }
  },
};
