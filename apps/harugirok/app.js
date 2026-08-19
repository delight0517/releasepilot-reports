// 사계기록 웹 — Flutter 앱의 AddictionModule/체크인 개념을 가볍게 재구현한
// 웹 컴패니언. 백엔드는 harugirok-storage(Cloudflare Worker + KV) — 유저명+4자리
// PIN의 의도적으로 약한 인증(개인용 도구, 보안 민감 계정 시스템 아님).
// library-notes 앱의 초기(서버 기반) 패턴을 그대로 재사용했다.

const STORAGE_API_URL = "https://harugirok-storage.rogan2534.workers.dev";
const CREDS_KEY = "harugirokWeb_creds_v1"; // {username, pin} — 로그아웃 전까지 자동 로그인

let creds = null; // {username, pin}
let data = { checkins: [], addictionModules: [], goals: [] };
let selectedPreset = null;
let selectedOutcome = null; // "good" | "tough" | null(건너뜀)
let saveTimer = null;
let editingCheckinId = null; // 날짜별 일기를 수정 중이면 그 항목의 id, 새 글이면 null

const el = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayStr = () => new Date().toISOString().slice(0, 10);

// 폰앱 lib/models/entry.dart의 TagCatalog.defaultScaleAnchors를 그대로
// 반영한 카테고리+1점/5점 라벨. 앱과 다른 카테고리를 새로 만들지 않는다.
const CATEGORIES = [
  { key: "학업", low: "많이 밀렸어요", high: "잘 소화했어요" },
  { key: "수면", low: "많이 부족했어요", high: "충분히 잤어요" },
  { key: "운동/건강", low: "전혀 못 챙겼어요", high: "잘 챙겼어요" },
  { key: "대인관계(친구)", low: "교류가 거의 없었어요", high: "만족스러웠어요" },
  { key: "신앙/영성", low: "공허했어요", high: "충만했어요" },
  { key: "감정 상태", low: "많이 힘들었어요", high: "좋았어요" },
  { key: "업무/일과", low: "많이 밀렸어요", high: "잘 해냈어요" },
  { key: "피로도", low: "많이 피곤했어요", high: "개운했어요" },
];
let categoryRatings = {}; // { "학업": 4, ... } — 답 안 한 카테고리는 키 자체가 없음

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
        goals: data.goals,
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
    data = result.data || { checkins: [], addictionModules: [], goals: [] };
    if (!data.goals) data.goals = [];
    enterApp();
  } catch (e) {
    el("login-status").textContent = `❌ ${e.message}`;
  }
}

