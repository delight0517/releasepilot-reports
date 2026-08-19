// 사계기록 웹 — Flutter 앱의 AddictionModule/체크인 개념을 가볍게 재구현한
// 웹 컴패니언. 백엔드는 harugirok-storage(Cloudflare Worker + KV) — 유저명+4자리
// PIN의 의도적으로 약한 인증(개인용 도구, 보안 민감 계정 시스템 아님).
// library-notes 앱의 초기(서버 기반) 패턴을 그대로 재사용했다.

const STORAGE_API_URL = "https://harugirok-storage.rogan2534.workers.dev";
const CREDS_KEY = "harugirokWeb_creds_v1"; // {username, pin} — 로그아웃 전까지 자동 로그인

let creds = null; // {username, pin}
let data = { checkins: [], addictionModules: [] };
let selectedPreset = null;
let selectedOutcome = null;
let saveTimer = null;

const el = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayStr = () => new Date().toISOString().slice(0, 10);

const PRESETS = [
  { id: "food", label: "음식/식습관", emoji: "🍔" },
  { id: "shortsVideo", label: "쇼츠·영상 시청", emoji: "📱" },
  { id: "sns", label: "SNS", emoji: "💬" },
  { id: "game", label: "게임", emoji: "🎮" },
  { id: "shopping", label: "쇼핑", emoji: "🛍️" },
  { id: "smoking", label: "흡연/니코틴", emoji: "🚬" },
  { id: "alcohol", label: "음주", emoji: "🍺" },
  { id: "gambling", label: "도박", emoji: "🎲" },
  { id: "custom", label: "직접 입력", emoji: "✍️" },
];

// ── API ──────────────────────────────────────────────────────────────────
async function apiAuth(username, pin) {
  const res = await fetch(`${STORAGE_API_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, pin }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "로그인에 실패했습니다.");
  return body;
}

async function apiSave() {
  if (!creds) return;
  el("sync-status").textContent = "저장 중...";
  try {
    const res = await fetch(`${STORAGE_API_URL}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: creds.username,
        pin: creds.pin,
        checkins: data.checkins,
        addictionModules: data.addictionModules,
      }),
    });
    if (!res.ok) throw new Error("저장 실패");
    el("sync-status").textContent = `✅ 저장됨 (${new Date().toLocaleTimeString()})`;
  } catch (e) {
    el("sync-status").textContent = "⚠️ 저장 실패 — 네트워크를 확인해주세요.";
  }
}

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(apiSave, 350);
}

