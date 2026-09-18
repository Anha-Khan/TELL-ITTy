const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

const analysisStatuses = [
  "reading the repo…",
  "finding the entry points…",
  "tracing how the pieces connect…",
  "building your learning trail…"
];

const lessonStatuses = [
  "gathering the right code…",
  "tracing the cause and effect…",
  "shaping one clear lesson…"
];

const state = {
  view: "landing",
  repoUrl: "",
  sessionId: null,
  repository: null,
  selection: null,
  analysis: null,
  analysisMode: null,
  notice: "",
  currentLessonId: null,
  lesson: null,
  lessons: {},
  selectedAnswer: null,
  checkedAnswer: false,
  error: null,
  loadingKind: "analysis",
  statusIndex: 0,
  statusTimer: null
};

function icon(name, className = "") {
  return `<svg class="${className}" aria-hidden="true"><use href="#${name}"></use></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function brand() {
  return `<button class="brand" data-action="home" aria-label="Tell-itty home"><span>tell-itty</span>${icon("cat-mark")}</button>`;
}

function appHeader() {
  const repo = state.repository?.fullName || "one thing at a time";
  return `
    <header class="app-header">
      ${brand()}
      <div class="project-crumb"><strong>${escapeHtml(repo)}</strong></div>
      <button class="button button-secondary button-small restart-button" data-action="restart">Try another repo</button>
    </header>`;
}

function landingView() {
  return `
    <section class="screen landing paper">
      <header class="site-header">
        ${brand()}
        <nav class="site-nav" aria-label="Main navigation">
          <a href="#promise">home</a>
          <a href="#how">how it works</a>
          <a href="#repository">start learning</a>
        </nav>
        <button class="button button-primary header-action" data-action="focus-repo"><span>Start Learning</span>${icon("arrow")}</button>
      </header>

      <div class="landing-grid" id="promise">
        <aside class="landing-art" aria-label="A scrapbook collage with a black cat and books">
          <img class="landing-collage" src="/assets/collage.png" alt="Black cat peeking over books labeled code, coffee, curiosity, and you">
          <span class="tape" aria-hidden="true"></span>
        </aside>

        <section class="landing-copy">
          <p class="eyebrow">Your project, in an order that makes sense</p>
          <h1>you built it with AI. <em>now actually understand it.</em></h1>
          <p class="hero-support">Paste a public GitHub repository. Tell-itty finds the learning trail through your project and teaches it one step at a time.</p>
          <form class="repo-form" id="repository" data-form="repo" novalidate>
            ${icon("github-mark", "github-icon")}
            <input id="repo-url" name="repoUrl" type="url" inputmode="url" autocomplete="url" required placeholder="https://github.com/username/repo" aria-label="Public GitHub repository URL" value="${escapeHtml(state.repoUrl)}">
            <button class="button button-primary" type="submit">Start Learning ${icon("arrow")}</button>
          </form>
          <p class="repo-helper">public repositories only · no sign-up needed</p>
          <p class="repo-annotation">try any public repo</p>
        </section>

        <aside class="landing-note" id="how">
          <img class="polaroid" src="/assets/polaroid.png" alt="A black cat looking through a window">
          <h2>Not just documentation.</h2>
          <ul>
            <li>Finds the shape of your project</li>
            <li>Orders concepts by dependency</li>
            <li>Uses code from your repository</li>
            <li>Traces how important pieces connect</li>
            <li>Checks whether the model clicked</li>
          </ul>
          <p class="tiny-note">small steps<br>big clarity ♡</p>
        </aside>
        <img class="landing-flowers" src="/assets/flowers.png" alt="" aria-hidden="true">
      </div>
    </section>`;
}

function loadingView() {
  const statuses = state.loadingKind === "analysis" ? analysisStatuses : lessonStatuses;
  const heading = state.loadingKind === "analysis" ? "finding the shape of your project" : "turning evidence into a lesson";
  return `
    <section class="screen paper">
      ${appHeader()}
      <div class="loading-screen">
        <div class="loading-card reveal">
          <div class="loading-cat" aria-hidden="true">
            <span class="cat-body"></span>
            ${icon("cat-mark", "cat-head")}
            <span class="tail"></span>
          </div>
          <h1>${heading}</h1>
          <p class="loading-status" id="loading-status">${statuses[state.statusIndex % statuses.length]}</p>
          <div class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>
          <p class="loading-repo">${escapeHtml(state.repository?.fullName || state.repoUrl)}</p>
        </div>
      </div>
    </section>`;
}

function errorView() {
  return `
    <section class="screen paper">
      ${appHeader()}
      <div class="error-screen">
        <div class="error-card reveal">
          ${icon("cat-mark", "error-cat")}
          <h1>We couldn't read that repository.</h1>
          <p>${escapeHtml(state.error || "Something interrupted the trail. Try again.")}</p>
          <button class="button button-primary" data-action="restart">Try another repo ${icon("arrow")}</button>
        </div>
      </div>
    </section>`;
}

function trailView() {
  const project = state.analysis.project;
  const stack = project.stack?.length ? project.stack.join(" · ") : state.repository.language;
  const first = state.analysis.learningTrail[0];
  return `
    <section class="screen trail-page paper">
      ${appHeader()}
      <main class="trail-content reveal">
        <div class="project-kicker">
          <span class="repo-mark">${icon("github-mark")}</span>
          <span>${escapeHtml(state.repository.fullName)} · public repository</span>
        </div>
        <div class="trail-heading">
          <h1>Tell-itty found your <em>learning trail.</em></h1>
          <p>We'll start with the mental model, then follow how the important pieces connect.</p>
        </div>

        <section class="project-strip" aria-label="Project orientation">
          <p class="project-summary">${escapeHtml(project.summary)}</p>
          <div class="project-facts">
            <span>${escapeHtml(project.projectType)}</span>
            <span>${escapeHtml(stack)}</span>
            <span>${state.selection.analyzedFileCount} files examined</span>
          </div>
        </section>

        <ol class="trail-list" aria-label="Learning Trail">
          ${state.analysis.learningTrail.map((step, index) => `
            <li class="trail-step" style="--i:${index}">
              ${index === 0 ? `<img class="trail-cat" src="/assets/sleep-cat.png" alt="Black cat marking the current step">` : ""}
              <button data-lesson-id="${escapeHtml(step.id)}">
                <span class="step-number">${escapeHtml(step.id)}</span>
                <span class="step-copy">
                  <strong>${escapeHtml(step.title)}</strong>
                  <span>${escapeHtml(step.goal)}</span>
                </span>
                ${icon("arrow", "step-arrow")}
              </button>
            </li>`).join("")}
        </ol>

        <div class="trail-footer">
          <span class="trail-footer-note">one thing at a time ♡</span>
          <button class="button button-primary" data-lesson-id="${escapeHtml(first.id)}">Start with ${escapeHtml(first.id)} ${icon("arrow")}</button>
        </div>
        <p class="mode-note">${escapeHtml(state.notice)} ${escapeHtml(project.confidenceNote)}</p>
      </main>
    </section>`;
}

function miniTrail() {
  return state.analysis.learningTrail.map((step) => `
    <li class="${step.id === state.currentLessonId ? "active" : ""}">
      <button data-lesson-id="${escapeHtml(step.id)}"><span>${escapeHtml(step.id)}</span><span>${escapeHtml(step.title)}</span></button>
    </li>`).join("");
}

function codeBlock(block, index) {
  return `
    <article class="code-card">
      <header class="code-header">
        <span class="code-path">${escapeHtml(block.path)} · ${escapeHtml(block.language)}</span>
        <button class="copy-button" data-copy-index="${index}" type="button">▢ Copy</button>
      </header>
      <pre tabindex="0"><code>${escapeHtml(block.excerpt)}</code></pre>
      <p class="code-reason">Why this code: ${escapeHtml(block.whyShown)}</p>
    </article>`;
}

function lessonView() {
  const lesson = state.lesson;
  const trail = state.analysis.learningTrail;
  const currentIndex = trail.findIndex((step) => step.id === state.currentLessonId);
  const previous = trail[currentIndex - 1];
  const next = trail[currentIndex + 1];
  const choices = lesson.check.choices || [];
  const feedbackClass = state.checkedAnswer ? (state.selectedAnswer === lesson.check.answerIndex ? "correct" : "incorrect") : "";
  const feedback = state.checkedAnswer
    ? state.selectedAnswer === lesson.check.answerIndex
      ? `That's the connection. ${lesson.check.explanation}`
      : `Not quite. ${lesson.check.explanation} Choose again and retry.`
    : "";

  return `
    <section class="screen lesson-page paper">
      ${appHeader()}
      <div class="lesson-shell">
        <aside class="lesson-sidebar">
          <h2>Learning Trail</h2>
          <ol class="mini-trail">${miniTrail()}</ol>
          <img class="lesson-sidebar-cat" src="/assets/bottom-cat.png" alt="A resting black cat">
        </aside>

        <main class="lesson-main">
          <article class="lesson-article reveal">
            <nav class="lesson-breadcrumb" aria-label="Lesson navigation">
              <button data-action="trail">${escapeHtml(state.analysis.project.name)} / learning trail</button>
              <span>${currentIndex + 1} of ${trail.length}</span>
            </nav>

            <header class="lesson-hero">
              <span class="lesson-number">Lesson ${escapeHtml(lesson.lessonId)}</span>
              <h1>${escapeHtml(lesson.title)}</h1>
              <p class="lesson-subtitle">${escapeHtml(lesson.subtitle)}</p>
              <p class="why-block">${escapeHtml(lesson.whyItMatters)}</p>
            </header>

            <section class="mental-model">
              <p class="section-label">Key mental model</p>
              <h2>Hold this picture first</h2>
              <p>${escapeHtml(lesson.mentalModel.text)}</p>
              <div class="flow-diagram" aria-label="Concept flow">
                ${(lesson.mentalModel.diagram || []).map((node, index, array) => `
                  <span class="flow-node">${escapeHtml(node)}</span>${index < array.length - 1 ? `<span class="flow-arrow">→</span>` : ""}`).join("")}
              </div>
            </section>

            <section class="lesson-stage" id="see-it">
              <p class="section-label">1 — See it</p>
              <h2>Your code, in context</h2>
              <p class="stage-intro">Only the repository evidence needed for this objective.</p>
              ${(lesson.code || []).map(codeBlock).join("")}
            </section>

            <section class="lesson-stage" id="make-sense">
              <p class="section-label">2 — Make sense of it</p>
              <h2>Follow the cause and effect</h2>
              <ol class="walkthrough">
                ${(lesson.walkthrough || []).map((item) => `<li><div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.explanation)}</p></div></li>`).join("")}
              </ol>
            </section>

            <section class="lesson-stage" id="connect-it">
              <p class="section-label">3 — Connect it</p>
              <h2>Where this fits</h2>
              <div class="connections">
                ${(lesson.connections || []).map((connection) => `
                  <div class="connection">
                    <code>${escapeHtml(connection.from)}</code>
                    <span class="connection-arrow">→</span>
                    <code>${escapeHtml(connection.to)}</code>
                    <p>${escapeHtml(connection.relationship)}</p>
                  </div>`).join("")}
              </div>
            </section>

            <section class="lesson-stage" id="check-yourself">
              <p class="section-label">4 — Check yourself</p>
              <h2>Predict before you proceed</h2>
              <form class="quiz-panel" data-form="quiz">
                <img class="sleep-cat" src="/assets/sleep-cat.png" alt="Small resting black cat">
                <p class="quiz-question">${escapeHtml(lesson.check.question)}</p>
                <div class="answer-list">
                  ${choices.map((choice, index) => `
                    <label class="answer-row">
                      <input type="radio" name="answer" value="${index}" ${state.selectedAnswer === index ? "checked" : ""}>
                      <span>${escapeHtml(choice)}</span>
                    </label>`).join("")}
                </div>
                <div class="quiz-actions">
                  <button class="button button-primary" type="submit" ${state.selectedAnswer === null ? "disabled" : ""}>${state.checkedAnswer && state.selectedAnswer !== lesson.check.answerIndex ? "Try again" : "Check answer"} ${icon("arrow")}</button>
                  <p class="quiz-feedback ${feedbackClass}">${escapeHtml(feedback)}</p>
                </div>
              </form>
            </section>

            <section class="lesson-stage" id="try-it">
              <p class="section-label">5 — Try it</p>
              <h2>Make one tiny move</h2>
              <div class="try-panel"><p>${escapeHtml(lesson.tryIt)}</p></div>
            </section>

            <footer class="lesson-footer">
              ${previous ? `<button class="button button-secondary" data-lesson-id="${escapeHtml(previous.id)}">← Previous</button>` : `<button class="button button-secondary" data-action="trail">← Learning trail</button>`}
              <p class="next-context">${escapeHtml(lesson.nextReason)}</p>
              ${next ? `<button class="button button-primary" data-lesson-id="${escapeHtml(next.id)}">Next: ${escapeHtml(next.title)} ${icon("arrow")}</button>` : `<button class="button button-primary" data-action="trail">Review the trail ${icon("arrow")}</button>`}
            </footer>
            <p class="mode-note">${escapeHtml(state.notice)}</p>
          </article>
        </main>
      </div>
    </section>`;
}