function logout() {
  if (!confirm("로그아웃할까요? 저장된 데이터는 서버에 그대로 남아있어요.")) return;
  localStorage.removeItem(CREDS_KEY);
  creds = null;
  data = { checkins: [], addictionModules: [], goals: [] };
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
  renderRatingGrid();
  renderCheckinList();
  renderGoalList();
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

// ── 일기: 카테고리 1-5점 체크인 ──────────────────────────────────────────
function renderRatingGrid() {
  const grid = el("rating-grid");
  grid.innerHTML = "";
  CATEGORIES.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "rating-row";
    const scoreButtons = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<button type="button" class="rating-score-btn${categoryRatings[cat.key] === n ? " selected" : ""}" data-cat="${cat.key}" data-score="${n}">${n}</button>`
      )
      .join("");
    row.innerHTML = `
      <div class="rating-label">${cat.key}<span class="rating-anchor">1: ${cat.low} · 5: ${cat.high}</span></div>
      <div class="rating-scores">${scoreButtons}</div>
    `;
    grid.appendChild(row);
  });
  grid.querySelectorAll(".rating-score-btn").forEach((btn) => {
    btn.onclick = () => {
      const cat = btn.dataset.cat;
      const score = Number(btn.dataset.score);
      // 같은 점수를 다시 누르면 답을 지운다(스킵 가능해야 하므로).
      if (categoryRatings[cat] === score) delete categoryRatings[cat];
      else categoryRatings[cat] = score;
      renderRatingGrid();
    };
  });
}

// ── 요청 1 보조: 일기(날짜별 자유 텍스트 + 카테고리 점수) ──────────────────
// 날짜당 하나(같은 날짜로 다시 저장하면 그 항목을 덮어씀) — 소급 작성/수정 지원.
function saveCheckin() {
  const date = el("checkin-date").value || todayStr();
  const tags = el("checkin-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
  const note = el("checkin-note").value.trim();

  const existing = editingCheckinId
    ? data.checkins.find((c) => c.id === editingCheckinId)
    : data.checkins.find((c) => !c.moduleId && c.date === date);

  if (existing) {
    existing.date = date;
    existing.outcome = selectedOutcome;
    existing.tags = tags;
    existing.note = note;
    existing.categoryRatings = { ...categoryRatings };
    existing.updatedAt = new Date().toISOString();
  } else {
    data.checkins.push({
      id: uid(),
      date,
      outcome: selectedOutcome,
      tags,
      note,
      categoryRatings: { ...categoryRatings },
      createdAt: new Date().toISOString(),
    });
  }
  save();
  resetCheckinForm();
  renderCheckinList();
}

function resetCheckinForm() {
  editingCheckinId = null;
  categoryRatings = {};
  el("checkin-date").value = todayStr();
  el("checkin-note").value = "";
  el("checkin-tags").value = "";
  selectedOutcome = null;
  el("btn-outcome-good").classList.remove("selected");
  el("btn-outcome-tough").classList.remove("selected");
  el("btn-cancel-edit").style.display = "none";
  renderRatingGrid();
}

// 목록에서 날짜 하나를 눌러 그날 일기를 폼에 불러온다(조회 + 수정 진입점) —
// 과거 날짜 일기도 이 방식으로 조회 가능.
function loadCheckinForEdit(id) {
  const c = data.checkins.find((x) => x.id === id);
  if (!c) return;
  editingCheckinId = id;
  el("checkin-date").value = c.date;
  el("checkin-note").value = c.note || "";
  el("checkin-tags").value = (c.tags || []).join(", ");
  selectedOutcome = c.outcome || null;
  el("btn-outcome-good").classList.toggle("selected", selectedOutcome === "good");
  el("btn-outcome-tough").classList.toggle("selected", selectedOutcome === "tough");
  categoryRatings = { ...(c.categoryRatings || {}) };
  el("btn-cancel-edit").style.display = "block";
  renderRatingGrid();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteCheckin(id) {
  if (!confirm("이 날짜의 일기를 삭제할까요?")) return;
  data.checkins = data.checkins.filter((c) => c.id !== id);
  if (editingCheckinId === id) resetCheckinForm();
  save();
  renderCheckinList();
}

function renderCheckinList() {
  const list = el("checkin-list");
  const entries = data.checkins
    .filter((c) => !c.moduleId) // 모듈 발생 기록이 아니라 일반 일기만
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!entries.length) {
    list.innerHTML = '<p class="empty-hint">아직 일기가 없어요.</p>';
    return;
  }
  list.innerHTML = "";
  entries.forEach((c) => {
    const row = document.createElement("div");
    row.className = "entry-row entry-row-clickable";
    const outcomeLabel = c.outcome === "good" ? "🙂 좋은 하루" : c.outcome === "tough" ? "😮‍💨 힘든 하루" : "";
    const ratingsText = c.categoryRatings && Object.keys(c.categoryRatings).length
      ? Object.entries(c.categoryRatings).map(([k, v]) => `${k} ${v}점`).join(" · ")
      : "";
    row.innerHTML = `
      <div class="date">${c.date} ${outcomeLabel}</div>
      ${ratingsText ? `<div class="note">${escapeHtml(ratingsText)}</div>` : ""}
      ${c.tags && c.tags.length ? `<div class="note">${escapeHtml(c.tags.join(", "))}</div>` : ""}
      ${c.note ? `<div class="note">${escapeHtml(c.note)}</div>` : ""}
      <button type="button" class="icon-btn entry-delete" title="삭제">🗑️</button>
    `;
    row.querySelector(".entry-delete").onclick = (e) => {
      e.stopPropagation();
      deleteCheckin(c.id);
    };
    row.onclick = () => loadCheckinForEdit(c.id);
    list.appendChild(row);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = String(s == null ? "" : s);
  return div.innerHTML;
}

// ── 목표 관리 (폰앱 goals_screen.dart의 핵심: 추가/조회/완료체크) ──────────
function addGoal() {
  const title = el("goal-title").value.trim();
  if (!title) {
    el("goal-title").focus();
    return;
  }
  const description = el("goal-desc").value.trim();
  data.goals.push({
    id: uid(),
    title,
    description: description || null,
    createdAt: new Date().toISOString(),
    isAchieved: false,
    achievedAt: null,
  });
  save();
  el("goal-title").value = "";
  el("goal-desc").value = "";
  renderGoalList();
}

function toggleGoalAchieved(id) {
  const g = data.goals.find((x) => x.id === id);
  if (!g) return;
  g.isAchieved = !g.isAchieved;
  g.achievedAt = g.isAchieved ? new Date().toISOString() : null;
  save();
  renderGoalList();
}

function deleteGoal(id) {
  if (!confirm("이 목표를 삭제할까요?")) return;
  data.goals = data.goals.filter((g) => g.id !== id);
  save();
  renderGoalList();
}

function renderGoalList() {
  const list = el("goal-list");
  const goals = data.goals || [];
  const active = goals.filter((g) => !g.isAchieved);
  const achieved = goals.filter((g) => g.isAchieved);
  if (!goals.length) {
    list.innerHTML = '<p class="empty-hint">아직 등록한 목표가 없어요.</p>';
    return;
  }
  const renderGoal = (g) => `
    <div class="goal-card" data-id="${g.id}">
      <div class="goal-title${g.isAchieved ? " achieved" : ""}">${g.isAchieved ? "🏆" : "🚩"} ${escapeHtml(g.title)}</div>
      ${g.description ? `<div class="goal-desc">${escapeHtml(g.description)}</div>` : ""}
      <div class="goal-meta">${g.isAchieved ? `${(g.achievedAt || "").slice(0, 10)}에 달성` : `${(g.createdAt || "").slice(0, 10)}에 등록`}</div>
      <div class="actions">
        <button class="secondary-btn btn-toggle-goal">${g.isAchieved ? "달성 취소" : "달성했어요"}</button>
        <button class="secondary-btn btn-delete-goal">삭제</button>
      </div>
    </div>
  `;
  list.innerHTML =
    active.map(renderGoal).join("") +
    (achieved.length ? `<h3 style="font-size:13px; color:#6b8c82;">달성한 목표</h3>` + achieved.map(renderGoal).join("") : "");
  list.querySelectorAll(".goal-card").forEach((card) => {
    const id = card.dataset.id;
    card.querySelector(".btn-toggle-goal").onclick = () => toggleGoalAchieved(id);
    card.querySelector(".btn-delete-goal").onclick = () => deleteGoal(id);
  });
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
  el("btn-outcome-clear").onclick = () => {
    selectedOutcome = null;
    el("btn-outcome-good").classList.remove("selected");
    el("btn-outcome-tough").classList.remove("selected");
  };
  el("btn-cancel-edit").onclick = resetCheckinForm;
  el("btn-add-goal").onclick = addGoal;
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
      data = result.data || { checkins: [], addictionModules: [], goals: [] };
      if (!data.goals) data.goals = [];
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
