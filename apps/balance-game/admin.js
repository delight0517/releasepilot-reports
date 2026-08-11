// 관리자 리포트 화면 — 수집기(worker/)에서 원본 응답을 받아와 사람이 읽기 좋은
// 리스트로 보여주고, Markdown/JSON 파일로 다운로드한다. 여기서 AI를 부르지 않는다 —
// 해석/분석은 이 파일을 그대로 Claude Code 세션에 붙여넣거나 넘겨서 그 자리에서
// 직접 읽고 진행하는 방식(추가 API 비용 없음)을 전제로 한다.

const ADMIN_URL_KEY = "balanceArtRef_collectorUrl";
const el = (id) => document.getElementById(id);

let lastResponses = [];

function questionTextFor(modeKey, questionId) {
  const mode = MODES[modeKey];
  if (!mode) return questionId;
  for (const round of mode.rounds) {
    for (const q of round.questions) {
      if (q.id === questionId) return q.text;
    }
  }
  return questionId;
}

function answerLabelFor(modeKey, questionId, picked) {
  const mode = MODES[modeKey];
  if (!mode) return picked;
  for (const round of mode.rounds) {
    for (const q of round.questions) {
      if (q.id !== questionId) continue;
      if (q.type === "ab") {
        if (picked === "BOTH") return `A+B 둘 다 (${q.a} / ${q.b})`;
        return picked === "A" ? q.a : q.b;
      }
      const choice = q.choices.find((c) => c.key === picked);
      return choice ? choice.label : picked;
    }
  }
  return picked;
}

function readableAnswers(modeKey, answers) {
  return Object.entries(answers)
    .map(([qid, picked]) => `- ${questionTextFor(modeKey, qid)}: ${answerLabelFor(modeKey, qid, picked)}`)
    .join("\n");
}

async function fetchResponses() {
  const collectorUrl = el("admin-collector-url").value.trim().replace(/\/$/, "");
  const key = el("admin-key").value.trim();
  const mode = el("admin-mode").value;
  if (!collectorUrl || !key) {
    el("admin-status").textContent = "Worker URL과 관리자 키를 입력해주세요.";
    return;
  }
  el("admin-status").textContent = "불러오는 중...";
  try {
    const url = new URL(`${collectorUrl}/api/responses`);
    url.searchParams.set("key", key);
    if (mode) url.searchParams.set("mode", mode);
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `불러오기 실패 (${res.status})`);
    }
    const body = await res.json();
    lastResponses = body.responses || [];
    lastResponses.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    el("admin-status").textContent = `${lastResponses.length}개 응답을 불러왔습니다.`;
    renderList();
  } catch (e) {
    el("admin-status").textContent = `❌ ${e.message}`;
  }
}

function renderList() {
  const wrap = el("admin-list");
  wrap.innerHTML = "";
  lastResponses.forEach((r) => {
    const card = document.createElement("div");
    card.className = "ref-card";
    const modeLabel = MODES[r.mode] ? MODES[r.mode].label : r.mode;
    card.innerHTML = `
      <h3>${escapeHtml(r.nickname)} <span class="hint">· ${modeLabel} · ${escapeHtml(r.submittedAt)}</span></h3>
      <pre class="answers-pre">${escapeHtml(readableAnswers(r.mode, r.answers))}</pre>
    `;
    wrap.appendChild(card);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = String(s);
  return div.innerHTML;
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildMarkdownReport() {
  const now = new Date().toISOString();
  const lines = [`# 밸런스 게임 응답 리포트`, ``, `생성 시각: ${now}`, `응답 수: ${lastResponses.length}`, ``];
  lastResponses.forEach((r, i) => {
    const modeLabel = MODES[r.mode] ? MODES[r.mode].label : r.mode;
    lines.push(`## ${i + 1}. ${r.nickname} (${modeLabel})`);
    lines.push(`- 제출 시각: ${r.submittedAt}`);
    lines.push(`- 답 요약(shorthand): ${r.shorthand || "-"}`);
    lines.push(``);
    lines.push(readableAnswers(r.mode, r.answers));
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  });
  return lines.join("\n");
}

document.addEventListener("DOMContentLoaded", () => {
  el("admin-collector-url").value = localStorage.getItem(ADMIN_URL_KEY) || "";
  el("btn-fetch").onclick = fetchResponses;
  el("btn-download-md").onclick = () => {
    if (!lastResponses.length) {
      el("admin-status").textContent = "먼저 '불러오기'로 응답을 가져와주세요.";
      return;
    }
    downloadFile(`balance_game_report_${Date.now()}.md`, buildMarkdownReport(), "text/markdown;charset=utf-8");
  };
  el("btn-download-json").onclick = () => {
    if (!lastResponses.length) {
      el("admin-status").textContent = "먼저 '불러오기'로 응답을 가져와주세요.";
      return;
    }
    downloadFile(`balance_game_responses_${Date.now()}.json`, JSON.stringify(lastResponses, null, 2), "application/json;charset=utf-8");
  };
});
