import { brand, escapeHtml, icon, prose } from "./ui.js";

const SAMPLE_REPO = "https://github.com/expressjs/cors";

export function appHeader(state) {
  return `
    <header class="app-header">
      ${brand()}
      <span class="header-end">
        <button class="text-button" data-action="restart" type="button">new repo</button>
      </span>
    </header>`;
}

export const repoHelper = () => `public repos only · <button class="link-button" type="button" data-action="sample" data-url="${SAMPLE_REPO}">try one</button>`;

export function landingView(state) {
  return `
    <div class="landing">
      <header class="site-header">
        ${brand()}
      </header>

      <main class="arch-stage">
        <div class="arch-frame">
        ${archShades()}
        <section class="arch glass">
          <img class="arch-cat" src="/assets/cat.png" alt="" aria-hidden="true">
          <h1 data-focus tabindex="-1">you built it.<em>now get it.</em></h1>

          <form class="repo-form${state.inputError ? " has-error" : ""}" data-form="repo" novalidate>
            ${icon("github-mark", "repo-form-mark")}
            <label class="visually-hidden" for="repo-url">Public GitHub repository URL</label>
            <input id="repo-url" name="repoUrl" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github.com/you/repo" value="${escapeHtml(state.repoUrl)}" aria-describedby="repo-helper"${state.inputError ? ' aria-invalid="true"' : ""}>
            <button class="button button-primary" type="submit">Start ${icon("arrow")}</button>
          </form>
          <p class="repo-helper" id="repo-helper">${state.inputError ? `<span class="repo-error">${escapeHtml(state.inputError)}</span>` : repoHelper()}</p>
        </section>
        </div>
      </main>
    </div>`;
}

// left %, width px, height px, gap above the arch px
const ARCH_SHADES = [
  [2, 34, 130, 0], [6, 11, 215, 12], [10, 40, 150, 0], [16, 9, 300, 0], [21, 40, 170, 110],
  [28, 12, 345, 0], [33, 40, 190, 34], [40, 11, 310, 170], [47, 9, 110, 6], [55, 11, 330, 40],
  [62, 42, 215, 0], [68, 9, 150, 0], [74, 11, 390, 0], [80, 11, 150, 46], [86, 46, 420, 26],
  [93, 11, 250, 0], [97, 10, 410, 22]
];

// left % of the arch (outside 0-100 is beside it), width px, height vh
const SIDE_SHADES = [
  [-92, 38, 46], [-85, 11, 74], [-77, 42, 38], [-69, 10, 88], [-61, 34, 56], [-53, 11, 68], [-45, 44, 42], [-37, 10, 92],
  [-29, 36, 60], [-21, 11, 80], [-13, 40, 48], [-5, 10, 70],
  [105, 11, 64], [113, 42, 52], [121, 10, 90], [129, 36, 44], [137, 11, 76], [145, 44, 60], [153, 10, 94], [161, 38, 40],
  [169, 11, 72], [177, 40, 54], [185, 10, 86], [192, 36, 48]
];

function archDepth(left, width, radius) {
  const fromEdge = (Math.min(left, 100 - left) / 100) * width;
  return fromEdge >= radius ? 0 : Math.round(radius - Math.sqrt(radius ** 2 - (radius - fromEdge) ** 2));
}

function archShades() {
  const bars = ARCH_SHADES.map(([left, width, height, gap]) =>
    `<i class="arch-shade" style="left:${left}%;--w:${width};--h:${height};--gap:${gap};--c:${archDepth(left, 820, 300)};--cm:${archDepth(left, 343, 170)}"></i>`);
  const sides = SIDE_SHADES.map(([left, width, height]) => `<i class="arch-shade is-side" style="left:${left}%;--w:${width};--h:${height}"></i>`);
  return `<div class="arch-shades" aria-hidden="true">${bars.join("")}${sides.join("")}</div>`;
}

export function loadingBlock(status) {
  return `
    <div class="loading-block glass">
      <img class="loading-cat" src="/assets/cat.png" alt="" aria-hidden="true">
      <h1 id="loading-status" data-focus tabindex="-1">${escapeHtml(status)}</h1>
    </div>`;
}

