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

// 실제로 배포된 수집 서버 — 방문자가 ⚙️ 설정에서 직접 Worker URL을 입력할 필요가
// 없도록 기본값으로 박아둔다(2026-08-11 전까지는 빈 값이라 "제출하기"가 아무도
// 모르게 항상 실패했었음 — 이 기본값이 그 버그의 실제 수정이다). 설정 칸은
// 다른 배포본을 테스트하고 싶을 때를 위해 남겨두되, 비워두면 이 기본값을 쓴다.
const DEFAULT_COLLECTOR_URL = "https://balance-game-survey-collector.PLACEHOLDER.workers.dev";

// SNS 모드의 "어디서 실제로 구할 수 있는지"는 AI가 지어내지 않도록 여기 고정
// 텍스트로 박아둔다(2026-08-12) — 개인화는 AI가 촬영 소재/콘텐츠 방향만 맡고,
// "어디서 찾는지"는 실제로 존재하는 채널만 고정으로 보여준다. 특정 채널의
// 수수료·경쟁률 같은 수치 주장은 하지 않는다(확인 안 된 값은 지어내지 않음).
const GIG_SOURCES = [
  { name: "브랜드 공식 크리에이터/앰버서더 모집", detail: "관심 있는 브랜드의 인스타그램·홈페이지에서 \"크리에이터 모집\", \"앰버서더 모집\" 공고를 직접 찾아보기 — 특히 화장품·식품·소품 브랜드가 자주 올림." },
  { name: "알바몬 / 알바천국", detail: "\"SNS 마케터\", \"콘텐츠 제작\", \"인플루언서\" 등으로 검색하면 단기·서포터즈형 촬영·홍보 알바가 올라옴." },
  { name: "크몽 / 숨고", detail: "직접 \"SNS 콘텐츠 제작\", \"인스타그램 릴스 제작\" 같은 서비스를 등록해서 의뢰를 받는 방식(프리랜서형)." },
  { name: "각 플랫폼 크리에이터 프로그램", detail: "유튜브 파트너 프로그램, 인스타그램/틱톡 크리에이터 마켓플레이스 — 팔로워·조회수 기준이 있어 처음엔 바로 안 될 수 있음, 공식 도움말 페이지에서 조건 확인." },
  { name: "지역 카페/스튜디오/소품샵 협업", detail: "동네 카페·소품샵·공방에 직접 \"콘텐츠 촬영 협업\" 제안 — SNS 팔로워가 적어도 상호 무료 촬영·시식 조건으로 시작하는 경우가 많음." },
];

let currentMode = null;
let flatQuestions = [];
let currentIndex = 0;
const answers = {}; // id -> "A" | "B" | "BOTH" (ab) or "A".."H" (choice)

// 동적 2차 질문(dynamicFollowUp) 상태 — 1라운드 끝나면 API로 "분석 + 맞춤 2차 질문"을
// 받아와 flatQuestions 뒤에 이어붙인다. followUpData가 채워지면 "이미 이어붙였다"는
// 뜻이라 완료 판정 때 다시 트리거하지 않는다.
let round1Snapshot = null; // 1라운드 질문 목록 스냅샷 (요약 문구 생성용)
let round1AnswersSnapshot = null;
let followUpData = null; // { analysis, round2Questions }
let lastResult = null; // 결과 복사(export)용 — renderResult가 채운다.

const el = (id) => document.getElementById(id);

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}
function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
}

