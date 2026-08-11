// 자료실 — 노션처럼 폴더 안에 폴더를 넣을 수 있는 개인 자료 정리 웹앱.
// 41_ox_quiz_app의 LibraryFolder/LibraryDocument 모델을 그대로 따르되(id/name/emoji/
// parentId, id/folderId/title/content), 여기서는 계정/서버 없이 브라우저 localStorage
// 에만 저장한다 — ox-quiz 체험판과 같은 원칙("이 기기에만 저장되는 체험판"). 다른
// 기기로 옮기고 싶으면 내보내기(.json)로 받아서 다른 기기에서 불러오기 하면 된다.

const STORAGE_KEY = "libraryNotesWeb_data_v1";

let data = { folders: [], documents: [] };
let currentFolderId = null; // null = 최상위

const el = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (e) {
      data = { folders: [], documents: [] };
    }
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

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
    row.oncontextmenu = (e) => {
      e.preventDefault();
      confirmDeleteFolder(f);
    };
    const delBtn = document.createElement("button");
    delBtn.className = "row-delete";
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
    row.onclick = () => openEditor(d);
    const delBtn = document.createElement("button");
    delBtn.className = "row-delete";
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
  closeEditor();
  renderBrowser();
}

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

document.addEventListener("DOMContentLoaded", () => {
  load();
  renderBrowser();

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
});
