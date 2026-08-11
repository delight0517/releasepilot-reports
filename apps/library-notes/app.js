// 자료실 — 노션처럼 폴더 안에 폴더를 넣을 수 있는 자료 정리 웹앱.
// 2026-08-11부터 유저명+4자리 PIN 계정 시스템(Cloudflare Worker + KV)을 붙여서
// 외부 사용자도 다른 기기에서 같은 유저명+PIN으로 이어서 쓸 수 있게 했다 —
// 이전의 "이 기기에만 저장" 방식은 내보내기/가져오기(.json)로 여전히 남겨둔다
// (계정 서버가 응답 안 할 때의 백업 수단으로도 씀).
//
// 보안 원칙: PIN은 메모리에만 들고 있고(로그인 세션 변수), localStorage에는
// 절대 쓰지 않는다 — 새로고침하면 다시 로그인해야 하는 게 의도된 동작이다
// (4자리 PIN은 애초에 강한 인증이 아니므로, 그나마 브라우저 저장소에 평문으로
// 남기지 않는 걸로 최소한의 안전판을 둔다).

// 실제로 배포된 저장 서버 — 배포 전까지는 PLACEHOLDER로 남아 있고, 이 상태에서는
// 로그인 화면에 "서버 준비 중" 안내만 뜬다(2026-08-11, balance-game과 같은 패턴).
const STORAGE_API_URL = "https://library-notes-storage.PLACEHOLDER.workers.dev";
const LAST_USERNAME_KEY = "libraryNotesWeb_lastUsername_v1"; // 유저명만 기억, PIN은 절대 저장 안 함
const FONT_SIZE_KEY = "libraryNotesWeb_readFontSize_v1";

let data = { folders: [], documents: [] };
let currentFolderId = null; // null = 최상위
let session = null; // { username, pin } — 메모리에만 존재
let saveTimer = null;

const el = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function isServerReady() {
  return !STORAGE_API_URL.includes("PLACEHOLDER");
}

// ── 인증 ──────────────────────────────────────────────────────────────────
async function login(username, pin) {
  if (!isServerReady()) {
    throw new Error("서버 준비 중입니다 — 조금 있다가 다시 시도해주세요.");
  }
  const res = await fetch(`${STORAGE_API_URL}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, pin }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `로그인 실패 (${res.status})`);
  return body;
}

async function persistToServer() {
  if (!session || !isServerReady()) return;
  try {
    const res = await fetch(`${STORAGE_API_URL}/api/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: session.username, pin: session.pin, folders: data.folders, documents: data.documents }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `저장 실패 (${res.status})`);
    el("sync-status").textContent = `✅ 저장됨 (${new Date().toLocaleTimeString()})`;
  } catch (e) {
    el("sync-status").textContent = `⚠️ 서버 저장 실패 — 이 기기에는 남아있습니다: ${e.message}`;
  }
}

// 저장 호출을 짧게 묶어서(연타 방지) 서버 부하를 줄인다.
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  el("sync-status").textContent = "저장 중...";
  saveTimer = setTimeout(persistToServer, 400);
}

// ── 데이터 조작 ───────────────────────────────────────────────────────────
function childFolders(parentId) {
  return data.folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
function documentsIn(folderId) {
  return data.documents
    .filter((d) => d.folderId === folderId)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}
function folderById(id) {
  return data.folders.find((f) => f.id === id) || null;
}

function breadcrumbPath() {
  const path = [];
  let f = folderById(currentFolderId);
  while (f) {
    path.unshift(f);
    f = folderById(f.parentId);
  }
  return path;
}

function addFolder(name, emoji, parentId) {
  data.folders.push({ id: uid(), name, emoji, parentId, createdAt: new Date().toISOString() });
  save();
}
function renameFolder(id, newName) {
  const f = folderById(id);
  if (!f) return;
  f.name = newName;
  save();
}

function deleteFolderCascade(folderId) {
  const toDelete = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of data.folders) {
      if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
        toDelete.add(f.id);
        grew = true;
      }
    }
  }
  data.folders = data.folders.filter((f) => !toDelete.has(f.id));
  data.documents = data.documents.filter((d) => !toDelete.has(d.folderId));
  save();
}

function addDocument(folderId, title, content) {
  const now = new Date().toISOString();
  data.documents.push({ id: uid(), folderId, title, content, createdAt: now, updatedAt: now });
  save();
}
function updateDocument(id, title, content) {
  const doc = data.documents.find((d) => d.id === id);
  if (!doc) return;
  doc.title = title;
  doc.content = content;
  doc.updatedAt = new Date().toISOString();
  save();
}
function deleteDocument(id) {
  data.documents = data.documents.filter((d) => d.id !== id);
  save();
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = String(s == null ? "" : s);
  return div.innerHTML;
}

