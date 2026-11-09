import { escapeHtml, highlightLine, icon, prose } from "./ui.js";
import { appHeader, loadingBlock } from "./views.js";

export const STAGES = [
  { id: "idea", tab: "Idea" },
  { id: "see", tab: "See" },
  { id: "sense", tab: "Follow" },
  { id: "connect", tab: "Connect" },
  { id: "check", tab: "Check" },
  { id: "try", tab: "Try" }
];

const LETTERS = "ABCDEFGH";
const lessonHref = (id, stage) => `#/lesson/${escapeHtml(id)}/${stage}`;

function githubLink(state, block) {
  if (!state.repository || !block.startLine) return "";
  const { url, defaultBranch } = state.repository;
  const path = block.path.split("/").map(encodeURIComponent).join("/");
  const href = `${url}/blob/${defaultBranch.split("/").map(encodeURIComponent).join("/")}/${path}#L${block.startLine}-L${block.endLine}`;
  return `<a class="code-action" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" aria-label="Open on GitHub">${icon("github-mark")}</a>`;
}

function findAnchorIndex(block, anchor) {
  if (!anchor) return -1;
  const wanted = anchor.trim();
  const lines = block.excerpt.split("\n");
  const exact = lines.findIndex((line) => line.trim() === wanted);
  return exact >= 0 ? exact : lines.findIndex((line) => line.includes(wanted));
}

function codeLines(block, activeIndex) {
  const first = block.startLine || 1;
  return block.excerpt.split("\n").map((line, index) => `<span class="code-line${index === activeIndex ? " is-active" : ""}"><span class="line-number" aria-hidden="true">${first + index}</span><span class="line-text">${highlightLine(line, block.language) || " "}</span></span>`).join("");
}

function codeCard(state, block, blockIndex, activeIndex = -1) {
  return `
    <figure class="code-card">
      <figcaption class="code-header">
        <span class="code-path">${escapeHtml(block.path)}</span>
        <span class="code-actions">
          ${githubLink(state, block)}
          <button class="code-action" type="button" data-action="copy" data-block="${blockIndex}">${icon("copy")} Copy</button>
        </span>
      </figcaption>
      <pre tabindex="0" aria-label="Code from ${escapeHtml(block.path)}"><code>${codeLines(block, activeIndex)}</code></pre>
    </figure>`;
}

function ideaStage(lesson) {
  const { plain } = lesson;
  if (!plain) {
    return `
      <h1 class="lesson-heading" data-focus tabindex="-1">${prose(lesson.title)}</h1>
      <p class="glance-headline">${prose(lesson.whyItMatters)}</p>
      <p class="glance-like">${prose(lesson.mentalModel.text)}</p>`;
  }
  return `
    <h1 class="lesson-heading" data-focus tabindex="-1">${prose(lesson.title)}</h1>
    <p class="glance-headline">${prose(plain.headline)}</p>
    ${plain.like ? `<p class="glance-like">${prose(plain.like)}</p>` : ""}
    ${plain.facts.length ? `<dl class="glance-facts">${plain.facts.map((fact) => `<div class="glance-fact"><dt>${escapeHtml(fact.label)}</dt><dd>${prose(fact.text)}</dd></div>`).join("")}</dl>` : ""}
    ${plain.words.length ? `<dl class="glance-words">${plain.words.map((word) => `<div><dt>${escapeHtml(word.term)}</dt><dd>${prose(word.meaning)}</dd></div>`).join("")}</dl>` : ""}`;
}

function seeStage(state, lesson) {
  return `<div class="code-stack" data-focus tabindex="-1">${lesson.code.map((block, index) => codeCard(state, block, index)).join("")}</div>`;
}

function activeBlockIndex(lesson, step) {
  const index = lesson.code.findIndex((block) => findAnchorIndex(block, step?.anchor) >= 0);
  return index < 0 ? 0 : index;
}

