// 밸런스 게임 → 레퍼런스/경로 추천 엔진. 모드(아트 레퍼런스 / 커리어 경로)별로
// 질문 세트(questions.js)와 결과 프롬프트/렌더링만 다르고, A/B/둘다/다지선다 진행
// 흐름과 캐싱 로직은 공유한다.
//
// API 절약 원칙: 같은 모드 + 같은 답 조합이면 다시 API를 부르지 않는다 — 정렬된
// 답 조합 문자열을 그대로 localStorage 캐시 키로 쓴다. API 키는 사용자 본인 것을
// 설정 화면에 입력 — localStorage에만 저장되고 이 기기를 벗어나지 않는다(서버 없음).

const API_KEY_STORAGE_KEY = "balanceArtRef_apiKey";
const COLLECTOR_URL_STORAGE_KEY = "balanceArtRef_collectorUrl";
const NICKNAME_STORAGE_KEY = "balanceArtRef_nickname";
const CACHE_PREFIX = "balanceArtRef_cache_";
const MODEL = "claude-sonnet-5";

let currentMode = null;
let flatQuestions = [];
let currentIndex = 0;
const answers = {}; // id -> "A" | "B" | "BOTH" (ab) or "A".."H" (choice)

const el = (id) => document.getElementById(id);

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}
function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
}

function getCollectorUrl() {
  return (localStorage.getItem(COLLECTOR_URL_STORAGE_KEY) || "").replace(/\/$/, "");
}
function setCollectorUrl(url) {
  localStorage.setItem(COLLECTOR_URL_STORAGE_KEY, url.trim());
}

function getNickname() {
  return localStorage.getItem(NICKNAME_STORAGE_KEY) || "";
}
function setNickname(name) {
  localStorage.setItem(NICKNAME_STORAGE_KEY, name.trim());
}

function cacheKeyFor(mode, profile) {
  const sorted = Object.keys(profile)
    .sort()
    .map((k) => `${k}=${profile[k]}`)
    .join("&");
  return CACHE_PREFIX + mode + "_" + sorted;
}
function readCache(mode, profile) {
  const raw = localStorage.getItem(cacheKeyFor(mode, profile));
  return raw ? JSON.parse(raw) : null;
}
function writeCache(mode, profile, result) {
  localStorage.setItem(cacheKeyFor(mode, profile), JSON.stringify(result));
}

function renderSettings() {
  el("api-key-input").value = getApiKey();
  el("collector-url-input").value = getCollectorUrl();
}

function showScreen(name) {
  ["screen-start", "screen-question", "screen-finish", "screen-result", "screen-settings"].forEach((s) => {
    el(s).style.display = s === `screen-${name}` ? "block" : "none";
  });
}

function renderModeList() {
  const wrap = el("mode-list");
  wrap.innerHTML = "";
  Object.values(MODES).forEach((mode) => {
    const card = document.createElement("button");
    card.className = "mode-card";
    card.innerHTML = `<h3>${mode.label}</h3><p>${mode.description}</p>`;
    card.onclick = () => startGame(mode.key);
    wrap.appendChild(card);
  });
}

function startGame(modeKey) {
  const nickname = el("nickname-input").value.trim();
  if (!nickname) {
    el("nickname-input").focus();
    return;
  }
  setNickname(nickname);
  currentMode = MODES[modeKey];
  flatQuestions = [];
  currentMode.rounds.forEach((round) => flatQuestions.push(...round.questions));
  currentIndex = 0;
  Object.keys(answers).forEach((k) => delete answers[k]);
  showScreen("question");
  renderQuestion();
}

function roundTitleFor(index) {
  let count = 0;
  for (const round of currentMode.rounds) {
    if (index < count + round.questions.length) return round.title;
    count += round.questions.length;
  }
  return "";
}

