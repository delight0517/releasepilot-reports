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
function isValidEventName(v) {
  return typeof v === "string" && /^[a-z0-9:_-]{1,80}$/.test(v);
}
function dayKeyFromDate(d) {
  return d.toISOString().slice(0, 10);
}
function safeAnalyticsText(v, max = 120) {
  if (typeof v !== "string") return "";
  return v.replace(/[^\p{L}\p{N}\s._:/#?=&-]/gu, "").slice(0, max);
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

// Forward/backward-compat safety net. `mergeTimer1` below only knows the
// fields that exist today; when a NEW feature is added to only ONE of the two
// apps (Windows gets it before Mac, or vice versa), the app that lacks it
// pushes a snapshot WITHOUT that field. Without this, `out` (built from the
// incoming push) would silently drop it every other cycle and it would
// flicker. Here: for every key the stored copy has that the merge did not
// already resolve, either (a) copy it in if `out` is missing it, or (b) if
// both sides carry it as an object with its own `updatedAt`, keep the newer —
// so a brand-new field still syncs bidirectionally the moment BOTH apps have
// it, with zero worker change. `known` lists the keys the explicit merge owns.
function additiveMerge(out, stored, known) {
  if (!out || typeof out !== "object" || Array.isArray(out)) return;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return;
  for (const k of Object.keys(stored)) {
    if (known && known.has(k)) continue;
    const sv = stored[k];
    const ov = out[k];
    if (ov === undefined || ov === null) { out[k] = sv; continue; }
    if (sv && typeof sv === "object" && !Array.isArray(sv) &&
        ov && typeof ov === "object" && !Array.isArray(ov)) {
      const sTs = num(sv.updatedAt), oTs = num(ov.updatedAt);
      if (sTs || oTs) { if (sTs > oTs) out[k] = sv; }
      else additiveMerge(ov, sv, null);
    }
    // both plain scalars with no timestamp: leave `out` (the incoming push).
  }
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

    // --- forward/backward-compat: any field a future one-sided feature adds ---
    additiveMerge(om.settings, ss, new Set([
      "focusMin", "breakMin", "longBreakMin", "sessionsUntilLongBreak",
      "baseFocusMin", "baseBreakMin", "lockMode", "noLockSchedule", "timeOverrides",
    ]));
    additiveMerge(om, sm, new Set([
      "version", "deviceId", "generatedAt", "tzOffsetMinutes", "localTimeLabel",
      "timer", "settings", "sessions", "windowsTagData",
      "scheduledBreakRules", "durationOverrideRules",
    ]));
  }
  additiveMerge(out, stored, new Set([
    "todayFocusSec", "allTimeFocusSec", "settings", "macSnapshot", "updatedAt",
  ]));

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

  account.apps = account.apps || {};
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

  account.apps = account.apps || {};
  return json(account.apps[appId] || { payload: null, updatedAt: null });
}

async function handleAnalyticsEvent(env, req) {
  const body = await req.json().catch(() => ({}));
  const appId = body.appId || "everytime-reminder";
  const event = body.event || "";
  if (!isValidAppId(appId)) return json({ error: "appId 형식이 올바르지 않습니다." }, 400);
  if (!isValidEventName(event)) return json({ error: "event 형식이 올바르지 않습니다." }, 400);

  const visitorId = safeAnalyticsText(body.visitorId, 80) || "anonymous";
  const section = safeAnalyticsText(body.section, 80);
  const path = safeAnalyticsText(body.path, 160) || "/";
  const referrer = safeAnalyticsText(body.referrer, 160);
  const userAgent = req.headers.get("User-Agent") || "";
  const device =
    /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent) ? "mobile" : "desktop";
  const now = new Date();
  const day = dayKeyFromDate(now);
  const key = `analytics:${appId}:${day}`;
  const raw = await env.CLOUD_ACCOUNT_KV.get(key);
  const data = raw ? JSON.parse(raw) : {
    appId,
    day,
    totalEvents: 0,
    uniqueVisitors: {},
    events: {},
    sections: {},
    devices: {},
    paths: {},
    referrers: {},
    updatedAt: null,
  };

  data.totalEvents += 1;
  data.uniqueVisitors[visitorId] = true;
  data.events[event] = (data.events[event] || 0) + 1;
  if (section) data.sections[section] = (data.sections[section] || 0) + 1;
  data.devices[device] = (data.devices[device] || 0) + 1;
  data.paths[path] = (data.paths[path] || 0) + 1;
  if (referrer) data.referrers[referrer] = (data.referrers[referrer] || 0) + 1;
  data.updatedAt = now.toISOString();

  await env.CLOUD_ACCOUNT_KV.put(key, JSON.stringify(data));
  return json({ ok: true });
}

async function handleAnalyticsSummary(env, url) {
  const appId = url.searchParams.get("appId") || "everytime-reminder";
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || 30)));
  if (!isValidAppId(appId)) return json({ error: "appId 형식이 올바르지 않습니다." }, 400);

  const totals = {
    appId,
    days,
    totalEvents: 0,
    uniqueVisitors: 0,
    events: {},
    sections: {},
    devices: {},
    paths: {},
    referrers: {},
    daily: [],
  };
  const visitors = {};
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const day = dayKeyFromDate(d);
    const raw = await env.CLOUD_ACCOUNT_KV.get(`analytics:${appId}:${day}`);
    if (!raw) {
      totals.daily.push({ day, totalEvents: 0, uniqueVisitors: 0 });
      continue;
    }
    const data = JSON.parse(raw);
    totals.totalEvents += data.totalEvents || 0;
    Object.assign(visitors, data.uniqueVisitors || {});
    for (const [bucket, values] of Object.entries({
      events: data.events,
      sections: data.sections,
      devices: data.devices,
      paths: data.paths,
      referrers: data.referrers,
    })) {
      for (const [name, count] of Object.entries(values || {})) {
        totals[bucket][name] = (totals[bucket][name] || 0) + count;
      }
    }
    totals.daily.push({
      day,
      totalEvents: data.totalEvents || 0,
      uniqueVisitors: Object.keys(data.uniqueVisitors || {}).length,
    });
  }
  totals.uniqueVisitors = Object.keys(visitors).length;
  totals.daily.reverse();
  return json(totals);
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
      if (url.pathname === "/analytics/event" && request.method === "POST") return await handleAnalyticsEvent(env, request);
      if (url.pathname === "/analytics/summary" && request.method === "GET") return await handleAnalyticsSummary(env, url);
      return json({ error: "Not found" }, 404);
    } catch (e) {
      return json({ error: `서버 오류: ${e.message}` }, 500);
    }
  },
};