function render() {
  clearStatusTimer();
  const views = {
    landing: landingView,
    loading: loadingView,
    error: errorView,
    trail: trailView,
    lesson: lessonView
  };
  app.innerHTML = (views[state.view] || landingView)();
  bindEvents();
  if (state.view === "loading") startStatusTimer();
  document.title = state.view === "landing" ? "tell-itty — you built it. now understand it." : `${state.analysis?.project?.name || "tell-itty"} — tell-itty`;
}

function bindEvents() {
  document.querySelectorAll('[data-action="home"]').forEach((button) => button.addEventListener("click", goHome));
  document.querySelectorAll('[data-action="restart"]').forEach((button) => button.addEventListener("click", restart));
  document.querySelectorAll('[data-action="trail"]').forEach((button) => button.addEventListener("click", showTrail));
  document.querySelectorAll('[data-action="focus-repo"]').forEach((button) => button.addEventListener("click", () => {
    document.querySelector("#repo-url")?.focus();
  }));
  document.querySelector('[data-form="repo"]')?.addEventListener("submit", submitRepository);
  document.querySelectorAll("[data-lesson-id]").forEach((button) => button.addEventListener("click", () => openLesson(button.dataset.lessonId)));
  document.querySelectorAll("[data-copy-index]").forEach((button) => button.addEventListener("click", () => copyCode(Number(button.dataset.copyIndex), button)));
  document.querySelector('[data-form="quiz"]')?.addEventListener("submit", checkAnswer);
  document.querySelectorAll('input[name="answer"]').forEach((input) => input.addEventListener("change", selectAnswer));
}

