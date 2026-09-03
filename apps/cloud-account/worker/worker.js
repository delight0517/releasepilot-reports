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

// ---------------------------------------------------------------------------
// Field-wise timestamped merge (opt-in via `merge: "timer1-fieldwise"`).
//
// Why: two devices (Mac + Windows) both do read-modify-write against this
// slot every 10 s.  KV is eventually consistent, and a plain last-write-wins
// overwrite lets a device that read a stale copy re-assert an old state and
// clobber the peer's newer change purely because its POST arrived later.
//
// The fix: treat the payload as a bundle of independently-owned pieces, each
// carrying its own timestamp, and keep the newest version of EACH piece by
// that piece's own timestamp — not by which POST landed last.  A stale
// re-push then simply loses every field where the stored copy is newer.
// See timer1/SYNC_V2_BLUECLOUD.md.
// ---------------------------------------------------------------------------
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

// Keep whichever of a/b has the larger value at tsPath; ties and missing
// data keep `b` (the incoming push). Returns the winner.
function newerByPath(a, b, tsPath) {
  const read = (o) => tsPath.reduce((x, k) => (x && typeof x === "object" ? x[k] : undefined), o);
  if (!a) return b;
  if (!b) return a;
  return num(read(a)) > num(read(b)) ? a : b;
}

function mergeTimer1(stored, incoming) {
  if (!stored || typeof stored !== "object") return incoming;
  if (!incoming || typeof incoming !== "object") return stored;

  // Start from the incoming push, then pull back any stored field that is newer.
  const out = JSON.parse(JSON.stringify(incoming));

  out.todayFocusSec = Math.max(num(stored.todayFocusSec), num(incoming.todayFocusSec));
  out.allTimeFocusSec = Math.max(num(stored.allTimeFocusSec), num(incoming.allTimeFocusSec));

  const sm = stored.macSnapshot, im = incoming.macSnapshot;
  if (sm && typeof sm === "object" && im && typeof im === "object") {
    const om = out.macSnapshot;

    // --- timer block: newest timer.updatedAt wins; identical logical state
    //     keeps the stored copy (and its older timestamp) so a re-push of the
    //     same state never bumps the clock or flips authorship.
    const st = sm.timer || {}, it = im.timer || {};
    const sameLogicalTimer =
      st.mode === it.mode && !!st.running === !!it.running &&
      (st.startsAt ?? null) === (it.startsAt ?? null) &&
      (st.endsAt ?? null) === (it.endsAt ?? null);
    if (sameLogicalTimer) {
      om.timer = { ...st };
      om.deviceId = sm.deviceId ?? om.deviceId;
    } else if (num(st.updatedAt) > num(it.updatedAt)) {
      om.timer = { ...st };
      om.deviceId = sm.deviceId ?? om.deviceId;
    }
    if (om.timer) {
      om.timer.completedFocusCount = Math.max(
        num(st.completedFocusCount), num(it.completedFocusCount));
    }

    // --- settings sub-blocks, each by its own updatedAt ---
    const ss = sm.settings || {}, is_ = im.settings || {};
    const os = (om.settings = om.settings || {});

    const slm = ss.lockMode || {}, ilm = is_.lockMode || {};
    const olm = (os.lockMode = os.lockMode || {});
    // strict lock on/off
    if (num(slm.strictLockUpdatedAt) > num(ilm.strictLockUpdatedAt)) {
      olm.strictLockEnabled = slm.strictLockEnabled;
      olm.strictLockUpdatedAt = slm.strictLockUpdatedAt;
    }
    // lock-only-during-this-window schedule
    const sSch = slm.schedule || {}, iSch = ilm.schedule || {};
    if (num(sSch.scheduleUpdatedAt) > num(iSch.scheduleUpdatedAt)) olm.schedule = { ...sSch };

    // no-lock schedule / time overrides — whole block by .updatedAt
    os.noLockSchedule = newerByPath(ss.noLockSchedule, is_.noLockSchedule, ["updatedAt"]);
    os.timeOverrides = newerByPath(ss.timeOverrides, is_.timeOverrides, ["updatedAt"]);

    // scalar duration settings + windows-owned tag data — by generatedAt
    if (num(sm.generatedAt) > num(im.generatedAt)) {
      for (const k of ["focusMin", "breakMin", "longBreakMin", "sessionsUntilLongBreak",
                       "baseFocusMin", "baseBreakMin"]) {
        if (ss[k] !== undefined) os[k] = ss[k];
      }
      if (sm.windowsTagData !== undefined) om.windowsTagData = sm.windowsTagData;
    }

    // rule sets — whole block by .updatedAt
    om.scheduledBreakRules = newerByPath(sm.scheduledBreakRules, im.scheduledBreakRules, ["updatedAt"]);
    om.durationOverrideRules = newerByPath(sm.durationOverrideRules, im.durationOverrideRules, ["updatedAt"]);
  }

  // legacy flat settings block (a peer too old to send macSnapshot) — by payload.updatedAt
  const winner = newerByPath(
    { p: stored.settings, t: stored.updatedAt },
    { p: incoming.settings, t: incoming.updatedAt },
    ["t"],
  );
  if (winner && winner.p !== undefined) out.settings = winner.p;

  return out;
}

// POST /api/save {username, pin, appId, payload, merge?} -> writes this app's
// slot only; every other app's data under the same account is untouched.
// With merge:"timer1-fieldwise" the payload is merged field-by-field into the
// stored copy (see mergeTimer1); otherwise it overwrites (original behavior).
async function handleSave(env, req) {
  const { username, pin, appId, payload, merge } = await req.json().catch(() => ({}));
  if (!isValidAppId(appId)) return json({ error: "appId 형식이 올바르지 않습니다." }, 400);
  const { account, error } = await requireAuth(env, username, pin);
  if (error) return error;

  const prev = account.apps[appId];
  let nextPayload = payload ?? null;
  if (merge === "timer1-fieldwise" && prev && prev.payload) {
    try {
      nextPayload = mergeTimer1(prev.payload, payload ?? null);
    } catch (e) {
      // never lose a write to a merge bug — fall back to overwrite
      nextPayload = payload ?? null;
    }
  }
  // slot.updatedAt is monotonic: max(stored, now)
  const nowIso = new Date().toISOString();
  const slotUpdatedAt =
    prev && prev.updatedAt && prev.updatedAt > nowIso ? prev.updatedAt : nowIso;
  account.apps[appId] = { payload: nextPayload, updatedAt: slotUpdatedAt };
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
