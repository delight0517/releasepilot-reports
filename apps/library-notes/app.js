// 자료실 — 노션처럼 폴더 안에 폴더를 넣을 수 있는 자료 정리 웹앱.
// 2026-08-13: 서버(Cloudflare Worker) 계정 시스템을 걷어내고, 서버 없는 멀티유저
// 방식으로 전환했다 — GitHub Pages 정적 사이트라는 조건에서, "닉네임"을 그냥
// 구분용 로컬 식별자로 쓰고 데이터는 브라우저 localStorage에 유저명별로 저장한다.
// 비밀번호/PIN 없음 (서버가 없으니 강제할 수도 없고, 사용자가 번거로운 걸 원치 않음).
// 최초 방문에만 닉네임을 묻고, 이후 방문부터는 저장된 닉네임으로 자동 진입한다.
// 기기 간 동기화는 "GitHub에 백업" 버튼으로 유저명.json을 내려받아 이 저장소의
// apps/library-notes/data/ 아래 수동으로 올려두는 방식(정적 사이트라 클라이언트에서
// 직접 GitHub에 쓸 수 없음 — 쓰기 토큰을 클라이언트에 두는 건 보안상 금지).

const CURRENT_USERNAME_KEY = "libraryNotesWeb_username_v1"; // 현재 이 브라우저에서 쓰는 닉네임
const DATA_KEY_PREFIX = "libraryNotesWeb_data_"; // + username → 그 유저의 {folders, documents}
const FONT_SIZE_KEY = "libraryNotesWeb_readFontSize_v1";

let data = { folders: [], documents: [] };
let currentFolderId = null; // null = 최상위
let username = null; // 현재 로컬 "로그인" 유저명 — 인증 아님, 그냥 구분용
let saveTimer = null;

const el = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function dataKey(name) {
  return DATA_KEY_PREFIX + name;
}

// ── 데이터 로드/저장 (localStorage, 유저명별) ───────────────────────────────
function loadLocalData(name) {
  const raw = localStorage.getItem(dataKey(name));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.folders) && Array.isArray(parsed.documents)) return parsed;
  } catch (e) {
    /* 무시하고 아래에서 null 취급 */
  }
  return null;
}

function persistLocal() {
  localStorage.setItem(dataKey(username), JSON.stringify(data));
  el("sync-status").textContent = `✅ 저장됨 (${new Date().toLocaleTimeString()})`;
}

// 저장 호출을 짧게 묶어서(연타 방지) 저장을 줄인다.
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  el("sync-status").textContent = "저장 중...";
  saveTimer = setTimeout(persistLocal, 400);
}