function startStatusTimer() {
  const statuses = state.loadingKind === "analysis" ? analysisStatuses : lessonStatuses;
  state.statusTimer = setInterval(() => {
    state.statusIndex = (state.statusIndex + 1) % statuses.length;
    const status = document.querySelector("#loading-status");
    if (status) status.textContent = statuses[state.statusIndex];
  }, 1700);
}

function clearStatusTimer() {
  if (state.statusTimer) clearInterval(state.statusTimer);
  state.statusTimer = null;
}

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "The request could not be completed.");
  return payload;
}

async function submitRepository(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.repoUrl = String(data.get("repoUrl") || "").trim();
  if (!state.repoUrl) {
    document.querySelector("#repo-url")?.focus();
    return;
  }
  state.loadingKind = "analysis";
  state.statusIndex = 0;
  state.error = null;
  state.view = "loading";
  render();

  try {
    const result = await api("/api/analyze-repo", { repoUrl: state.repoUrl });
    if (!result.analysis?.learningTrail?.length) throw new Error("The repository was read, but no learning trail was returned.");
    state.sessionId = result.sessionId;
    state.repository = result.repository;
    state.selection = result.selection;
    state.analysis = result.analysis;
    state.analysisMode = result.analysisMode;
    state.notice = result.notice || "";
    state.lessons = {};
    state.view = "trail";
    saveSession();
    render();
  } catch (error) {
    state.error = error.message;
    state.view = "error";
    render();
  }
}