// ── 화면 렌더 ─────────────────────────────────────────────────────────────
function renderBreadcrumb() {
  const wrap = el("breadcrumb");
  wrap.innerHTML = "";
  const rootBtn = document.createElement("button");
  rootBtn.className = "crumb";
  rootBtn.textContent = "🗂️ 자료실";
  rootBtn.onclick = () => {
    currentFolderId = null;
    renderBrowser();
  };
  wrap.appendChild(rootBtn);
  breadcrumbPath().forEach((f) => {
    const sep = document.createElement("span");
    sep.className = "crumb-sep";
    sep.textContent = "›";
    wrap.appendChild(sep);
    const btn = document.createElement("button");
    btn.className = "crumb";
    btn.textContent = `${f.emoji} ${f.name}`;
    btn.onclick = () => {
      currentFolderId = f.id;
      renderBrowser();
    };
    wrap.appendChild(btn);
  });
}

function renderBrowser() {
  renderBreadcrumb();
  const list = el("browser-list");
  list.innerHTML = "";

  const folders = childFolders(currentFolderId);
  const docs = currentFolderId ? documentsIn(currentFolderId) : [];

  if (!folders.length && !docs.length) {
    list.innerHTML = '<p class="empty-hint">비어 있습니다. 아래 + 버튼으로 폴더나 자료를 추가하세요.</p>';
  }

  folders.forEach((f) => {
    const row = document.createElement("div");
    row.className = "row-item";
    row.innerHTML = `<span class="row-icon">${f.emoji}</span><span class="row-title">${escapeHtml(f.name)}</span><span class="row-chevron">›</span>`;
    row.onclick = () => {
      currentFolderId = f.id;
      renderBrowser();
    };

    const renameBtn = document.createElement("button");
    renameBtn.className = "row-action";
    renameBtn.textContent = "✏️";
    renameBtn.title = "이름 바꾸기";
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      const newName = prompt("새 폴더 이름", f.name);
      if (newName && newName.trim() && newName.trim() !== f.name) {
        renameFolder(f.id, newName.trim());
        renderBrowser();
      }
    };
    row.appendChild(renameBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "row-action";
    delBtn.textContent = "🗑";
    delBtn.title = "삭제";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      confirmDeleteFolder(f);
    };
    row.appendChild(delBtn);
    list.appendChild(row);
  });

  docs.forEach((d) => {
    const row = document.createElement("div");
    row.className = "row-item doc-item";
    const preview = (d.content || "").slice(0, 40).replace(/\n/g, " ");
    row.innerHTML = `<span class="row-icon">📄</span><span class="row-title">${escapeHtml(d.title)}<span class="row-preview">${escapeHtml(preview)}</span></span>`;
    row.onclick = () => openReadView(d);
    const delBtn = document.createElement("button");
    delBtn.className = "row-action";
    delBtn.textContent = "🗑";
    delBtn.title = "삭제";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`"${d.title}" 삭제할까요?`)) {
        deleteDocument(d.id);
        renderBrowser();
      }
    };
    row.appendChild(delBtn);
    list.appendChild(row);
  });

  el("btn-add-document").style.display = currentFolderId ? "inline-flex" : "none";
}

function confirmDeleteFolder(f) {
  if (confirm(`"${f.name}" 폴더와 그 안의 모든 하위 폴더/자료를 삭제할까요?`)) {
    deleteFolderCascade(f.id);
    renderBrowser();
  }
}

function openNewFolderDialog() {
  const name = prompt("새 폴더 이름 (예: 회사별 정리, 자기소개서)");
  if (!name || !name.trim()) return;
  const emojiChoices = ["📁", "💼", "📄", "🏢", "🎯", "📚", "💻", "✍️"];
  const emoji = emojiChoices[Math.floor(Math.random() * emojiChoices.length)];
  addFolder(name.trim(), emoji, currentFolderId);
  renderBrowser();
}

// ── 읽기 화면 (기본 진입점 — 편하게 읽기 위해 편집과 분리) ───────────────────
let readingDocId = null;

function getFontSize() {
  return parseInt(localStorage.getItem(FONT_SIZE_KEY) || "17", 10);
}
function setFontSize(px) {
  const clamped = Math.max(13, Math.min(28, px));
  localStorage.setItem(FONT_SIZE_KEY, String(clamped));
  el("read-content").style.fontSize = clamped + "px";
}