function senseStage(state, lesson) {
  const steps = lesson.walkthrough;
  const active = Math.min(state.lessonUi.step, steps.length - 1);
  const step = steps[active];
  const blockIndex = activeBlockIndex(lesson, step);
  const block = lesson.code[blockIndex];
  return `
    <div class="sense-layout" data-focus tabindex="-1">
      <div class="sense-code">${codeCard(state, block, blockIndex, findAnchorIndex(block, step.anchor))}</div>
      <ol class="sense-steps">
        ${steps.map((item, index) => `
          <li class="sense-step${index === active ? " is-active" : ""}">
            <button type="button" class="sense-head" data-action="step" data-step="${index}" aria-expanded="${index === active}">
              <span class="sense-number">${index + 1}</span>
              <span class="sense-label">${prose(item.label)}</span>
            </button>
            ${index === active ? `
              <div class="sense-body">
                <p>${prose(item.explanation)}</p>
                ${state.lessonUi.deeper && item.deeper ? `<p class="deeper">${prose(item.deeper)}</p>` : ""}
                <div class="sense-actions">
                  ${item.deeper && !state.lessonUi.deeper ? `<button type="button" class="button button-secondary button-small" data-action="deeper">Deeper</button>` : ""}
                  ${index < steps.length - 1 ? `<button type="button" class="button button-secondary button-small" data-action="step" data-step="${index + 1}">Next ${icon("arrow")}</button>` : ""}
                </div>
              </div>` : ""}
          </li>`).join("")}
      </ol>
    </div>`;
}

function connectStage(lesson) {
  const links = lesson.connections || [];
  if (!links.length) return `<p class="why" data-focus tabindex="-1">No direct links found.</p>`;
  return `
    <ul class="connections" data-focus tabindex="-1">
      ${links.map((link) => `
        <li>
          <p class="connection-path"><code>${escapeHtml(link.from)}</code><span aria-hidden="true">→</span><span class="visually-hidden">leads to</span><code>${escapeHtml(link.to)}</code></p>
          <p class="connection-why">${prose(link.relationship)}</p>
        </li>`).join("")}
    </ul>`;
}

function checkStage(state, lesson) {
  const { check } = lesson;
  const { selected, wrong, solved } = state.lessonUi;
  const lastWrong = wrong.at(-1);
  const feedback = solved
    ? `<div class="feedback is-right" tabindex="-1" data-feedback><strong>${icon("check")} yep.</strong><p>${prose(check.explanation)}</p></div>`
    : lastWrong !== undefined && selected === lastWrong
      ? `<div class="feedback is-wrong" tabindex="-1" data-feedback><strong>not that one.</strong><p>${prose(check.misconceptions?.[lastWrong] || "Look again at what calls what.")}</p></div>`
      : "";
  return `
    <form class="quiz" data-form="quiz" data-focus tabindex="-1">
      <fieldset ${solved ? "disabled" : ""}>
        <legend>${prose(check.question)}</legend>
        <div class="answers">
          ${check.choices.map((choice, index) => {
            const isWrong = wrong.includes(index);
            const isRight = solved && index === check.answerIndex;
            return `
              <label class="answer${isWrong ? " is-wrong" : ""}${isRight ? " is-right" : ""}">
                <input type="radio" name="answer" value="${index}" ${selected === index ? "checked" : ""} ${isWrong ? "disabled" : ""}>
                <span class="answer-letter" aria-hidden="true">${isRight ? icon("check") : LETTERS[index]}</span>
                <span class="answer-text">${prose(choice)}</span>
                ${isWrong ? `<span class="visually-hidden">ruled out</span>` : ""}
              </label>`;
          }).join("")}
        </div>
      </fieldset>
      ${feedback}
      ${solved ? "" : `<button class="button button-primary quiz-submit" type="submit" ${selected === null || wrong.includes(selected) ? "disabled" : ""}>Check ${icon("arrow")}</button>`}
    </form>`;
}

function tryStage(state, lesson) {
  const note = state.progress[lesson.lessonId]?.prediction || "";
  return `
    <p class="try-text" data-focus tabindex="-1">${prose(lesson.tryIt)}</p>
    <label class="prediction">
      <span class="visually-hidden">Your prediction</span>
      <textarea rows="3" data-input="prediction" placeholder="your guess first…">${escapeHtml(note)}</textarea>
    </label>`;
}

function stageBody(state, lesson, stage) {
  if (stage === "idea") return ideaStage(lesson);
  if (stage === "see") return seeStage(state, lesson);
  if (stage === "sense") return senseStage(state, lesson);
  if (stage === "connect") return connectStage(lesson);
  if (stage === "check") return checkStage(state, lesson);
  return tryStage(state, lesson);
}