async function openLesson(lessonId) {
  if (!state.analysis || !state.sessionId) return;
  state.currentLessonId = String(lessonId);
  state.selectedAnswer = null;
  state.checkedAnswer = false;
  if (state.lessons[state.currentLessonId]) {
    state.lesson = state.lessons[state.currentLessonId].lesson;
    state.notice = state.lessons[state.currentLessonId].notice;
    state.view = "lesson";
    saveSession();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  state.loadingKind = "lesson";
  state.statusIndex = 0;
  state.view = "loading";
  render();
  try {
    const result = await api("/api/generate-lesson", { sessionId: state.sessionId, lessonId: state.currentLessonId });
    if (!result.lesson?.check?.choices?.length) throw new Error("The lesson response was incomplete.");
    state.lesson = result.lesson;
    state.notice = result.notice || "";
    state.lessons[state.currentLessonId] = result;
    state.view = "lesson";
    saveSession();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    state.error = error.message;
    state.view = "error";
    render();
  }
}

function selectAnswer(event) {
  state.selectedAnswer = Number(event.currentTarget.value);
  state.checkedAnswer = false;
  render();
  document.querySelector("#check-yourself")?.scrollIntoView({ block: "center" });
}

function checkAnswer(event) {
  event.preventDefault();
  if (state.selectedAnswer === null) return;
  state.checkedAnswer = true;
  render();
  document.querySelector("#check-yourself")?.scrollIntoView({ block: "center", behavior: "smooth" });
}

async function copyCode(index, button) {
  const text = state.lesson?.code?.[index]?.excerpt;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "✓ Copied";
    showToast("Code copied to clipboard.");
  } catch {
    showToast("Clipboard access is unavailable in this browser.");
  }
}