function renderQuestion() {
  if (currentIndex >= flatQuestions.length) {
    showScreen("finish");
    el("submit-status").textContent = "";
    return;
  }
  const q = flatQuestions[currentIndex];
  el("round-title").textContent = roundTitleFor(currentIndex);
  el("progress").textContent = `${currentIndex + 1} / ${flatQuestions.length}`;
  el("question-text").textContent = q.text;

  const abBox = el("ab-box");
  const choiceBox = el("choice-box");
  if (q.type === "ab") {
    abBox.style.display = "block";
    choiceBox.style.display = "none";
    el("choice-a").textContent = "A. " + q.a;
    el("choice-b").textContent = "B. " + q.b;
  } else {
    abBox.style.display = "none";
    choiceBox.style.display = "block";
    choiceBox.innerHTML = "";
    q.choices.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn multi-btn";
      btn.textContent = `${c.key}. ${c.label}`;
      btn.onclick = () => answerCurrent(c.key);
      choiceBox.appendChild(btn);
    });
  }
}

function answerCurrent(choice) {
  const q = flatQuestions[currentIndex];
  answers[q.id] = choice;
  currentIndex += 1;
  renderQuestion();
}

function profileToKoreanSummary() {
  const lines = [];
  for (const round of currentMode.rounds) {
    for (const q of round.questions) {
      const picked = answers[q.id];
      if (!picked) continue;
      if (q.type === "ab") {
        const label = picked === "BOTH" ? `A(${q.a}) + B(${q.b}) 둘 다` : picked === "A" ? q.a : q.b;
        lines.push(`- ${q.text}: ${label}`);
      } else {
        const choice = q.choices.find((c) => c.key === picked);
        lines.push(`- ${q.text}: ${choice ? choice.label : picked}`);
      }
    }
  }
  return lines.join("\n");
}

function shorthandSummary() {
  // "1A 2B 3AB 4A ..." 형식 — 사용자가 준 예시 표기 그대로.
  return flatQuestions
    .map((q, i) => {
      const picked = answers[q.id];
      if (!picked) return null;
      return `${i + 1}${picked}`;
    })
    .filter(Boolean)
    .join(" ");
}

function buildPrompt() {
  const summary = profileToKoreanSummary();
  const shorthand = shorthandSummary();

  if (currentMode.key === "art") {
    return `아래는 사용자가 밸런스 게임(A/B 양자택일)으로 답한 비주얼/세계관 취향 프로필이야.

${summary}

(답 요약: ${shorthand})

이 취향을 바탕으로, 사용자가 "모작(그림 연습용 레퍼런스)"으로 참고하기 좋은 실제 게임/애니메이션/영화/웹툰 작품을 5개 추천해줘.
각 작품마다:
1. 작품명
2. 왜 이 취향과 맞는지 (2문장 이내, 위 프로필의 구체적 항목을 근거로 들어)
3. 그 작품에서 특히 참고하면 좋을 구체적인 장면/컷/아트워크 설명 (실제로 존재하는 장면 기준, 지어내지 말 것)

마지막에 "지금 바로 모작해볼 장면 3개"를 위 추천작들 중에서 골라 한 번 더 구체적으로 짚어줘.

반드시 아래 JSON 형식으로만 답해 (마크다운 코드블록 없이 순수 JSON):
{
  "references": [
    {"title": "...", "reason": "...", "scene": "..."}
  ],
  "firstThreeToStudy": ["...", "...", "..."]
}`;
  }

  // career mode
  return `아래는 사용자가 밸런스 게임(A/B 양자택일 + 다지선다)으로 답한, "직업명이 아니라 몇 년씩
반복할 수 있는 행동" 기준의 커리어 취향 프로필이야.

${summary}

(답 요약: ${shorthand})

이 답을 바탕으로 직업 이름을 나열하지 말고, 본업/부업/개인활동을 하나의 인생 구조로 조합해줘.
예시 형식: "회사 콘텐츠 PD + 월 1회 인터뷰 콘텐츠 + 행사 MC 단기 일거리 + 장기 웹툰 IP 제작" 같은 식.

반드시 아래 JSON 형식으로만 답해 (마크다운 코드블록 없이 순수 JSON):
{
  "lifeStructures": [
    {"combo": "본업 + 부업 + 개인활동을 이어붙인 한 문장 조합", "why": "이 사용자 답변 중 무엇을 근거로 이 조합을 골랐는지"}
  ],
  "mainJobCandidates": [
    {"title": "본업 후보", "reason": "왜 맞는지"}
  ],
  "sideJobCandidates": [
    {"title": "부업 후보", "reason": "왜 맞는지"}
  ],
  "personalActivityCandidates": [
    {"title": "개인활동 후보 (돈과 무관하게 계속할 만한 것)", "reason": "왜 맞는지"}
  ],
  "realGigExamples": [
    {"title": "실제로 존재하는, 지금 당장 시도해볼 수 있는 돈 되는 일거리 예시", "detail": "어디서/어떻게 구할 수 있는지 구체적으로"}
  ],
  "firstThreeMonthExperiments": ["처음 3개월 안에 해볼 구체적 실험 1", "실험 2", "실험 3"]
}
lifeStructures는 2~3개, 나머지 후보 리스트는 각 3~4개 정도로.`;
}

