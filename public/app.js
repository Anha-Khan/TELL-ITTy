import { analyzeRepo, generateLesson } from "./api.js";
import { analysisLoadingView, drawTrailLine, landingView, repoErrorView, repoHelper, trailView } from "./views.js";
import { lessonErrorView, lessonLoadingView, lessonView, STAGES } from "./lesson.js";

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const statusRegion = document.querySelector("#status");

const ANALYSIS_STATUSES = ["reading…", "finding the start…", "connecting dots…", "drawing your trail…"];
const LESSON_STATUSES = ["finding the code…", "making it make sense…"];
const STORAGE_KEY = "tell-itty-session";
const INPUT_ERROR_CODES = new Set(["INVALID_URL", "INVALID_HOST"]);

const freshLessonUi = () => ({ step: 0, deeper: false, selected: null, wrong: [], solved: false });

const state = {
  view: "landing",
  repoUrl: "",
  inputError: "",
  sessionId: null,
  repository: null,
  selection: null,
  analysis: null,
  analysisMode: null,
  notice: "",
  lessons: {},
  progress: {},
  currentLessonId: null,
  currentStepId: null,
  lesson: null,
  lessonMode: null,
  stage: "idea",
  lessonUi: freshLessonUi(),
  error: null
};

// Bumped on every navigation, so a slow response can't yank the learner off a newer screen.
let requestToken = 0;
let statusTimer = null;
let currentStatuses = [];
let statusIndex = 0;
let renderedKey = "";

const VIEWS = {
  landing: landingView,
  repoError: repoErrorView,
  trail: trailView,
  lesson: lessonView,
  lessonError: lessonErrorView,
  analyzing: (current) => analysisLoadingView(current, currentStatuses[statusIndex]),
  lessonLoading: (current) => lessonLoadingView(current, currentStatuses[statusIndex])
};

function render({ focus = true, scroll = true } = {}) {
  app.innerHTML = VIEWS[state.view](state);
  const key = `${state.view}:${state.currentLessonId}:${state.stage}`;
  const moved = key !== renderedKey;
  renderedKey = key;
  if (scroll && moved) window.scrollTo({ top: 0, behavior: "instant" });
  if (focus && moved) app.querySelector("[data-focus]")?.focus({ preventScroll: true });
  if (state.view === "trail") {
    drawTrailLine();
    document.fonts?.ready.then(drawTrailLine);
  }
  document.title = state.analysis && state.view !== "landing" ? `${state.analysis.project.name} — tell-itty` : "tell-itty";
}

function startStatuses(list) {
  stopStatuses();
  currentStatuses = list;
  statusIndex = 0;
  statusRegion.textContent = list[0];
  statusTimer = setInterval(() => {
    statusIndex = (statusIndex + 1) % currentStatuses.length;
    const text = currentStatuses[statusIndex];
    const element = document.querySelector("#loading-status");
    if (element) element.textContent = text;
    statusRegion.textContent = text;
  }, 1800);
}

function stopStatuses() {
  clearInterval(statusTimer);
  statusTimer = null;
}

function saveSession() {
  try {
    const { repoUrl, sessionId, repository, selection, analysis, analysisMode, notice, lessons, progress } = state;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ repoUrl, sessionId, repository, selection, analysis, analysisMode, notice, lessons, progress }));
  } catch {
    // Storage can be full or blocked. The live session still works.
  }
}

function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.analysis?.learningTrail?.length && saved.sessionId) {
      Object.assign(state, saved);
      refreshCurrentStep();
    }
  } catch {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage is blocked */ }
  }
}

function refreshCurrentStep() {
  const trail = state.analysis.learningTrail;
  state.currentStepId = (trail.find((step) => !state.progress[step.id]?.done) || trail[0]).id;
}

function progressFor(id) {
  if (!state.progress[id]) state.progress[id] = {};
  return state.progress[id];
}

function adoptAnalysis(result) {
  state.sessionId = result.sessionId;
  state.repository = result.repository;
  state.selection = result.selection;
  state.analysis = result.analysis;
  state.analysisMode = result.analysisMode;
  state.notice = result.notice || "";
}

function clearProject() {
  Object.assign(state, {
    sessionId: null, repository: null, selection: null, analysis: null, analysisMode: null, notice: "",
    lessons: {}, progress: {}, currentLessonId: null, currentStepId: null, lesson: null, lessonMode: null, error: null
  });
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage is blocked */ }
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const hash = location.hash || "#/";
  const lessonMatch = hash.match(/^#\/lesson\/([^/]+)(?:\/([a-z]+))?$/);
  requestToken++;
  stopStatuses();
  if (lessonMatch && state.analysis) return openLesson(lessonMatch[1], lessonMatch[2]);
  if (hash === "#/trail" && state.analysis) {
    state.view = "trail";
    refreshCurrentStep();
    return render();
  }
  state.view = "landing";
  render();
}

function looksLikeRepo(value) {
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/[^/\s]+\/[^/\s]+/i.test(value) || /^git@github\.com:/i.test(value) || /^[\w.-]+\/[\w.-]+$/.test(value);
}