function showTrail() {
  if (!state.analysis) return goHome();
  state.view = "trail";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goHome() {
  state.view = "landing";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function restart() {
  sessionStorage.removeItem("tell-itty-session");
  Object.assign(state, {
    view: "landing", repoUrl: "", sessionId: null, repository: null, selection: null,
    analysis: null, analysisMode: null, notice: "", currentLessonId: null, lesson: null,
    lessons: {}, selectedAnswer: null, checkedAnswer: false, error: null
  });
  render();
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 2200);
}

function saveSession() {
  try {
    sessionStorage.setItem("tell-itty-session", JSON.stringify({
      repoUrl: state.repoUrl,
      sessionId: state.sessionId,
      repository: state.repository,
      selection: state.selection,
      analysis: state.analysis,
      analysisMode: state.analysisMode,
      notice: state.notice,
      currentLessonId: state.currentLessonId,
      lesson: state.lesson,
      lessons: state.lessons,
      view: state.view
    }));
  } catch {
    // The live state remains usable when storage is unavailable.
  }
}

function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem("tell-itty-session") || "null");
    if (!saved?.analysis?.learningTrail?.length || !saved.sessionId) return;
    Object.assign(state, saved);
    state.view = saved.view === "lesson" && saved.lesson ? "lesson" : "trail";
  } catch {
    sessionStorage.removeItem("tell-itty-session");
  }
}

restoreSession();
render();