async function generateResult(forceRefresh) {
  const profile = { ...answers };
  showScreen("result");
  el("result-loading").style.display = "block";
  el("result-content").innerHTML = "";
  el("result-cache-badge").style.display = "none";

  if (forceRefresh === true) {
    localStorage.removeItem(cacheKeyFor(currentMode.key, profile));
  }

  const cached = forceRefresh === true ? null : readCache(currentMode.key, profile);
  if (cached) {
    el("result-loading").style.display = "none";
    el("result-cache-badge").style.display = "inline-block";
    renderResult(cached);
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    el("result-loading").style.display = "none";
    el("result-content").innerHTML =
      '<p class="error">API 키가 설정되지 않았습니다. 오른쪽 위 ⚙️ 설정에서 본인의 Claude API 키를 입력해주세요.</p>';
    return;
  }

  const prompt = buildPrompt();

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`API 오류 (${res.status}): ${errBody}`);
    }
    const data = await res.json();
    const text = data.content.map((block) => block.text || "").join("");
    const parsed = JSON.parse(text);
    writeCache(currentMode.key, profile, parsed);
    el("result-loading").style.display = "none";
    renderResult(parsed);
  } catch (e) {
    el("result-loading").style.display = "none";
    el("result-content").innerHTML = `<p class="error">생성 실패: ${escapeHtml(e.message)}</p>`;
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderResult(result) {
  const wrap = el("result-content");
  wrap.innerHTML = "";

  if (currentMode.key === "art") {
    const list = document.createElement("div");
    (result.references || []).forEach((ref) => {
      const card = document.createElement("div");
      card.className = "ref-card";
      card.innerHTML = `
        <h3>${escapeHtml(ref.title)}</h3>
        <p class="reason">${escapeHtml(ref.reason)}</p>
        <p class="scene"><strong>참고 장면:</strong> ${escapeHtml(ref.scene)}</p>
      `;
      list.appendChild(card);
    });
    wrap.appendChild(list);

    if (result.firstThreeToStudy && result.firstThreeToStudy.length) {
      const box = document.createElement("div");
      box.className = "first-three";
      box.innerHTML =
        "<h3>🎯 지금 바로 모작해볼 장면 3개</h3><ol>" +
        result.firstThreeToStudy.map((s) => `<li>${escapeHtml(s)}</li>`).join("") +
        "</ol>";
      wrap.appendChild(box);
    }
    return;
  }

  // career mode
  const section = (title, items, renderItem) => {
    if (!items || !items.length) return;
    const box = document.createElement("div");
    box.className = "career-section";
    box.innerHTML = `<h3>${title}</h3>`;
    const inner = document.createElement("div");
    items.forEach((item) => inner.appendChild(renderItem(item)));
    box.appendChild(inner);
    wrap.appendChild(box);
  };

  section("🧩 인생 구조 조합", result.lifeStructures, (item) => {
    const d = document.createElement("div");
    d.className = "ref-card";
    d.innerHTML = `<h4>${escapeHtml(item.combo)}</h4><p class="reason">${escapeHtml(item.why)}</p>`;
    return d;
  });
  section("① 본업 후보", result.mainJobCandidates, (item) => {
    const d = document.createElement("div");
    d.className = "ref-card small";
    d.innerHTML = `<h4>${escapeHtml(item.title)}</h4><p class="reason">${escapeHtml(item.reason)}</p>`;
    return d;
  });
  section("② 부업 후보", result.sideJobCandidates, (item) => {
    const d = document.createElement("div");
    d.className = "ref-card small";
    d.innerHTML = `<h4>${escapeHtml(item.title)}</h4><p class="reason">${escapeHtml(item.reason)}</p>`;
    return d;
  });
  section("③ 개인활동 후보", result.personalActivityCandidates, (item) => {
    const d = document.createElement("div");
    d.className = "ref-card small";
    d.innerHTML = `<h4>${escapeHtml(item.title)}</h4><p class="reason">${escapeHtml(item.reason)}</p>`;
    return d;
  });
  section("④ 실제 돈이 발생하는 일거리 예시", result.realGigExamples, (item) => {
    const d = document.createElement("div");
    d.className = "ref-card small";
    d.innerHTML = `<h4>${escapeHtml(item.title)}</h4><p class="reason">${escapeHtml(item.detail)}</p>`;
    return d;
  });

  if (result.firstThreeMonthExperiments && result.firstThreeMonthExperiments.length) {
    const box = document.createElement("div");
    box.className = "first-three";
    box.innerHTML =
      "<h3>🎯 처음 3개월에 해볼 실험</h3><ol>" +
      result.firstThreeMonthExperiments.map((s) => `<li>${escapeHtml(s)}</li>`).join("") +
      "</ol>";
    wrap.appendChild(box);
  }
}

function clearAllCache() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
  el("settings-status").textContent = `캐시 ${keys.length}개 삭제했습니다.`;
}