// GitHub JSON 시드: 이 유저명으로 로컬에 저장된 데이터가 아직 없을 때만, 정적 파일
// apps/library-notes/data/<username>.json 을 시도해본다. 대부분의 유저명은 이 파일이
// 없으므로 404는 조용히 무시하고 빈 데이터로 시작한다.
async function tryLoadSeed(name) {
  try {
    const res = await fetch(`./data/${encodeURIComponent(name)}.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = await res.json();
    if (parsed && Array.isArray(parsed.folders) && Array.isArray(parsed.documents)) return parsed;
  } catch (e) {
    /* 네트워크 오류 등도 조용히 무시 — 시드는 있으면 좋고 없어도 그만 */
  }
  return null;
}

async function loadDataForUser(name) {
  const local = loadLocalData(name);
  if (local) return local;
  const seed = await tryLoadSeed(name);
  if (seed) {
    localStorage.setItem(dataKey(name), JSON.stringify(seed));
    return seed;
  }
  return { folders: [], documents: [] };
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

function breadcrumbPath(folderId) {
  const path = [];
  let f = folderById(folderId !== undefined ? folderId : currentFolderId);
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
    exitSearch();
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
      exitSearch();
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

// ── 전체 검색 ─────────────────────────────────────────────────────────────
let searchDebounceTimer = null;

function folderPathLabel(folderId) {
  const path = breadcrumbPath(folderId);
  if (!path.length) return "🗂️ 자료실";
  return "🗂️ 자료실 › " + path.map((f) => `${f.emoji} ${f.name}`).join(" › ");
}

function buildSnippet(text, keywords) {
  const t = text || "";
  if (!t) return "";
  const lower = t.toLowerCase();
  let idx = -1;
  for (const kw of keywords) {
    const i = lower.indexOf(kw);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  const windowSize = 55;
  let start, end;
  if (idx === -1) {
    start = 0;
    end = Math.min(t.length, windowSize);
  } else {
    start = Math.max(0, idx - 20);
    end = Math.min(t.length, start + windowSize);
    start = Math.max(0, end - windowSize);
  }
  let snippet = t.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = "…" + snippet;
  if (end < t.length) snippet = snippet + "…";
  return snippet;
}

function runSearch(query) {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];

  if (keywords.length) {
    data.folders.forEach((f) => {
      const hay = f.name.toLowerCase();
      if (keywords.every((kw) => hay.includes(kw))) {
        results.push({ type: "folder", folder: f });
      }
    });
    data.documents.forEach((d) => {
      const folder = folderById(d.folderId);
      const hay = `${d.title}\n${d.content || ""}\n${folder ? folder.name : ""}`.toLowerCase();
      if (keywords.every((kw) => hay.includes(kw))) {
        const snippetSource = `${d.title}\n${d.content || ""}`;
        results.push({ type: "doc", doc: d, snippet: buildSnippet(snippetSource, keywords) });
      }
    });
  }

  renderSearchResults(results, keywords.length > 0);
}

function renderSearchResults(results, active) {
  const box = el("search-results");
  const browser = el("browser-list");
  if (!active) {
    box.style.display = "none";
    browser.style.display = "flex";
    return;
  }
  box.style.display = "flex";
  browser.style.display = "none";
  box.innerHTML = "";

  if (!results.length) {
    box.innerHTML = '<p class="empty-hint">검색 결과가 없습니다.</p>';
    return;
  }

  results.forEach((r) => {
    const row = document.createElement("div");
    row.className = "row-item";
    if (r.type === "folder") {
      row.innerHTML = `<span class="row-icon">${r.folder.emoji}</span><span class="row-title">${escapeHtml(r.folder.name)}<span class="search-result-path">${escapeHtml(folderPathLabel(r.folder.parentId))}</span></span><span class="row-chevron">›</span>`;
      row.onclick = () => {
        currentFolderId = r.folder.id;
        exitSearch();
        renderBrowser();
      };
    } else {
      row.innerHTML = `<span class="row-icon">📄</span><span class="row-title">${escapeHtml(r.doc.title)}<span class="search-result-snippet">${escapeHtml(r.snippet)}</span><span class="search-result-path">${escapeHtml(folderPathLabel(r.doc.folderId))}</span></span>`;
      row.onclick = () => {
        currentFolderId = r.doc.folderId;
        exitSearch();
        openReadView(r.doc);
      };
    }
    box.appendChild(row);
  });
}

function exitSearch() {
  el("search-input").value = "";
  renderSearchResults([], false);
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

// ── 내보내기/가져오기/GitHub 백업 ────────────────────────────────────────
function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  downloadJson(data, `library_notes_${Date.now()}.json`);
}

function githubBackup() {
  downloadJson(data, `${username}.json`);
  const hint = el("github-backup-hint");
  hint.textContent = `다운로드한 파일을 apps/library-notes/data/${username}.json 에 올려두면 다른 기기/브라우저에서도 이 이름으로 시작할 때 불러올 수 있어요.`;
  hint.style.display = "block";
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

// ── 닉네임(자동 로그인) ───────────────────────────────────────────────────
async function enterApp(name) {
  username = name;
  data = await loadDataForUser(name);
  currentFolderId = null;
  el("username-label").textContent = username;
  el("screen-nickname").style.display = "none";
  el("screen-app").style.display = "block";
  el("account-badge").textContent = `👤 ${username}`;
  el("github-backup-hint").style.display = "none";
  renderBrowser();
}

async function handleNicknameSubmit() {
  const name = el("nickname-input").value.trim();
  if (!name) {
    el("nickname-status").textContent = "❌ 이름을 입력해주세요.";
    return;
  }
  el("nickname-status").textContent = "";
  localStorage.setItem(CURRENT_USERNAME_KEY, name);
  await enterApp(name);
}

// "닉네임 바꾸기" — 현재 브라우저의 "누구로 시작할지" 포인터만 지운다.
// 그 유저명 아래 저장된 데이터(libraryNotesWeb_data_<name>)는 그대로 남아있어서,
// 나중에 같은 이름으로 다시 시작하면 그 데이터가 그대로 복원된다.
function changeNickname() {
  if (!confirm("다른 이름으로 시작할까요? (지금 이름의 자료는 이 브라우저에 그대로 남아있고, 나중에 같은 이름으로 돌아오면 다시 보입니다)")) return;
  localStorage.removeItem(CURRENT_USERNAME_KEY);
  username = null;
  data = { folders: [], documents: [] };
  currentFolderId = null;
  el("nickname-input").value = "";
  el("nickname-status").textContent = "";
  el("screen-app").style.display = "none";
  el("screen-nickname").style.display = "flex";
}

document.addEventListener("DOMContentLoaded", async () => {
  el("btn-nickname-start").onclick = handleNicknameSubmit;
  el("nickname-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleNicknameSubmit();
  });
  el("btn-change-nickname").onclick = changeNickname;

  el("btn-add-folder").onclick = openNewFolderDialog;
  el("btn-add-document").onclick = () => openEditor(null);
  el("btn-editor-save").onclick = saveEditor;
  el("btn-editor-cancel").onclick = closeEditor;
  el("btn-export").onclick = exportJson;
  el("btn-github-backup").onclick = githubBackup;
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

  el("search-input").addEventListener("input", (e) => {
    const q = e.target.value;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => runSearch(q), 180);
  });

  const savedUsername = localStorage.getItem(CURRENT_USERNAME_KEY);
  if (savedUsername) {
    await enterApp(savedUsername);
  } else {
    el("screen-nickname").style.display = "flex";
  }
});