function stageTabs(lesson, stageIndex, solved) {
  return `
    <nav class="stage-tabs" aria-label="Lesson stages">
      ${STAGES.map((item, index) => {
        const done = index < stageIndex && (item.id !== "check" || solved);
        return `<a href="${lessonHref(lesson.lessonId, item.id)}" class="stage-tab${index === stageIndex ? " is-active" : ""}${done ? " is-done" : ""}" ${index === stageIndex ? 'aria-current="step"' : ""}>${item.tab}</a>`;
      }).join("")}
    </nav>`;
}

function stageFooter(state, lesson, stageIndex) {
  const trail = state.analysis.learningTrail;
  const position = trail.findIndex((step) => step.id === lesson.lessonId);
  const next = trail[position + 1];
  const previousStage = STAGES[stageIndex - 1];
  const nextStage = STAGES[stageIndex + 1];
  const back = previousStage
    ? `<a class="button button-secondary" href="${lessonHref(lesson.lessonId, previousStage.id)}">${icon("arrow-left")} ${previousStage.tab}</a>`
    : `<a class="button button-secondary" href="#/trail">${icon("arrow-left")} Trail</a>`;

  let forward;
  if (nextStage) {
    const gated = STAGES[stageIndex].id === "check" && !state.lessonUi.solved;
    forward = gated
      ? `<a class="text-link" href="${lessonHref(lesson.lessonId, nextStage.id)}">skip</a>`
      : `<a class="button button-primary" href="${lessonHref(lesson.lessonId, nextStage.id)}">${nextStage.tab} ${icon("arrow")}</a>`;
  } else if (next) {
    forward = `<a class="button button-primary button-large" href="#/lesson/${escapeHtml(next.id)}">Next: <span class="button-title">${prose(next.title)}</span> ${icon("arrow")}</a>`;
  } else {
    forward = `<a class="button button-primary button-large" href="#/trail">Finish ${icon("arrow")}</a>`;
  }
  return `<footer class="stage-footer">${back}${forward}</footer>`;
}

function lessonFrame(state, inner) {
  return `
    <div class="page">
      ${appHeader(state)}
      <div class="lesson-layout">
        <main class="lesson-main">${inner}</main>
      </div>
    </div>`;
}

export function lessonView(state) {
  const lesson = state.lesson;
  const trail = state.analysis.learningTrail;
  const position = trail.findIndex((step) => step.id === state.currentLessonId);
  const stageIndex = Math.max(0, STAGES.findIndex((item) => item.id === state.stage));
  const stage = STAGES[stageIndex];
  const previous = trail[position - 1];
  const next = trail[position + 1];
  return lessonFrame(state, `
    <article class="lesson glass stage-${stage.id}">
      <img class="perch-cat" src="/assets/cat.png" alt="" aria-hidden="true">
      <div class="lesson-top">
        ${stageTabs(lesson, stageIndex, state.lessonUi.solved)}
        <span class="crumb-arrows">
          ${previous ? `<a href="#/lesson/${escapeHtml(previous.id)}" aria-label="Previous lesson">${icon("arrow-left")}</a>` : ""}
          <span class="lesson-count">${escapeHtml(lesson.lessonId)}/${String(trail.length).padStart(2, "0")}</span>
          ${next ? `<a href="#/lesson/${escapeHtml(next.id)}" aria-label="Next lesson">${icon("arrow")}</a>` : ""}
        </span>
      </div>
      <section class="stage">${stageBody(state, lesson, stage.id)}</section>
      ${stageFooter(state, lesson, stageIndex)}
      ${state.lessonMode !== "openai" && state.notice ? `<p class="mode-note">${escapeHtml(state.notice)}</p>` : ""}
    </article>`);
}

export function lessonLoadingView(state, status) {
  return lessonFrame(state, `<div class="lesson-state">${loadingBlock(status)}</div>`);
}

export function lessonErrorView(state) {
  return lessonFrame(state, `
    <div class="lesson-state">
      <div class="error-block glass">
        <img class="error-cat" src="/assets/cat.png" alt="" aria-hidden="true">
        <h1 data-focus tabindex="-1">that didn't work.</h1>
        <p>${escapeHtml(state.error)}</p>
        <div class="error-actions">
          <button class="button button-primary" type="button" data-action="retry-lesson">Retry ${icon("arrow")}</button>
          <a class="button button-secondary" href="#/trail">Trail</a>
        </div>
      </div>
    </div>`);
}