function getCollectorUrl() {
  const stored = localStorage.getItem(COLLECTOR_URL_STORAGE_KEY);
  return (stored && stored.trim() ? stored : DEFAULT_COLLECTOR_URL).replace(/\/$/, "");
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
  [
    "screen-start",
    "screen-question",
    "screen-followup-loading",
    "screen-analysis",
    "screen-finish",
    "screen-result",
    "screen-settings",
  ].forEach((s) => {
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
  round1Snapshot = null;
  round1AnswersSnapshot = null;
  followUpData = null;
  showScreen("question");
  renderQuestion();
}

function roundTitleFor(index) {
  let count = 0;
  for (const round of currentMode.rounds) {
    if (index < count + round.questions.length) return round.title;
    count += round.questions.length;
  }
  // 정적 라운드를 넘어선 인덱스는 동적으로 이어붙인 맞춤 2차 질문(followUpData)이다.
  if (followUpData) return "ROUND 2 — 맞춤 질문";
  return "";
}

function renderQuestion() {
  if (currentIndex >= flatQuestions.length) {
    if (currentMode.dynamicFollowUp && followUpData === null) {
      round1Snapshot = [...flatQuestions];
      round1AnswersSnapshot = { ...answers };
      runFollowUpFlow();
      return;
    }
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

// questionList/answerMap을 받는 범용 버전 — 1라운드 스냅샷, 1+2라운드 합본 등
// 어떤 질문 목록에 대해서도 같은 방식으로 요약을 만들 수 있도록 일반화했다.
function koreanSummaryFor(questionList, answerMap) {
  const lines = [];
  for (const q of questionList) {
    const picked = answerMap[q.id];
    if (!picked) continue;
    if (q.type === "ab") {
      const label = picked === "BOTH" ? `A(${q.a}) + B(${q.b}) 둘 다` : picked === "A" ? q.a : q.b;
      lines.push(`- ${q.text}: ${label}`);
    } else {
      const choice = q.choices.find((c) => c.key === picked);
      lines.push(`- ${q.text}: ${choice ? choice.label : picked}`);
    }
  }
  return lines.join("\n");
}

function shorthandFor(questionList, answerMap) {
  // "1A 2B 3AB 4A ..." 형식 — 사용자가 준 예시 표기 그대로.
  return questionList
    .map((q, i) => {
      const picked = answerMap[q.id];
      if (!picked) return null;
      return `${i + 1}${picked}`;
    })
    .filter(Boolean)
    .join(" ");
}

function profileToKoreanSummary() {
  return koreanSummaryFor(flatQuestions, answers);
}
function shorthandSummary() {
  return shorthandFor(flatQuestions, answers);
}

function buildFollowUpPrompt() {
  const summary = koreanSummaryFor(round1Snapshot, round1AnswersSnapshot);
  const shorthand = shorthandFor(round1Snapshot, round1AnswersSnapshot);
  return `아래는 사용자가 커리어/콘텐츠 취향 밸런스 게임 1라운드(A/B + 다지선다)에 답한 결과야.

${summary}

(답 요약: ${shorthand})

너는 지금 이 사용자의 게임 상대이자 분석가야. 친근한 반말 톤으로, 답변에서 드러나는
모순이나 특이점을 짚어가며(어떤 문항 번호+답이 근거인지 언급) **3~5문장 이내로 짧고
명확하게** 분석해줘 — 길게 늘어놓지 말고 핵심만. 임시로 붙일 만한 직업/포지션 이름을
하나 제안해줘(실제 인물 사례는 언급하지 말 것, 확인 안 된 비유는 오해를 살 수 있음).

그 다음, 이 분석을 더 구체화하기 위한 "ROUND 2" 질문 10~12개를 만들어줘. 추상적인 성향
질문이 아니라 "내일부터 이 일을 해야 한다"는 구체적 시나리오/선택지로 만들어(급여, 프로젝트,
행사, 5년/10년 후 모습 등). 마지막 1~2문항은 A/B/C 다지선다로 만들어도 좋음(예: 최종 결론
문항에서 "둘 다"를 뜻하는 C 옵션).

반드시 아래 JSON 형식으로만 답해 (마크다운 코드블록 없이 순수 JSON):
{
  "analysis": "...(줄바꿈은 \\n으로)...",
  "round2Questions": [
    {"id": "r2_1", "type": "ab", "text": "1. ...", "a": "...", "b": "..."},
    {"id": "r2_12", "type": "choice", "text": "12. ...", "choices": [{"key":"A","label":"..."},{"key":"B","label":"..."},{"key":"C","label":"..."}]}
  ]
}
id는 r2_1, r2_2 처럼 겹치지 않게 순번으로 붙여줘.`;
}

function buildCareerFinalPrompt() {
  const fullQuestions = [...round1Snapshot, ...(followUpData ? followUpData.round2Questions : [])];
  const summary = koreanSummaryFor(fullQuestions, answers);
  const shorthand = shorthandFor(fullQuestions, answers);
  return `아래는 커리어/콘텐츠 밸런스 게임 1라운드 + 맞춤 2라운드 전체 답변이야.

${summary}

(답 요약: ${shorthand})

1라운드 분석에서 나온 관점: ${followUpData ? followUpData.analysis : "(없음)"}

이 전체 답을 바탕으로, 실제로 시도해볼 수 있는 직업/커리어 조합 3개를 만들어줘. 각 조합은
직업 이름 나열이 아니라, 처음 벌기 시작할 때 → 3년 차 → 자기 작품/IP 제작까지 이어지는
현실적인 경로로 붙여줘. **각 항목은 짧게(1문장 이내)** — 길게 설명하지 말고 핵심만.

반드시 아래 JSON 형식으로만 답해 (마크다운 코드블록 없이 순수 JSON):
{
  "combos": [
    {
      "title": "조합 이름",
      "summary": "1문장 요약",
      "path": [
        {"stage": "처음 시작 (몇 년차인지 명시)", "detail": "1문장 — 무엇을 하는지, 수입원은 어디서"},
        {"stage": "3년 차", "detail": "1문장"},
        {"stage": "자기 작품/IP 제작 단계", "detail": "1문장"}
      ]
    }
  ]
}
combos는 정확히 3개.`;
}

function buildPrompt() {
  if (currentMode.key === "career" && followUpData) {
    return buildCareerFinalPrompt();
  }

  const summary = profileToKoreanSummary();
  const shorthand = shorthandSummary();

  if (currentMode.key === "art") {
    return `아래는 사용자가 밸런스 게임(A/B 양자택일)으로 답한 비주얼/세계관 취향 프로필이야.

${summary}

(답 요약: ${shorthand})

이 취향을 바탕으로, 사용자가 "모작(그림 연습용 레퍼런스)"으로 참고하기 좋은 실제 게임/애니메이션/영화/웹툰 작품을 5개 추천해줘.
각 작품마다:
1. 작품명
2. 왜 이 취향과 맞는지 (**1문장만**, 위 프로필의 구체적 항목을 근거로 들어)
3. 그 작품에서 특히 참고하면 좋을 구체적인 장면/컷/아트워크 설명 (**1문장만**, 실제로 존재하는 장면 기준, 지어내지 말 것)

마지막에 "지금 바로 모작해볼 장면 3개"를 위 추천작들 중에서 골라 짧게 한 번 더 짚어줘.
전체적으로 **길게 설명하지 말고 핵심만 짧게** 써줘.

반드시 아래 JSON 형식으로만 답해 (마크다운 코드블록 없이 순수 JSON):
{
  "references": [
    {"title": "...", "reason": "...", "scene": "..."}
  ],
  "firstThreeToStudy": ["...", "...", "..."]
}`;
  }

  if (currentMode.key === "sns") {
    return `아래는 사용자가 밸런스 게임(A/B 양자택일 + 다지선다)으로 답한 SNS 콘텐츠 취향
프로필이야.

${summary}

(답 요약: ${shorthand})

이 답을 바탕으로 이 사용자에게 맞는 "촬영 소재·콘텐츠 방향"을 짧고 명확하게 제안해줘 —
직업 조언이 아니라 "무엇을 찍으면 좋을지"에 집중해. 어떤 SNS 플랫폼(인스타그램 릴스,
유튜브 쇼츠, 틱톡, 블로그 등)이 이 사람 스타일과 더 맞는지도 한 줄로 짚어줘.
**모든 항목은 1~2문장 이내로 짧게** — 길게 설명하지 말 것. 특정 채널의 수익·팔로워
숫자 같은 통계는 확인 안 된 값을 지어내지 말고 언급하지 마.

반드시 아래 JSON 형식으로만 답해 (마크다운 코드블록 없이 순수 JSON):
{
  "bestPlatform": {"name": "가장 잘 맞는 플랫폼 이름", "why": "1문장"},
  "contentDirections": [
    {"title": "콘텐츠 방향 이름", "why": "1문장 — 어떤 답변이 근거인지", "shootIdeas": ["구체적 촬영 소재 예시 1", "예시 2", "예시 3"]}
  ],
  "oneLineSummary": "이 사람의 콘텐츠 방향을 한 문장으로 요약"
}
contentDirections는 정확히 3개.`;
  }

  // career mode
  return `아래는 사용자가 밸런스 게임(A/B 양자택일 + 다지선다)으로 답한, "직업명이 아니라 몇 년씩
반복할 수 있는 행동" 기준의 커리어 취향 프로필이야.

${summary}

(답 요약: ${shorthand})

이 답을 바탕으로 직업 이름을 나열하지 말고, 본업/부업/개인활동을 하나의 인생 구조로 조합해줘.
예시 형식: "회사 콘텐츠 PD + 월 1회 인터뷰 콘텐츠 + 행사 MC 단기 일거리 + 장기 웹툰 IP 제작" 같은 식.
**모든 reason/detail은 1문장 이내로 짧게** — 길게 설명하지 말 것.

반드시 아래 JSON 형식으로만 답해 (마크다운 코드블록 없이 순수 JSON):
{
  "lifeStructures": [
    {"combo": "본업 + 부업 + 개인활동을 이어붙인 한 문장 조합", "why": "1문장 — 근거"}
  ],
  "mainJobCandidates": [
    {"title": "본업 후보", "reason": "1문장"}
  ],
  "sideJobCandidates": [
    {"title": "부업 후보", "reason": "1문장"}
  ],
  "personalActivityCandidates": [
    {"title": "개인활동 후보 (돈과 무관하게 계속할 만한 것)", "reason": "1문장"}
  ],
  "realGigExamples": [
    {"title": "실제로 존재하는, 지금 당장 시도해볼 수 있는 돈 되는 일거리 예시", "detail": "1문장 — 어디서/어떻게 구하는지"}
  ],
  "firstThreeMonthExperiments": ["처음 3개월 안에 해볼 구체적 실험 1", "실험 2", "실험 3"]
}
lifeStructures는 2~3개, 나머지 후보 리스트는 각 3~4개 정도로.`;
}

async function callClaudeApi(prompt, maxTokens) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("NO_API_KEY");
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
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`API 오류 (${res.status}): ${errBody}`);
  }
  const data = await res.json();
  const text = data.content.map((block) => block.text || "").join("");
  return JSON.parse(text);
}

async function runFollowUpFlow() {
  showScreen("followup-loading");

  const cached = readCache(`${currentMode.key}:round2`, round1AnswersSnapshot);
  if (cached) {
    followUpData = cached;
    showAnalysis(true);
    return;
  }

  if (!getApiKey()) {
    // API 키가 없으면 맞춤 2차 질문을 만들 수 없다 — 그냥 1라운드 결과로 마무리 화면으로.
    showScreen("finish");
    el("submit-status").textContent = "";
    return;
  }

  try {
    const parsed = await callClaudeApi(buildFollowUpPrompt(), 3000);
    writeCache(`${currentMode.key}:round2`, round1AnswersSnapshot, parsed);
    followUpData = parsed;
    showAnalysis(false);
  } catch (e) {
    showScreen("finish");
    el("submit-status").textContent = `⚠️ 2차 질문 생성에 실패해서 1라운드 결과로 진행할게요: ${e.message}`;
  }
}

function showAnalysis(fromCache) {
  el("analysis-cache-badge").style.display = fromCache ? "inline-block" : "none";
  el("analysis-text").textContent = followUpData.analysis || "";
  showScreen("analysis");
}

function continueToFollowUpQuestions() {
  flatQuestions = [...round1Snapshot, ...followUpData.round2Questions];
  showScreen("question");
  renderQuestion();
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

  if (!getApiKey()) {
    el("result-loading").style.display = "none";
    el("result-content").innerHTML =
      '<p class="error">API 키가 설정되지 않았어요. 오른쪽 위 ⚙️ 설정에서 본인의 Claude API 키를 입력해주세요.</p>';
    return;
  }

  try {
    const parsed = await callClaudeApi(buildPrompt(), 2500);
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
  lastResult = result;

  if (currentMode.key === "sns") {
    if (result.oneLineSummary) {
      const box = document.createElement("div");
      box.className = "first-three";
      box.innerHTML = `<h3>📸 한 줄 요약</h3><p>${escapeHtml(result.oneLineSummary)}</p>`;
      wrap.appendChild(box);
    }
    if (result.bestPlatform) {
      const box = document.createElement("div");
      box.className = "ref-card";
      box.innerHTML = `<h3>추천 플랫폼: ${escapeHtml(result.bestPlatform.name || "")}</h3><p class="reason">${escapeHtml(result.bestPlatform.why || "")}</p>`;
      wrap.appendChild(box);
    }
    (result.contentDirections || []).forEach((dir) => {
      const card = document.createElement("div");
      card.className = "ref-card";
      const ideas = (dir.shootIdeas || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
      card.innerHTML = `
        <h3>${escapeHtml(dir.title)}</h3>
        <p class="reason">${escapeHtml(dir.why || "")}</p>
        ${ideas ? `<p><strong>촬영 소재 예시</strong></p><ul>${ideas}</ul>` : ""}
      `;
      wrap.appendChild(card);
    });

    const gigBox = document.createElement("div");
    gigBox.className = "career-section";
    gigBox.innerHTML = `<h3>🔎 관련 알바·협업, 어디서 찾나</h3>`;
    const gigInner = document.createElement("div");
    GIG_SOURCES.forEach((g) => {
      const d = document.createElement("div");
      d.className = "ref-card small";
      d.innerHTML = `<h4>${escapeHtml(g.name)}</h4><p class="reason">${escapeHtml(g.detail)}</p>`;
      gigInner.appendChild(d);
    });
    gigBox.appendChild(gigInner);
    wrap.appendChild(gigBox);
    return;
  }

  if (result.combos) {
    (result.combos || []).forEach((combo) => {
      const card = document.createElement("div");
      card.className = "combo-card";
      const pathHtml = (combo.path || [])
        .map((p) => `<li><strong>${escapeHtml(p.stage)}</strong>${escapeHtml(p.detail)}</li>`)
        .join("");
      card.innerHTML = `
        <h3>${escapeHtml(combo.title)}</h3>
        <p class="summary">${escapeHtml(combo.summary || "")}</p>
        <ol class="combo-path">${pathHtml}</ol>
      `;
      wrap.appendChild(card);
    });
    return;
  }

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

// 결과를 복사하기 좋은 평문(plain text)으로 바꾼다 — 카카오톡/메모장 등
// 어디에 붙여넣어도 그대로 읽히도록 마크다운 없이 줄바꿈+기호만 쓴다
// (2026-08-12 요청 — "자신의 결과표를 복사해서 export할 수 있도록").
function resultToPlainText(result) {
  const nickname = getNickname();
  const lines = [`[${currentMode.label}] ${nickname ? nickname + "님의 결과" : "결과"}`, ""];

  if (currentMode.key === "sns") {
    if (result.oneLineSummary) lines.push("📸 한 줄 요약: " + result.oneLineSummary, "");
    if (result.bestPlatform) lines.push(`추천 플랫폼: ${result.bestPlatform.name} — ${result.bestPlatform.why}`, "");
    (result.contentDirections || []).forEach((d, i) => {
      lines.push(`${i + 1}. ${d.title} — ${d.why}`);
      (d.shootIdeas || []).forEach((s) => lines.push(`   · ${s}`));
      lines.push("");
    });
    lines.push("🔎 관련 알바·협업 찾는 곳:");
    GIG_SOURCES.forEach((g) => lines.push(`- ${g.name}: ${g.detail}`));
  } else if (result.combos) {
    result.combos.forEach((combo, i) => {
      lines.push(`${i + 1}. ${combo.title} — ${combo.summary || ""}`);
      (combo.path || []).forEach((p) => lines.push(`   [${p.stage}] ${p.detail}`));
      lines.push("");
    });
  } else if (currentMode.key === "art") {
    (result.references || []).forEach((ref, i) => {
      lines.push(`${i + 1}. ${ref.title} — ${ref.reason}`);
      lines.push(`   참고 장면: ${ref.scene}`);
    });
    if (result.firstThreeToStudy && result.firstThreeToStudy.length) {
      lines.push("", "🎯 지금 바로 모작해볼 장면:");
      result.firstThreeToStudy.forEach((s) => lines.push(`- ${s}`));
    }
  } else {
    const section = (title, items, fmt) => {
      if (!items || !items.length) return;
      lines.push(title);
      items.forEach((item) => lines.push(fmt(item)));
      lines.push("");
    };
    section("🧩 인생 구조 조합", result.lifeStructures, (i) => `- ${i.combo} (${i.why})`);
    section("① 본업 후보", result.mainJobCandidates, (i) => `- ${i.title}: ${i.reason}`);
    section("② 부업 후보", result.sideJobCandidates, (i) => `- ${i.title}: ${i.reason}`);
    section("③ 개인활동 후보", result.personalActivityCandidates, (i) => `- ${i.title}: ${i.reason}`);
    section("④ 실제 돈이 발생하는 일거리 예시", result.realGigExamples, (i) => `- ${i.title}: ${i.detail}`);
    if (result.firstThreeMonthExperiments && result.firstThreeMonthExperiments.length) {
      lines.push("🎯 처음 3개월에 해볼 실험:");
      result.firstThreeMonthExperiments.forEach((s) => lines.push(`- ${s}`));
    }
  }

  lines.push("", `(답 요약: ${shorthandSummary()})`);
  return lines.join("\n");
}

async function copyResult() {
  if (!lastResult) return;
  const text = resultToPlainText(lastResult);
  try {
    await navigator.clipboard.writeText(text);
    el("copy-status").textContent = "✅ 복사했어요 — 원하는 곳에 붙여넣으면 돼요.";
  } catch (e) {
    el("copy-status").textContent = "❌ 복사에 실패했어요 — 브라우저 권한을 확인해주세요.";
  }
}

function clearAllCache() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
  el("settings-status").textContent = `캐시 ${keys.length}개 삭제했어요.`;
}

async function submitToCollector() {
  const collectorUrl = getCollectorUrl();
  if (collectorUrl.includes("PLACEHOLDER")) {
    // 수집 서버 배포 전 임시 상태(2026-08-11) — 방문자에게 설정 탓을 하지
    // 않는다, 방문자가 고칠 수 있는 게 아니므로. 배포되면 DEFAULT_COLLECTOR_URL만
    // 실제 주소로 바꾸면 이 분기는 저절로 안 타게 된다.
    el("submit-status").textContent = "🚧 수집 서버 준비 중이에요 — 조금 있다가 다시 시도해주세요!";
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
    el("submit-status").textContent = "✅ 제출 완료! 참여해주셔서 감사해요 — 결과는 모아서 정리한 뒤 공유드릴게요.";
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
  el("btn-continue-followup").onclick = continueToFollowUpQuestions;
  el("btn-settings").onclick = () => {
    renderSettings();
    showScreen("settings");
  };
  el("btn-settings-back").onclick = () => showScreen("start");
  el("btn-save-key").onclick = () => {
    setApiKey(el("api-key-input").value);
    el("settings-status").textContent = "저장했어요.";
  };
  el("btn-save-collector").onclick = () => {
    setCollectorUrl(el("collector-url-input").value);
    el("collector-status").textContent = "저장했어요.";
  };
  el("btn-clear-cache").onclick = clearAllCache;
  el("btn-restart").onclick = () => showScreen("start");
  el("btn-retry-generate").onclick = () => generateResult(true);
  el("btn-copy-result").onclick = copyResult;
});
