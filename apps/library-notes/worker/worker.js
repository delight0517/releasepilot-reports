// library-notes-storage — Cloudflare Worker backend for the 자료실 app.
// Storage: one Workers KV namespace (binding name: LIBRARY_NOTES_KV).
//   account:<username>       -> { pin, data: {folders, documents}, updatedAt }
//   backup:<username>:<date> -> { folders, documents } (date = YYYY-MM-DD, KST)
//
// Username+4-digit PIN is deliberately weak auth (matches app.js's own comment) —
// this is a personal notes tool, not a security-sensitive account system.

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

function kstDateString(d = new Date()) {
  // KST = UTC+9, no DST.
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function isValidUsername(u) {
  return typeof u === "string" && u.length >= 2 && u.length <= 24;
}
function isValidPin(p) {
  return typeof p === "string" && /^[0-9]{4}$/.test(p);
}

async function getAccount(env, username) {
  const raw = await env.LIBRARY_NOTES_KV.get(`account:${username}`);
  return raw ? JSON.parse(raw) : null;
}
async function putAccount(env, username, account) {
  await env.LIBRARY_NOTES_KV.put(`account:${username}`, JSON.stringify(account));
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

async function handleAuth(env, req) {
  const { username, pin } = await req.json().catch(() => ({}));
  if (!isValidUsername(username) || !isValidPin(pin)) {
    return json({ error: "유저명은 2~24자, PIN은 숫자 4자리여야 합니다." }, 400);
  }
  let account = await getAccount(env, username);
  let isNew = false;
  if (!account) {
    account = { pin, data: { folders: [], documents: [] }, updatedAt: new Date().toISOString() };
    await putAccount(env, username, account);
    isNew = true;
  } else if (account.pin !== pin) {
    return json({ error: "PIN이 일치하지 않습니다." }, 401);
  }
  return json({ data: account.data, isNew });
}

async function handleSave(env, req) {
  const { username, pin, folders, documents } = await req.json().catch(() => ({}));
  const { account, error } = await requireAuth(env, username, pin);
  if (error) return error;

  // Snapshot into today's backup before overwriting, once per day.
  const today = kstDateString();
  const backupKey = `backup:${username}:${today}`;
  const existingBackup = await env.LIBRARY_NOTES_KV.get(backupKey);
  if (!existingBackup) {
    await env.LIBRARY_NOTES_KV.put(backupKey, JSON.stringify(account.data), {
      expirationTtl: 60 * 60 * 24 * 30, // keep 30 days of daily snapshots
    });
  }

  account.data = { folders: folders || [], documents: documents || [] };
  account.updatedAt = new Date().toISOString();
  await putAccount(env, username, account);
  return json({ ok: true });
}

async function handleBackups(env, url) {
  const username = url.searchParams.get("username") || "";
  const pin = url.searchParams.get("pin") || "";
  const { error } = await requireAuth(env, username, pin);
  if (error) return error;

  const list = await env.LIBRARY_NOTES_KV.list({ prefix: `backup:${username}:` });
  const backups = [];
  for (const k of list.keys) {
    const date = k.name.slice(`backup:${username}:`.length);
    const raw = await env.LIBRARY_NOTES_KV.get(k.name);
    if (!raw) continue;
    const snap = JSON.parse(raw);
    backups.push({
      date,
      folderCount: (snap.folders || []).length,
      documentCount: (snap.documents || []).length,
    });
  }
  backups.sort((a, b) => b.date.localeCompare(a.date));
  return json({ backups });
}

async function handleRestore(env, req) {
  const { username, pin, date } = await req.json().catch(() => ({}));
  const { account, error } = await requireAuth(env, username, pin);
  if (error) return error;
  if (!date) return json({ error: "date가 필요합니다." }, 400);

  const raw = await env.LIBRARY_NOTES_KV.get(`backup:${username}:${date}`);
  if (!raw) return json({ error: "해당 날짜의 백업이 없습니다." }, 404);
  const snap = JSON.parse(raw);

  // Preserve current state as today's backup before restoring, so restoring is itself undoable.
  const today = kstDateString();
  const todayBackupKey = `backup:${username}:${today}`;
  const existingToday = await env.LIBRARY_NOTES_KV.get(todayBackupKey);
  if (!existingToday) {
    await env.LIBRARY_NOTES_KV.put(todayBackupKey, JSON.stringify(account.data), {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  }

  account.data = snap;
  account.updatedAt = new Date().toISOString();
  await putAccount(env, username, account);
  return json({ data: snap });
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
      if (url.pathname === "/api/backups" && request.method === "GET") return await handleBackups(env, url);
      if (url.pathname === "/api/restore" && request.method === "POST") return await handleRestore(env, request);
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: `서버 오류: ${e.message}` }, 500);
    }
  },
};