async function apiFeedback(message) {
  const res = await fetch(`${STORAGE_API_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      screen: "harugirok-web",
      appVersion: "web-1",
      platform: navigator.userAgent,
      username: creds ? creds.username : "",
      recentLogs: [],
    }),
  });
  if (!res.ok) throw new Error("전송 실패");
}

// ── 로그인 ───────────────────────────────────────────────────────────────
async function handleLogin() {
  const username = el("login-username").value.trim();
  const pin = el("login-pin").value.trim();
  if (username.length < 2 || username.length > 24) {
    el("login-status").textContent = "❌ 유저명은 2~24자여야 해요.";
    return;
  }
  if (!/^[0-9]{4}$/.test(pin)) {
    el("login-status").textContent = "❌ PIN은 숫자 4자리여야 해요.";
    return;
  }
  el("login-status").textContent = "";
  try {
    const result = await apiAuth(username, pin);
    creds = { username, pin };
    localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
    data = result.data || { checkins: [], addictionModules: [] };
    enterApp();
  } catch (e) {
    el("login-status").textContent = `❌ ${e.message}`;
  }
}

function logout() {
  if (!confirm("로그아웃할까요? 저장된 데이터는 서버에 그대로 남아있어요.")) return;
  localStorage.removeItem(CREDS_KEY);
  creds = null;
  data = { checkins: [], addictionModules: [] };
  el("screen-app").style.display = "none";
  el("screen-login").style.display = "flex";
  el("login-username").value = "";
  el("login-pin").value = "";
}

function enterApp() {
  el("screen-login").style.display = "none";
  el("screen-app").style.display = "block";
  el("account-badge").textContent = `👤 ${creds.username}`;
  el("checkin-date").value = todayStr();
  renderPresetGrid();
  renderModuleList();
  renderCheckinList();
}

// ── 요청 1: 버튼식 온보딩 ────────────────────────────────────────────────
function renderPresetGrid() {
  const grid = el("preset-grid");
  grid.innerHTML = "";
  PRESETS.forEach((p) => {
    const btn = document.createElement("button");
    btn.className = "preset-btn" + (selectedPreset === p.id ? " selected" : "");
    btn.innerHTML = `<span class="emoji">${p.emoji}</span><span>${p.label}</span>`;
    btn.onclick = () => {
      selectedPreset = p.id;
      el("custom-input-wrap").style.display = p.id === "custom" ? "block" : "none";
      el("btn-start-module").style.display = "block";
      renderPresetGrid();
    };
    grid.appendChild(btn);
  });
}

function activeModules() {
  return data.addictionModules.filter((m) => m.status !== "resolved" && m.status !== "archived");
}

function streakFor(module) {
  const occurrences = data.checkins
    .filter((c) => c.moduleId === module.id)
    .map((c) => c.date)
    .sort();
  const reference = new Date();
  const last = occurrences.length ? new Date(occurrences[occurrences.length - 1]) : new Date(module.startedAt);
  const days = Math.floor((reference - last) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

function startModule() {
  if (!selectedPreset) return;
  const preset = PRESETS.find((p) => p.id === selectedPreset);
  const label = selectedPreset === "custom" ? el("custom-label-input").value.trim() : preset.label;
  if (!label) {
    el("custom-label-input").focus();
    return;
  }
  const module = {
    id: uid(),
    label,
    preset: selectedPreset,
    startedAt: new Date().toISOString(),
    status: "active",
    streakThresholdDays: 14,
    createdAt: new Date().toISOString(),
  };
  data.addictionModules.push(module);
  save();
  selectedPreset = null;
  el("custom-input-wrap").style.display = "none";
  el("btn-start-module").style.display = "none";
  el("custom-label-input").value = "";
  renderPresetGrid();
  renderModuleList();
  alert(`"${label}" 시작했어요. 오늘부터 같이 관리해요.`);
}

function logOccurrence(moduleId) {
  data.checkins.push({
    id: uid(),
    moduleId,
    date: todayStr(),
    didBehavior: true,
    note: "웹에서 기록됨",
  });
  save();
  renderModuleList();
}

function resolveModule(moduleId) {
  const module = data.addictionModules.find((m) => m.id === moduleId);
  if (!module) return;
  if (!confirm(`"${module.label}" 문제, 이제 완전히 해결된 걸까요?`)) return;
  module.status = "resolved";
  module.resolvedAt = new Date().toISOString();
  save();
  renderModuleList();
}

function renderModuleList() {
  const list = el("module-list");
  const active = activeModules();
  if (!active.length) {
    list.innerHTML = '<p class="empty-hint">아직 시작한 모듈이 없어요. 위 버튼으로 골라보세요.</p>';
    return;
  }
  list.innerHTML = "";
  active.forEach((m) => {
    const card = document.createElement("div");
    card.className = "module-card";
    card.innerHTML = `
      <h3>🛡️ ${m.label}</h3>
      <div class="streak">연속 ${streakFor(m)}일째 · ${m.streakThresholdDays}일 채우면 다시 물어볼게요</div>
      <div class="actions">
        <button class="secondary-btn btn-log">오늘 있었어요</button>
        <button class="secondary-btn btn-resolve">해결됐어요</button>
      </div>
    `;
    card.querySelector(".btn-log").onclick = () => logOccurrence(m.id);
    card.querySelector(".btn-resolve").onclick = () => resolveModule(m.id);
    list.appendChild(card);
  });
}

// ── 요청 1 보조: 체크인 ──────────────────────────────────────────────────
function saveCheckin() {
  const date = el("checkin-date").value || todayStr();
  const tags = el("checkin-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
  const note = el("checkin-note").value.trim();
  data.checkins.push({
    id: uid(),
    date,
    outcome: selectedOutcome,
    tags,
    note,
    createdAt: new Date().toISOString(),
  });
  save();
  el("checkin-note").value = "";
  el("checkin-tags").value = "";
  selectedOutcome = null;
  el("btn-outcome-good").classList.remove("selected");
  el("btn-outcome-tough").classList.remove("selected");
  renderCheckinList();
}

function renderCheckinList() {
  const list = el("checkin-list");
  const entries = data.checkins
    .filter((c) => !c.moduleId) // 모듈 발생 기록이 아니라 일반 체크인만
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 15);
  if (!entries.length) {
    list.innerHTML = '<p class="empty-hint">아직 체크인이 없어요.</p>';
    return;
  }
  list.innerHTML = "";
  entries.forEach((c) => {
    const row = document.createElement("div");
    row.className = "entry-row";
    const outcomeLabel = c.outcome === "good" ? "🙂 좋은 하루" : c.outcome === "tough" ? "😮‍💨 힘든 하루" : "";
    row.innerHTML = `
      <div class="date">${c.date} ${outcomeLabel}</div>
      ${c.tags && c.tags.length ? `<div class="note">${c.tags.join(", ")}</div>` : ""}
      ${c.note ? `<div class="note">${escapeHtml(c.note)}</div>` : ""}
    `;
    list.appendChild(row);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = String(s == null ? "" : s);
  return div.innerHTML;
}

// ── 탭 ───────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
}

// ── 요청 2: 피드백 ───────────────────────────────────────────────────────
function openFeedback() {
  el("feedback-text").value = "";
  el("modal-feedback").style.display = "flex";
}
function closeFeedback() {
  el("modal-feedback").style.display = "none";
}
async function sendFeedback() {
  const message = el("feedback-text").value.trim();
  if (!message) return;
  try {
    await apiFeedback(message);
    closeFeedback();
    alert("피드백을 보냈어요. 확인 후 반영할게요.");
  } catch (e) {
    alert("전송에 실패했어요. 나중에 다시 시도해주세요.");
  }
}

// ── 초기화 ───────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  el("btn-login").onclick = handleLogin;
  el("login-pin").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
  el("btn-logout").onclick = logout;
  el("btn-start-module").onclick = startModule;
  el("btn-save-checkin").onclick = saveCheckin;
  el("btn-outcome-good").onclick = () => {
    selectedOutcome = "good";
    el("btn-outcome-good").classList.add("selected");
    el("btn-outcome-tough").classList.remove("selected");
  };
  el("btn-outcome-tough").onclick = () => {
    selectedOutcome = "tough";
    el("btn-outcome-tough").classList.add("selected");
    el("btn-outcome-good").classList.remove("selected");
  };
  el("btn-feedback").onclick = openFeedback;
  el("btn-feedback-cancel").onclick = closeFeedback;
  el("btn-feedback-send").onclick = sendFeedback;

  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.onclick = () => switchTab(b.dataset.tab);
  });

  const savedCreds = localStorage.getItem(CREDS_KEY);
  if (savedCreds) {
    try {
      creds = JSON.parse(savedCreds);
      const result = await apiAuth(creds.username, creds.pin);
      data = result.data || { checkins: [], addictionModules: [] };
      enterApp();
      return;
    } catch (e) {
      // 저장된 자격정보가 더 이상 유효하지 않으면 로그인 화면으로.
      localStorage.removeItem(CREDS_KEY);
      creds = null;
    }
  }
  el("screen-login").style.display = "flex";
});