export function analysisLoadingView(state, status) {
  return `
    <div class="page">
      ${appHeader(state)}
      <main class="center-stage">${loadingBlock(status)}</main>
    </div>`;
}

export function repoErrorView(state) {
  return `
    <div class="page">
      ${appHeader(state)}
      <main class="center-stage">
        <div class="error-block glass">
          <img class="error-cat" src="/assets/cat.png" alt="" aria-hidden="true">
          <h1 data-focus tabindex="-1">couldn't read that.</h1>
          <p>${escapeHtml(state.error)}</p>
          <button class="button button-primary" data-action="back-to-input" type="button">Try another ${icon("arrow")}</button>
        </div>
      </main>
    </div>`;
}

function stepState(state, step) {
  if (state.progress[step.id]?.done) return "done";
  return step.id === state.currentStepId ? "current" : "upcoming";
}

function trailStep(state, step, index) {
  const status = stepState(state, step);
  return `
    <li class="trail-step is-${status}" style="--i:${index}">
      <a class="trail-link" href="#/lesson/${escapeHtml(step.id)}">
        <span class="trail-node" data-node>${status === "done" ? `${icon("check")}<span class="visually-hidden">done</span>` : escapeHtml(step.id)}</span>
        <span class="trail-copy">
          <strong>${prose(step.title)}</strong>
        </span>
      </a>
    </li>`;
}

function trailAction(state) {
  const trail = state.analysis.learningTrail;
  const doneCount = trail.filter((step) => state.progress[step.id]?.done).length;
  if (doneCount === trail.length) return { label: "Start over", id: trail[0].id, doneCount };
  const started = doneCount > 0 || state.progress[state.currentStepId]?.opened;
  return { label: `${started ? "Continue" : "Start"} ${state.currentStepId}`, id: state.currentStepId, doneCount };
}

export function trailView(state) {
  const { project, learningTrail: trail } = state.analysis;
  const action = trailAction(state);
  const finished = action.doneCount === trail.length;
  return `
    <div class="page">
      ${appHeader(state)}
      <main class="trail-layout glass">
        <img class="perch-cat" src="/assets/cat.png" alt="" aria-hidden="true">
        <section class="trail-intro">
          <p class="project-line">${escapeHtml(project.name)}</p>
          <h1 data-focus tabindex="-1">${finished ? "all done." : "your trail."}</h1>
          <p class="project-summary">${prose(project.summary)}</p>
          <div class="trail-cta">
            <a class="button button-primary" href="#/lesson/${escapeHtml(action.id)}">${escapeHtml(action.label)} ${icon("arrow")}</a>
            ${action.doneCount ? `<p class="trail-count">${action.doneCount}/${trail.length}</p>` : ""}
          </div>
          ${state.analysisMode === "openai" ? "" : `<p class="mode-note">${escapeHtml(state.notice)}</p>`}
        </section>

        <section class="trail-map" aria-label="Learning trail">
          <svg class="trail-line" aria-hidden="true"><path></path></svg>
          <ol class="trail-list">${trail.map((step, index) => trailStep(state, step, index)).join("")}</ol>
        </section>
      </main>
    </div>`;
}

// Draws the winding thread between the step markers once they have been laid out.
export function drawTrailLine() {
  const map = document.querySelector(".trail-map");
  const svg = map?.querySelector(".trail-line");
  if (!svg) return;
  const origin = map.getBoundingClientRect();
  const points = [...map.querySelectorAll("[data-node]")].map((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.left - origin.left + box.width / 2, y: box.top - origin.top + box.height / 2 };
  });
  svg.setAttribute("width", origin.width);
  svg.setAttribute("height", origin.height);
  let path = "";
  points.forEach((point, index) => {
    if (index === 0) { path = `M${point.x} ${point.y}`; return; }
    const previous = points[index - 1];
    const middle = (previous.y + point.y) / 2;
    path += ` C${previous.x} ${middle} ${point.x} ${middle} ${point.x} ${point.y}`;
  });
  svg.firstElementChild.setAttribute("d", path);
}