function openReadView(doc) {
  readingDocId = doc.id;
  el("read-title").textContent = doc.title;
  el("read-content").textContent = doc.content || "";
  setFontSize(getFontSize());
  el("screen-read").style.display = "flex";
}
function closeReadView() {
  el("screen-read").style.display = "none";
  readingDocId = null;
}

// ── 편집 화면 ─────────────────────────────────────────────────────────────
let editingDocId = null;

function openEditor(doc) {
  editingDocId = doc ? doc.id : null;
  el("editor-title-input").value = doc ? doc.title : "";
  el("editor-content-input").value = doc ? doc.content : "";
  el("editor-heading").textContent = doc ? "자료 편집" : "새 자료";
  el("modal-editor").style.display = "flex";
  el("editor-title-input").focus();
}
function closeEditor() {
  el("modal-editor").style.display = "none";
  editingDocId = null;
}
function saveEditor() {
  const title = el("editor-title-input").value.trim();
  const content = el("editor-content-input").value;
  if (!title) {
    el("editor-title-input").focus();
    return;
  }
  if (editingDocId) {
    updateDocument(editingDocId, title, content);
  } else {
    addDocument(currentFolderId, title, content);
  }
  const wasReading = readingDocId === editingDocId;
  closeEditor();
  renderBrowser();
  if (wasReading) {
    const updated = data.documents.find((d) => d.id === editingDocId);
    if (updated) openReadView(updated);
  }
}

// ── 내보내기/가져오기 (서버 응답 안 될 때의 백업 수단으로도 유지) ─────────────
function exportJson() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `library_notes_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.folders || !parsed.documents) throw new Error("형식이 올바르지 않습니다.");
      if (!confirm("현재 데이터를 불러온 파일 내용으로 덮어씁니다. 계속할까요?")) return;
      data = parsed;
      save();
      currentFolderId = null;
      renderBrowser();
    } catch (e) {
      alert("불러오기 실패: " + e.message);
    }
  };
  reader.readAsText(file);
}

// ── 로그인/로그아웃 ───────────────────────────────────────────────────────
function showApp() {
  el("screen-login").style.display = "none";
  el("screen-app").style.display = "block";
  el("account-badge").textContent = `👤 ${session.username}`;
  renderBrowser();
}

async function handleLoginSubmit() {
  const username = el("login-username-input").value;
  const pin = el("login-pin-input").value;
  el("login-status").textContent = "";
  try {
    const result = await login(username.trim().toLowerCase(), pin);
    session = { username: username.trim().toLowerCase(), pin };
    data = result.data;
    localStorage.setItem(LAST_USERNAME_KEY, session.username);
    showApp();
    if (result.isNew) {
      el("sync-status").textContent = "✅ 새 계정이 만들어졌습니다 — 이 유저명+PIN을 기억해두세요.";
    }
  } catch (e) {
    el("login-status").textContent = `❌ ${e.message}`;
  }
}

function logout() {
  session = null;
  data = { folders: [], documents: [] };
  currentFolderId = null;
  el("login-pin-input").value = "";
  el("screen-app").style.display = "none";
  el("screen-login").style.display = "flex";
}

document.addEventListener("DOMContentLoaded", () => {
  const lastUsername = localStorage.getItem(LAST_USERNAME_KEY);
  if (lastUsername) el("login-username-input").value = lastUsername;
  if (!isServerReady()) {
    el("login-status").textContent = "🚧 서버 준비 중입니다 — 조금 있다가 다시 시도해주세요.";
  }

  el("btn-login").onclick = handleLoginSubmit;
  el("login-pin-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLoginSubmit();
  });
  el("btn-logout").onclick = () => {
    if (confirm("로그아웃할까요? (데이터는 서버에 저장되어 있어 다시 로그인하면 그대로 보입니다)")) logout();
  };

  el("btn-add-folder").onclick = openNewFolderDialog;
  el("btn-add-document").onclick = () => openEditor(null);
  el("btn-editor-save").onclick = saveEditor;
  el("btn-editor-cancel").onclick = closeEditor;
  el("btn-export").onclick = exportJson;
  el("btn-import").onclick = () => el("import-file-input").click();
  el("import-file-input").onchange = (e) => {
    if (e.target.files && e.target.files[0]) importJsonFile(e.target.files[0]);
    e.target.value = "";
  };

  el("btn-read-close").onclick = closeReadView;
  el("btn-read-edit").onclick = () => {
    const doc = data.documents.find((d) => d.id === readingDocId);
    if (doc) openEditor(doc);
  };
  el("btn-font-smaller").onclick = () => setFontSize(getFontSize() - 2);
  el("btn-font-bigger").onclick = () => setFontSize(getFontSize() + 2);
});