async function startAnalysis(repoUrl) {
  state.repoUrl = repoUrl.trim();
  state.inputError = "";
  if (!state.repoUrl) {
    state.inputError = "Paste a repo first.";
    state.view = "landing";
    render({ focus: false });
    document.querySelector("#repo-url")?.focus();
    return;
  }
  if (!looksLikeRepo(state.repoUrl)) {
    state.inputError = "That's not a GitHub repo link.";
    state.view = "landing";
    render({ focus: false });
    document.querySelector("#repo-url")?.focus();
    return;
  }

  clearProject();
  const token = ++requestToken;
  state.view = "analyzing";
  startStatuses(ANALYSIS_STATUSES);
  render();
  try {
    const result = await analyzeRepo(state.repoUrl);
    if (token !== requestToken) return;
    stopStatuses();
    adoptAnalysis(result);
    refreshCurrentStep();
    saveSession();
    go("#/trail");
  } catch (error) {
    if (token !== requestToken) return;
    stopStatuses();
    if (INPUT_ERROR_CODES.has(error.code)) {
      state.inputError = error.message;
      state.view = "landing";
      render({ focus: false });
      document.querySelector("#repo-url")?.focus();
      return;
    }
    state.error = error.message;
    state.view = "repoError";
    render();
  }
}

function showLesson(id, stage) {
  const cached = state.lessons[id];
  const isSameLesson = state.lesson?.lessonId === id && state.currentLessonId === id && state.view === "lesson";
  state.currentLessonId = id;
  state.lesson = cached.lesson;
  state.lessonMode = cached.lessonMode;
  state.notice = cached.notice || state.notice;
  state.stage = STAGES.some((item) => item.id === stage) ? stage : "idea";
  if (!isSameLesson) {
    state.lessonUi = freshLessonUi();
    if (state.progress[id]?.done) {
      state.lessonUi.solved = true;
      state.lessonUi.selected = cached.lesson.check.answerIndex;
    }
  }
  state.lessonUi.deeper = false;
  progressFor(id).opened = true;
  state.currentStepId = id;
  state.view = "lesson";
  saveSession();
  render();
}

async function openLesson(id, stage) {
  if (!state.analysis.learningTrail.some((step) => step.id === id)) return go("#/trail");
  if (state.lessons[id]) return showLesson(id, stage);

  const token = requestToken;
  state.currentLessonId = id;
  state.view = "lessonLoading";
  startStatuses(LESSON_STATUSES);
  render();
  try {
    let result;
    try {
      result = await generateLesson(state.sessionId, id);
    } catch (error) {
      if (error.code !== "SESSION_EXPIRED") throw error;
      // The server restarted or forgot this repo. Re-read it instead of stranding the learner.
      const fresh = await analyzeRepo(state.repoUrl);
      if (token !== requestToken) return;
      adoptAnalysis(fresh);
      result = await generateLesson(state.sessionId, id);
    }
    if (token !== requestToken) return;
    stopStatuses();
    state.lessons[id] = result;
    showLesson(id, stage);
  } catch (error) {
    if (token !== requestToken) return;
    stopStatuses();
    state.error = error.message;
    state.view = "lessonError";
    render();
  }
}

function checkAnswer() {
  const { selected } = state.lessonUi;
  if (selected === null) return;
  if (selected === state.lesson.check.answerIndex) {
    state.lessonUi.solved = true;
    progressFor(state.currentLessonId).done = true;
    refreshCurrentStep();
    state.currentStepId = state.currentLessonId;
    saveSession();
  } else if (!state.lessonUi.wrong.includes(selected)) {
    state.lessonUi.wrong.push(selected);
  }
  render({ focus: false, scroll: false });
  const feedback = app.querySelector("[data-feedback]");
  feedback?.focus({ preventScroll: true });
  feedback?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function copyBlock(button) {
  const text = state.lesson?.code?.[Number(button.dataset.block)]?.excerpt;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied.");
  } catch {
    showToast("Couldn't copy.");
  }
}

let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

const actions = {
  restart() {
    requestToken++;
    stopStatuses();
    clearProject();
    state.repoUrl = "";
    state.inputError = "";
    go("#/");
  },
  "back-to-input"() {
    state.error = null;
    go("#/");
  },
  sample(button) {
    startAnalysis(button.dataset.url);
  },
  step(button) {
    state.lessonUi.step = Number(button.dataset.step);
    state.lessonUi.deeper = false;
    render({ focus: false, scroll: false });
    centerActiveLine();
  },
  deeper() {
    state.lessonUi.deeper = true;
    render({ focus: false, scroll: false });
    centerActiveLine();
  },
  copy: copyBlock,
  "retry-lesson"() {
    requestToken++;
    openLesson(state.currentLessonId, state.stage);
  }
};

function centerActiveLine() {
  const line = app.querySelector(".code-line.is-active");
  const scroller = line?.closest("pre");
  if (scroller) scroller.scrollTop = line.offsetTop - scroller.clientHeight / 2;
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (target && !target.disabled) actions[target.dataset.action]?.(target, event);
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.dataset.form === "repo") startAnalysis(new FormData(event.target).get("repoUrl") || "");
  if (event.target.dataset.form === "quiz") checkAnswer();
});

// Picking an answer only touches the submit button, so focus and scroll stay put.
app.addEventListener("change", (event) => {
  if (event.target.name !== "answer") return;
  state.lessonUi.selected = Number(event.target.value);
  const submit = app.querySelector(".quiz-submit");
  if (submit) submit.disabled = false;
  app.querySelector("[data-feedback]")?.remove();
});

app.addEventListener("input", (event) => {
  if (event.target.dataset.input === "prediction") {
    progressFor(state.currentLessonId).prediction = event.target.value;
    saveSession();
  }
  if (event.target.id === "repo-url" && state.inputError) {
    state.inputError = "";
    event.target.removeAttribute("aria-invalid");
    event.target.closest("form").classList.remove("has-error");
    document.querySelector("#repo-helper").innerHTML = repoHelper();
  }
});

window.addEventListener("hashchange", route);
window.addEventListener("resize", () => { if (state.view === "trail") drawTrailLine(); });

history.scrollRestoration = "manual";
restoreSession();
route();