async function submitToCollector() {
  const collectorUrl = getCollectorUrl();
  if (!collectorUrl) {
    el("submit-status").textContent = "⚠️ 설정에서 응답 수집 서버 URL을 먼저 등록해주세요.";
    return;
  }
  el("submit-status").textContent = "제출하는 중...";
  try {
    const res = await fetch(`${collectorUrl}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: getNickname(),
        mode: currentMode.key,
        answers: { ...answers },
        shorthand: shorthandSummary(),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `제출 실패 (${res.status})`);
    }
    el("submit-status").textContent = "✅ 제출 완료! 참여해주셔서 감사합니다.";
  } catch (e) {
    el("submit-status").textContent = `❌ ${e.message}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  showScreen("start");
  renderModeList();
  renderSettings();
  el("nickname-input").value = getNickname();

  el("choice-a").onclick = () => answerCurrent("A");
  el("choice-b").onclick = () => answerCurrent("B");
  el("choice-both").onclick = () => answerCurrent("BOTH");
  el("btn-submit-collector").onclick = submitToCollector;
  el("btn-generate-now").onclick = () => generateResult();
  el("btn-settings").onclick = () => {
    renderSettings();
    showScreen("settings");
  };
  el("btn-settings-back").onclick = () => showScreen("start");
  el("btn-save-key").onclick = () => {
    setApiKey(el("api-key-input").value);
    el("settings-status").textContent = "저장했습니다.";
  };
  el("btn-save-collector").onclick = () => {
    setCollectorUrl(el("collector-url-input").value);
    el("collector-status").textContent = "저장했습니다.";
  };
  el("btn-clear-cache").onclick = clearAllCache;
  el("btn-restart").onclick = () => showScreen("start");
  el("btn-retry-generate").onclick = () => generateResult(true);
});
