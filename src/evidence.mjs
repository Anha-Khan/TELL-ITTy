// Builds a trail and lessons from the code graph alone, with no model involved.
// Every claim here comes from something the graph observed: real callers, real callees,
// real line numbers. Quiz answers are computed, so they are correct by construction.

import { buildCodeGraph, extensionOf, isTestPath, reachableFrom } from "./codeGraph.mjs";
import { buildPlain, describeName, friendlyParameters, givesBack, meaningOfType, plainTitle, readCondition } from "./plainEnglish.mjs";

const graphs = new WeakMap();
export function graphFor(context) {
  if (!graphs.has(context)) graphs.set(context, buildCodeGraph(context));
  return graphs.get(context);
}

const LANGUAGE_NAMES = {
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", ts: "TypeScript", tsx: "TypeScript",
  py: "Python", rb: "Ruby", php: "PHP", java: "Java", kt: "Kotlin", kts: "Kotlin", go: "Go", rs: "Rust", c: "C", h: "C",
  cpp: "C++", cc: "C++", hpp: "C++", cs: "C#", swift: "Swift", vue: "Vue", svelte: "Svelte", html: "HTML", css: "CSS",
  scss: "SCSS", sql: "SQL", sh: "Shell", ex: "Elixir", exs: "Elixir", dart: "Dart", lua: "Lua", md: "Markdown", json: "JSON"
};

export const languageFor = (path) => LANGUAGE_NAMES[extensionOf(path)] || "Text";

const FRAMEWORKS_BY_DEPENDENCY = {
  react: "React", next: "Next.js", vue: "Vue", svelte: "Svelte", "@angular/core": "Angular", express: "Express", fastify: "Fastify",
  koa: "Koa", hono: "Hono", "@nestjs/core": "NestJS", electron: "Electron", three: "Three.js", phaser: "Phaser", prisma: "Prisma",
  flask: "Flask", django: "Django", fastapi: "FastAPI", pygame: "Pygame", streamlit: "Streamlit", click: "Click", typer: "Typer",
  bevy: "Bevy", axum: "Axum", clap: "clap", tokio: "Tokio", "gin-gonic/gin": "Gin", "spf13/cobra": "Cobra"
};
const UI_FRAMEWORKS = new Set(["React", "Next.js", "Vue", "Svelte", "Angular"]);
const SERVER_FRAMEWORKS = new Set(["Next.js", "Express", "Fastify", "Koa", "Hono", "NestJS", "Flask", "Django", "FastAPI", "Axum", "Gin"]);
const GAME_FRAMEWORKS = new Set(["Phaser", "Pygame", "Bevy", "raylib", "SDL"]);
const CLI_FRAMEWORKS = new Set(["Click", "Typer", "clap", "Cobra"]);

const fileNamed = (context, name) => context.files.find((file) => file.path.toLowerCase() === name);

function parseManifest(context) {
  try { return JSON.parse(fileNamed(context, "package.json")?.content || "{}"); } catch { return {}; }
}

function detectProject(context) {
  const manifest = parseManifest(context);
  const dependencyText = ["requirements.txt", "pyproject.toml", "cargo.toml", "go.mod", "gemfile"]
    .map((name) => fileNamed(context, name)?.content || "").join("\n").toLowerCase();
  const declared = new Set(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }));
  // Build-time UI frameworks live in devDependencies; test servers do too, so only UI counts.
  for (const name of Object.keys(manifest.devDependencies || {})) if (["react", "vue", "svelte", "next"].includes(name) && !manifest.main && !manifest.exports) declared.add(name);
  const frameworks = new Set();
  for (const [dependency, label] of Object.entries(FRAMEWORKS_BY_DEPENDENCY)) {
    const escaped = dependency.replace(/[/.]/g, "\\$&");
    if (declared.has(dependency) || new RegExp(`(?:^|[\\s"'/])${escaped}(?:[\\s"'=<>~!\\[]|$)`, "m").test(dependencyText)) frameworks.add(label);
  }
  const sources = context.files.map((file) => file.content).join("\n");
  if (/#include\s*[<"]raylib\.h[>"]/.test(sources)) frameworks.add("raylib");
  if (/#include\s*[<"]SDL2?\/?SDL\.h[>"]/.test(sources)) frameworks.add("SDL");

  const counts = new Map();
  for (const path of context.tree) {
    if (/(?:^|\/)(?:node_modules|vendor|dist|build)\//.test(path) || isTestPath(path)) continue;
    const language = LANGUAGE_NAMES[extensionOf(path)];
    if (language && !["Markdown", "JSON"].includes(language)) counts.set(language, (counts.get(language) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([language]) => language);
  const programming = ranked.filter((language) => !["HTML", "CSS", "SCSS"].includes(language));
  const languages = (programming.length ? programming : ranked).slice(0, 2);
  const stack = [...languages, ...frameworks].slice(0, 6);
  if (!stack.length && context.repository.language !== "Unknown") stack.push(context.repository.language);

  const description = (context.repository.description || "").toLowerCase();
  const has = (set) => [...frameworks].some((name) => set.has(name));
  const hasRootPage = context.tree.some((path) => /^(?:public\/|src\/)?index\.html$/i.test(path));
  const looksLikeServer = context.files.some((file) => !/\.(?:md|txt)$/i.test(file.path) && /(?:createServer\(|\b(?:app|server)\.listen\(|\bapp\.(?:get|post)\()/.test(file.content) && !isTestPath(file.path));

  let projectType = "Software project";
  if (has(GAME_FRAMEWORKS) || /\bgame\b/.test(description)) projectType = "Game";
  else if (frameworks.has("Electron")) projectType = "Desktop application";
  else if ((has(UI_FRAMEWORKS) || hasRootPage) && (has(SERVER_FRAMEWORKS) || looksLikeServer)) projectType = "Full-stack web application";
  else if (has(SERVER_FRAMEWORKS) || looksLikeServer) projectType = "Backend service";
  else if (has(UI_FRAMEWORKS) || hasRootPage) projectType = "Web application";
  else if (manifest.bin || has(CLI_FRAMEWORKS) || /\bcli\b|command[- ]line/.test(description)) projectType = "Command-line tool";
  else if (manifest.main || manifest.exports || manifest.module || /\blibrary\b|\bsdk\b|\bclient\b/.test(description) || context.tree.includes("src/lib.rs") || (fileNamed(context, "pyproject.toml") && !/\[project\.scripts\]/.test(fileNamed(context, "pyproject.toml").content))) projectType = "Library";
  return { stack, projectType };
}

const TOOL_NOTES = [
  [/\bvite\b/, "Vite serves the site locally and rebuilds as you edit"], [/\bnext\b/, "Next.js runs or builds the site"], [/\bwebpack\b/, "webpack bundles the source into files a browser can load"],
  [/\breact-scripts\b/, "Create React App's tooling runs or bundles the site"], [/\btsc\b/, "the TypeScript compiler turns `.ts` files into JavaScript"], [/\b(?:rollup|esbuild|tsup|parcel)\b/, "a bundler packs the source into the files that ship"],
  [/\b(?:jest|vitest|mocha|ava|xo|pytest)\b|node --test/, "this runs the project's automated checks"], [/\beslint\b/, "ESLint checks the code for mistakes without running it"], [/\bprettier\b/, "Prettier rewrites the code's formatting"],
  [/\b(?:node|nodemon|tsx|ts-node)\s/, "this starts the program directly with Node"], [/\bgcc\b|\bclang\b|\bcc\b/, "this compiles the C source into a program"]
];
const SCRIPT_ROLES = {
  dev: "starts it locally while you work", start: "starts it", serve: "starts it locally", build: "produces the finished output", test: "runs its automated checks",
  lint: "checks the code without running it", format: "tidies the code's formatting", deploy: "ships it", preview: "runs the built output locally", typecheck: "checks types without running it",
  // Common Makefile targets.
  all: "builds everything", run: "starts it", install: "installs it", clean: "deletes what the build produced", check: "runs its automated checks"
};
const DEPLOY_FILES = [[/^vercel\.json$/, "Vercel"], [/^netlify\.toml$/, "Netlify"], [/^fly\.toml$/, "Fly.io"], [/^Procfile$/, "a Procfile host such as Heroku"], [/^render\.yaml$/, "Render"], [/^Dockerfile$/, "a Docker container"], [/^\.github\/workflows\//, "a GitHub Actions workflow"]];

// Works out how a project is installed, run and shipped, from files that say so.
function buildRecipe(context) {
  const manifestFile = fileNamed(context, "package.json");
  const manifest = parseManifest(context);
  const has = (name) => context.tree.includes(name);
  const deploy = [...new Set(context.tree.flatMap((path) => DEPLOY_FILES.filter(([pattern]) => pattern.test(path)).map(([, label]) => label)))];
  if (manifestFile) {
    const runner = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("bun.lockb") || has("bun.lock") ? "bun" : "npm";
    const scripts = Object.entries(manifest.scripts || {}).map(([name, command]) => ({ name, command: String(command), run: `${runner}${["npm", "bun"].includes(runner) && name !== "start" && name !== "test" ? " run" : ""} ${name}` }));
    const main = ["dev", "start", "serve"].map((name) => scripts.find((script) => script.name === name)).find(Boolean);
    return { file: manifestFile, install: `${runner} install`, scripts, main, deploy, dependencies: Object.keys(manifest.dependencies || {}).slice(0, 6) };
  }
  const named = (name, install, run) => fileNamed(context, name) && { file: fileNamed(context, name), install, scripts: [], main: run && { name: "run", run, command: run }, deploy, dependencies: [] };
  const makefile = fileNamed(context, "makefile");
  if (makefile) {
    const targets = [...makefile.content.matchAll(/^([a-zA-Z][\w-]*):/gm)].map((match) => match[1]).slice(0, 8);
    const scripts = targets.map((name) => ({ name, command: `make ${name}`, run: `make ${name}` }));
    return { file: makefile, install: "", scripts, main: scripts.find((script) => /^(?:run|start|all)$/.test(script.name)) || scripts[0], deploy, dependencies: [] };
  }
  return named("requirements.txt", "pip install -r requirements.txt", context.files.find((file) => /__name__\s*==/.test(file.content)) ? `python ${context.files.find((file) => /__name__\s*==/.test(file.content)).path}` : "")
    || named("pyproject.toml", "pip install .", "")
    || named("cargo.toml", "cargo build", "cargo run")
    || named("go.mod", "go mod download", "go run .")
    || named("cmakelists.txt", "cmake -B build", "cmake --build build")
    || null;
}

function chooseEntry(context, graph) {
  const manifest = parseManifest(context);
  const candidates = [];
  const binValues = typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin || {});
  const startScript = String(manifest.scripts?.start || manifest.scripts?.dev || "").match(/(?:node|tsx|ts-node|nodemon)\s+(?:--\S+\s+)*([\w./-]+)/)?.[1];
  for (const value of [startScript, ...binValues, manifest.main, manifest.module, manifest.exports?.["."]?.default, manifest.exports?.["."]?.import, typeof manifest.exports === "string" ? manifest.exports : null]) {
    if (typeof value !== "string") continue;
    const clean = value.replace(/^\.\//, "");
    const stem = clean.replace(/\.[^.]+$/, "");
    for (const base of [stem, stem.replace(/^(?:dist|build|lib|out)\//, "src/"), stem.replace(/^(?:dist|build|lib|out)\//, "source/"), stem.replace(/^(?:dist|build|lib|out)\//, "")]) {
      const match = context.files.find((file) => file.path.replace(/\.[^.]+$/, "") === base);
      if (match) candidates.push(match.path);
    }
  }
  const mainDefinitions = graph.definitions.filter((definition) => definition.name === "main").map((definition) => definition.path);
  const pythonMains = context.files.filter((file) => /__name__\s*==\s*['"]__main__['"]/.test(file.content) && !isTestPath(file.path)).map((file) => file.path);
  const byName = context.files
    .filter((file) => /(?:^|\/)(?:main|index|app|server|program|cli|application|game|lib|mod|__init__)\.[^/]+$/i.test(file.path) && !isTestPath(file.path) && !/\.(?:css|scss|json)$/.test(file.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)
    .map((file) => file.path);
  // A library's front door is usually the file named after it (`Dotenv.php` in phpdotenv).
  const squash = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const repoName = squash(context.repository?.name || "");
  const definitionCount = (path) => graph.files.get(path)?.definitions.length || 0;
  const namedAfterRepo = context.files
    .filter((file) => { const stem = squash(baseName(file.path).replace(/\.[^.]+$/, "")); return stem.length >= 3 && repoName.includes(stem) && definitionCount(file.path) && !isTestPath(file.path); })
    .sort((a, b) => definitionCount(b.path) - definitionCount(a.path))
    .map((file) => file.path);
  const fallback = context.files
    .filter((file) => definitionCount(file.path) && !isTestPath(file.path))
    .sort((a, b) => (graph.imports.get(b.path)?.size || 0) - (graph.imports.get(a.path)?.size || 0) || definitionCount(b.path) - definitionCount(a.path) || a.path.split("/").length - b.path.split("/").length)
    .map((file) => file.path);
  const found = [...new Set([...candidates, ...mainDefinitions, ...pythonMains, ...byName, ...namedAfterRepo, ...fallback])];
  const path = found[0] || context.files.find((file) => !/readme|package\.json/i.test(file.path))?.path || context.files[0].path;
  // The chosen path always leads the list, even when no rule above matched it.
  const ordered = [path, ...found.filter((item) => item !== path)];
  const file = graph.files.get(path);
  const named = file.definitions.find((definition) => definition.name === "main");
  let node = named || file.top;
  if (!node.calls.length) {
    const busiest = [...file.definitions].sort((a, b) => b.calls.length - a.calls.length)[0];
    if (busiest?.calls.length) node = busiest;
  }
  return { path, node, ordered: ordered.slice(0, 4) };
}

const lineCount = (definition) => definition.endLine - definition.startLine + 1;

function rankCore(graph, entry) {
  const reachable = reachableFrom(entry.node);
  const scored = graph.definitions
    .filter((definition) => definition !== entry.node && lineCount(definition) >= 3 && !/\.(?:css|scss)$/.test(definition.path))
    .map((definition) => {
      const callerFiles = new Set(definition.callers.map((entry) => entry.source.path)).size;
      const score = definition.callers.length * 3 + callerFiles * 3 + Math.min(definition.calls.length, 6) * 2
        + Math.min(lineCount(definition), 40) / 10 + (reachable.has(definition) ? 6 : 0)
        - (/util|helper/i.test(definition.path) ? 3 : 0) - (definition.name.startsWith("_") ? 2 : 0);
      return { definition, score };
    })
    .filter(({ definition }) => definition.callers.length || definition.calls.length)
    .sort((a, b) => b.score - a.score);

  // Prefer breadth: one concept per file first, then fill in with runners-up.
  // One lesson per idea: per-platform copies (`hostid_linux.go`, `hostid_darwin.go`) and
  // private twins (`_rawString` behind `rawString`) would read as the same lesson twice.
  const picked = [];
  const usedFiles = new Set();
  const usedNames = new Set();
  const take = (definition) => { picked.push(definition); usedFiles.add(definition.path); usedNames.add(humanize(definition.name)); };
  for (const { definition } of scored) {
    if (picked.length < 4 && !usedFiles.has(definition.path) && !usedNames.has(humanize(definition.name))) take(definition);
  }
  for (const { definition } of scored) {
    if (picked.length < 3 && !picked.includes(definition) && !usedNames.has(humanize(definition.name))) take(definition);
  }

  // Teach in the order the program reaches things.
  const depth = new Map([[entry.node, 0]]);
  const queue = [entry.node];
  while (queue.length) {
    const current = queue.shift();
    for (const call of current.calls) {
      if (!depth.has(call.target)) { depth.set(call.target, depth.get(current) + 1); queue.push(call.target); }
    }
  }
  return picked.sort((a, b) => (depth.get(a) ?? 99) - (depth.get(b) ?? 99));
}

function longestChain(start) {
  let best = [start];
  const walk = (node, path) => {
    if (path.length > best.length) best = path;
    if (path.length >= 4) return;
    for (const call of node.calls) {
      if (!path.includes(call.target) && call.target.kind !== "class") walk(call.target, [...path, call.target]);
    }
  };
  walk(start, [start]);
  return best;
}

function findConstant(graph, core) {
  const declaration = /^\s*(?:export\s+)?(?:const\s+|static\s+const\s+[\w ]+\s+|#define\s+)?([A-Z][A-Z0-9_]{2,})\s*(?::\s*[\w<>]+\s*)?(?:=\s*)?(-?[\d_.]+|["'][^"']{1,40}["'])\s*;?\s*$/;
  const preferred = new Set(core.map((definition) => definition.path));
  const files = [...graph.files.values()].filter((file) => !isTestPath(file.path)).sort((a, b) => Number(preferred.has(b.path)) - Number(preferred.has(a.path)));
  for (const file of files) {
    for (let index = 0; index < file.lines.length; index++) {
      const match = file.lines[index].match(declaration);
      if (!match) continue;
      const pattern = new RegExp(`\\b${match[1]}\\b`);
      const users = file.definitions.filter((definition) => definition.kind !== "class" && file.masked.slice(definition.startLine - 1, definition.endLine).some((line) => pattern.test(line)));
      if (users.length) return { file, name: match[1], value: match[2], line: index + 1, users };
    }
  }
  return null;
}

export function humanize(identifier) {
  return identifier
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .toLowerCase();
}

const conceptTitle = (definition) => definition.kind === "class" ? `The ${definition.name} class` : `The “${humanize(definition.name)}” step`;
const pad = (number) => String(number).padStart(2, "0");
const baseName = (path) => path.split("/").at(-1);

export function buildEvidenceAnalysis(context) {
  const graph = graphFor(context);
  const { stack, projectType } = detectProject(context);
  const entry = chooseEntry(context, graph);
  const core = rankCore(graph, entry);
  const chain = longestChain(entry.node);
  const readme = context.files.find((file) => /^readme/i.test(file.path));
  const sourceFiles = context.files.filter((file) => !/^readme|package\.json|\.(?:css|scss|json|toml)$/i.test(file.path) && !isTestPath(file.path));
  const constant = findConstant(graph, core);
  const name = context.repository.name;
  const recipe = buildRecipe(context);

  const plans = [{
    kind: "orient",
    title: `What ${name} is for`,
    goal: "The big picture.",
    whyNow: "The big picture gives every later detail somewhere to live.",
    files: [readme?.path, entry.path].filter(Boolean)
  }, ...(recipe ? [{
    kind: "build",
    title: "How it gets built",
    goal: "From download to running.",
    whyNow: "Knowing how a project is assembled tells you which files are the source and which are the result.",
    files: [recipe.file.path]
  }] : []), {
    kind: "entry",
    title: "Where it begins",
    goal: `\`${baseName(entry.path)}\``,
    whyNow: "Every path through the code starts somewhere. Find that place and the rest has an order.",
    files: [entry.path]
  }];

  const concepts = core.length ? core : [];
  for (const definition of concepts) {
    plans.push({
      kind: "concept",
      definitionId: definition.id,
      title: plainTitle(definition.name) || conceptTitle(definition),
      goal: `\`${definition.name}\``,
      whyNow: definition.callers.length > 1
        ? `${definition.callers.length} other parts of the code rely on this, so it shapes more than its size suggests.`
        : "This is one of the places where the project does its real work.",
      files: [definition.path]
    });
  }
  if (!concepts.length) {
    for (const file of sourceFiles.filter((item) => item.path !== entry.path).slice(0, 3)) {
      plans.push({
        kind: "file",
        path: file.path,
        title: `What \`${baseName(file.path)}\` is for`,
        goal: "Find its one job.",
        whyNow: "Each file should earn its place. This one is next in line.",
        files: [file.path]
      });
    }
  }
  if (chain.length >= 3) {
    plans.push({
      kind: "trace",
      chain: chain.map((node) => node.id),
      title: "One path, start to end",
      goal: chain.map((node) => node.name).join(" → "),
      whyNow: "You've seen the pieces separately. A real path shows how they hand work to each other.",
      files: [...new Set(chain.map((node) => node.path))]
    });
  }
  const changeTarget = constant?.file.path || core[0]?.path || sourceFiles[0]?.path || entry.path;
  plans.push({
    kind: "change",
    title: "Change one thing",
    goal: constant ? "Predict it. Do it." : "Predict it. Do it.",
    whyNow: "Changing something and being right about it is what turns reading into ownership.",
    files: [changeTarget]
  });

  const learningTrail = plans.slice(0, 9).map((plan, index) => ({
    id: pad(index + 1),
    ...plan,
    prerequisites: index === 0 ? [] : [pad(index)]
  }));

  const systemsByDirectory = new Map();
  for (const definition of [...core, ...graph.definitions].slice(0, 200)) {
    const directory = definition.path.includes("/") ? definition.path.split("/").slice(0, -1).join("/") : "(project root)";
    if (!systemsByDirectory.has(directory)) systemsByDirectory.set(directory, new Set());
    systemsByDirectory.get(directory).add(definition.path);
  }
  const systems = [...systemsByDirectory.entries()].slice(0, 5).map(([directory, paths]) => ({
    name: directory,
    responsibility: `${paths.size} file${paths.size === 1 ? "" : "s"} with functions the rest of the project uses.`,
    files: [...paths].slice(0, 4)
  }));

  return {
    project: {
      name,
      summary: cleanDescription(context.repository.description) || readmeSummary(context) || `A ${projectType.toLowerCase()} with its starting point in ${entry.path}.`,
      projectType,
      stack,
      entryPoints: entry.ordered,
      runCommand: recipe?.main?.run || "",
      confidenceNote: `Read ${context.selection.analyzedFileCount} of ${context.selection.discoveredFileCount} files. Links between functions come from static reading, so run the project to confirm behaviour.`
    },
    systems,
    importantFlows: [{
      name: "Main path",
      steps: chain.map((node) => ({ label: node.name, files: [node.path] }))
    }],
    learningTrail
  };
}

function readmeSummary(context) {
  const readme = context.files.find((file) => /^readme/i.test(file.path));
  if (!readme) return "";
  const paragraph = readme.content.split(/\n\s*\n/).map((block) => block.trim()).find((block) => block.length > 40 && /^[A-Za-z`*]/.test(block));
  return paragraph ? stripMarkdown(paragraph).replace(/[[\]]/g, "").replace(/\(https?:[^)]+\)/g, "").split(/(?<=[.!?])\s/)[0].slice(0, 220) : "";
}

// --- lesson building -------------------------------------------------------------

function excerptOf(graph, path, startLine, endLine, whyShown, maxLines = 30) {
  const file = graph.files.get(path);
  let first = Math.max(1, startLine);
  let last = Math.min(file.lines.length, endLine, first + maxLines - 1);
  while (first < last && !file.lines[first - 1].trim()) first++;
  while (last > first && !file.lines[last - 1].trim()) last--;
  return { path, language: languageFor(path), excerpt: file.lines.slice(first - 1, last).join("\n"), startLine: first, endLine: last, whyShown };
}

const lineText = (graph, path, line) => graph.files.get(path).lines[line - 1].trim();
const label = (definition) => definition.kind === "top" ? `the top of \`${definition.path}\`` : `\`${definition.name}\``;
const inFile = (definition) => `\`${definition.name}\` in \`${baseName(definition.path)}\``;

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value;
}

function seededOrder(items, seed) {
  return items
    .map((item, index) => ({ item, key: hash(`${seed}:${index}`) }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

function otherDefinitions(graph, exclude, seed) {
  const names = new Set([...exclude].map((definition) => definition.name));
  const seen = new Set();
  const pool = graph.definitions.filter((definition) => {
    if (exclude.has(definition) || names.has(definition.name) || seen.has(definition.name) || definition.kind === "class" || lineCount(definition) < 2) return false;
    seen.add(definition.name);
    return true;
  });
  return seededOrder(pool, seed);
}

function assembleCheck({ question, correct, wrong, explanation, seed }) {
  const options = seededOrder([{ text: correct, why: "" }, ...wrong], seed);
  return {
    question,
    choices: options.map((option) => option.text),
    answerIndex: options.findIndex((option) => option.text === correct),
    explanation,
    misconceptions: options.map((option) => option.why)
  };
}

function checkForDefinition(graph, definition, seed) {
  if (definition.callers.length) {
    const caller = definition.callers[0].source;
    const callerSet = new Set(definition.callers.map((entry) => entry.source));
    const distractors = otherDefinitions(graph, new Set([definition, ...callerSet]), seed).slice(0, 3);
    if (distractors.length && caller.kind !== "top") {
      return assembleCheck({
        seed,
        question: definition.kind === "class"
          ? `You delete \`${definition.name}\`. What breaks first?`
          : `\`${definition.name}\` returns garbage. Who gets it first?`,
        correct: inFile(caller),
        wrong: distractors.map((item) => ({ text: inFile(item), why: `\`${item.name}\` never calls \`${definition.name}\` directly, so the bad result doesn't arrive there first. Look for who calls it.` })),
        explanation: `\`${caller.name}\` calls \`${definition.name}\` on line ${definition.callers[0].line} of \`${baseName(caller.path)}\`, so whatever comes back lands there first.`
      });
    }
  }
  if (definition.calls.length) {
    const callee = definition.calls[0].target;
    const callees = new Set(definition.calls.map((call) => call.target));
    const distractors = otherDefinitions(graph, new Set([definition, ...callees]), seed).slice(0, 3);
    if (distractors.length) {
      return assembleCheck({
        seed,
        question: `\`${definition.name}\` fails but looks fine. Who do you suspect?`,
        correct: inFile(callee),
        wrong: distractors.map((item) => ({ text: inFile(item), why: `\`${definition.name}\` never calls \`${item.name}\`, so it can't be the source of this failure on this path.` })),
        explanation: `\`${definition.name}\` hands work to \`${callee.name}\` on line ${definition.calls[0].line}. When the code you're reading looks right, the thing it depends on is the next suspect.`
      });
    }
  }
  return null;
}

// Wrong answers for a "which file?" question. Tiny repositories may have only one other
// file we read, so fall back to the README, then to files we saw in the tree.
function otherFiles(context, path, seed, skip = /^readme/i) {
  const read = seededOrder(context.files.filter((file) => file.path !== path && !skip.test(file.path)), seed).map((file) => file.path);
  const readmes = context.files.filter((file) => file.path !== path && /^readme/i.test(file.path)).map((file) => file.path);
  const seen = seededOrder(context.tree.filter((item) => item !== path && !item.startsWith(".") && !read.includes(item) && !readmes.includes(item)), seed);
  return [...read, ...readmes, ...seen].slice(0, 3).map((item) => ({ path: item }));
}

function fileCheck(context, graph, path, seed, objective) {
  const others = otherFiles(context, path, seed);
  return assembleCheck({
    seed,
    question: `To change “${objective.replace(/`/g, "")}”, which file do you open?`,
    correct: `\`${path}\``,
    wrong: others.map((file) => ({ text: `\`${file.path}\``, why: `\`${baseName(file.path)}\` is part of the project, but it isn't where this lesson's behaviour is written.` })),
    explanation: `It's written in \`${path}\`.`
  });
}

function walkthroughForDefinition(graph, definition, block) {
  const steps = [];
  const inside = (line) => line >= block.startLine && line <= block.endLine;
  const file = graph.files.get(definition.path);
  if (definition.kind !== "top") {
    steps.push({
      label: "What it needs",
      explanation: (() => { const needs = friendlyParameters(lineText(graph, definition.path, definition.startLine)); return needs.length ? `To do its job, it's handed ${needs.slice(0, 3).join(", ")}.` : "It needs nothing handed to it."; })(),
      anchor: lineText(graph, definition.path, definition.startLine),
      deeper: `Defined at line ${definition.startLine} of \`${definition.path}\`, ${lineCount(definition)} lines long.`
    });
  }
  const calls = definition.calls.filter((call) => inside(call.line)).slice(0, 2);
  for (const call of calls) {
    const target = call.target;
    steps.push({
      label: `Asks ${target.name} for help`,
      explanation: `\`${target.name}\` ${shortOf(target)}`,
      anchor: lineText(graph, definition.path, call.line),
      deeper: target.calls.length
        ? `\`${target.name}\` in turn calls ${target.calls.slice(0, 4).map((item) => `\`${item.target.name}\``).join(", ")}.`
        : `\`${target.name}\` doesn't call anything else in this project, so the trail stops there.`
    });
  }
  const conditionIndex = file.masked.slice(block.startLine - 1, block.endLine).findIndex((line) => /^\s*(?:if|elif|else if|guard|switch|match)\b/.test(line));
  if (conditionIndex >= 0) {
    const anchor = file.lines[block.startLine - 1 + conditionIndex].trim();
    steps.push({
      label: "A fork in the road",
      explanation: capitalize(readCondition(anchor)),
      anchor,
      deeper: `It's on line ${block.startLine + conditionIndex}. Changing this condition changes behaviour without touching anything else.`
    });
  }
  const returnIndex = file.masked.slice(block.startLine - 1, block.endLine).map((line) => /^\s*return\b/.test(line)).lastIndexOf(true);
  if (returnIndex >= 0) {
    const receiver = definition.callers[0]?.source;
    steps.push({
      label: "What it hands back",
      explanation: receiver ? `The answer goes back to ${label(receiver)}, which asked for it.` : "The answer goes back to whoever asked.",
      anchor: file.lines[block.startLine - 1 + returnIndex].trim(),
      deeper: definition.callers.length ? `Called from: ${definition.callers.slice(0, 5).map((entry) => label(entry.source)).join(", ")}.` : "Nothing else in the files we read calls this directly; it may be called from outside the project."
    });
  }
  if (!steps.length) {
    steps.push({ label: "Read it once", explanation: "Name its one job, in your words.", anchor: block.excerpt.split("\n").find((line) => line.trim())?.trim() || "", deeper: "" });
  }
  return steps;
}

const shortOf = (node) => (node.kind === "top" ? "runs its setup." : describeName(node.name, node.doc).short);
const capitalize = (text) => (text.startsWith("`") || text.startsWith("“") ? text : text.charAt(0).toUpperCase() + text.slice(1));
const bodyOf = (graph, definition) => graph.files.get(definition.path).lines.slice(definition.startLine - 1, definition.endLine);

function plainForDefinition(graph, definition) {
  const description = describeName(definition.name, definition.doc);
  const needs = friendlyParameters(lineText(graph, definition.path, definition.startLine));
  const asker = definition.callers[0]?.source;
  const helper = definition.calls[0]?.target;
  return buildPlain({
    headline: `\`${definition.name}\` ${description.short}`,
    like: description.like,
    facts: [
      { label: "It gets", text: needs.length ? capitalize(needs.slice(0, 3).join(", ")) : "Nothing. It works alone." },
      { label: "It asks for help", text: helper ? `\`${helper.name}\`` : "Nobody. It does this itself." },
      { label: "It gives back", text: givesBack(definition, description, bodyOf(graph, definition)) },
      { label: "Who needs it", text: asker ? (asker.kind === "top" ? `\`${asker.name}\`` : `\`${asker.name}\``) : "Code outside this project" }
    ],
    words: definition.name
  });
}

const connection = (from, to, relationship) => ({ from, to, relationship });

function connectionsFor(definition) {
  const links = [];
  for (const entry of definition.callers.slice(0, 2)) {
    links.push(connection(entry.source.kind === "top" ? entry.source.path : entry.source.name, definition.name, `Needs this on line ${entry.line}.`));
  }
  for (const call of definition.calls.slice(0, 2)) {
    links.push(connection(definition.name, call.target.name, `Asks for help on line ${call.line}.`));
  }
  return links;
}

function mentalDiagram(definition) {
  const before = definition.callers[0]?.source;
  const after = definition.calls[0]?.target;
  return [before && (before.kind === "top" ? baseName(before.path) : before.name), definition.name, after?.name].filter(Boolean);
}

function fallbackExcerpt(graph, path, whyShown) {
  const file = graph.files.get(path);
  const first = file.masked.findIndex((line) => line.trim() && !/^\s*(?:import|from|#include|using|package|require)\b/.test(line));
  return excerptOf(graph, path, first < 0 ? 1 : first + 1, file.lines.length, whyShown, 24);
}

function orientLesson(context, graph, analysis, plan) {
  const readme = context.files.find((file) => /^readme/i.test(file.path));
  const entryPath = analysis.project.entryPoints[0];
  const entry = chooseEntry(context, graph);
  const code = [];
  if (readme) {
    const file = graph.files.get(readme.path);
    const start = file.lines.findIndex((line) => /^[A-Za-z]/.test(line.trim()) && line.trim().length > 30);
    code.push(excerptOf(graph, readme.path, (start < 0 ? 0 : start) + 1, file.lines.length, "The project describing itself, in its author's words.", 10));
  }
  const firstBlock = entry.node.kind === "top" ? fallbackExcerpt(graph, entryPath, "The file where things begin.") : excerptOf(graph, entryPath, entry.node.startLine, entry.node.endLine, "The function where things begin.", 14);
  code.push(firstBlock);
  const concepts = analysis.learningTrail.filter((item) => item.kind === "concept" || item.kind === "file");
  const check = fileCheckForEntry(context, entryPath, plan.id);
  return {
    plain: buildPlain({
      headline: cleanSentence(readme ? code[0].excerpt : analysis.project.summary),
      facts: [
        { label: "What it is", text: meaningOfType(analysis.project.projectType) },
        { label: "Written in", text: analysis.project.stack?.join(", ") || context.repository.language || "Code" },
        { label: "Starts in", text: `\`${baseName(entryPath)}\`` }
      ],
      words: analysis.project.summary
    }),
    subtitle: `A ${analysis.project.projectType.toLowerCase()}, in a few sentences.`,
    whyItMatters: analysis.project.summary,
    mentalModel: {
      text: `It starts in \`${baseName(entryPath)}\`, then does its work in a few places.`,
      diagram: [baseName(entryPath), ...concepts.slice(0, 3).map((item) => item.files[0] ? baseName(item.files[0]) : item.title)].filter((value, index, all) => all.indexOf(value) === index)
    },
    code,
    walkthrough: [
      readme && { label: "What it says it is", explanation: "The author's claim. The code is the proof.", anchor: code[0].excerpt.split("\n")[0].trim(), deeper: `We read ${context.selection.analyzedFileCount} of the ${context.selection.discoveredFileCount} files in this repository.` },
      { label: "Where it begins", explanation: `\`${entryPath}\` is the best candidate for where things start.`, anchor: firstBlock.excerpt.split("\n")[0].trim(), deeper: `Other candidates we considered: ${analysis.project.entryPoints.slice(1).map((path) => `\`${path}\``).join(", ") || "none"}.` }
    ].filter(Boolean),
    connections: concepts.slice(0, 2).map((item) => connection(baseName(entryPath), baseName(item.files[0]), `Later on the trail: ${item.title.replace(/`/g, "")}.`)),
    check,
    tryIt: `Say what ${context.repository.name} does, in one sentence, from memory.`
  };
}

function buildLesson(context, graph, analysis, plan) {
  const recipe = buildRecipe(context);
  const path = recipe.file.path;
  const file = graph.files.get(path);
  const seed = plan.id;
  const scriptLine = (name) => file.lines.findIndex((line) => new RegExp(`^\\s*"?${name}"?\\s*:`).test(line)) + 1;
  const scriptsStart = file.lines.findIndex((line) => /^\s*"scripts"\s*:/.test(line));
  const known = recipe.scripts.filter((script) => SCRIPT_ROLES[script.name]);
  let block;
  if (scriptsStart >= 0) {
    const end = file.lines.findIndex((line, index) => index > scriptsStart && /^\s*}/.test(line));
    block = excerptOf(graph, path, scriptsStart + 1, end + 1, "The commands this project defines for itself.", 24);
  } else {
    block = excerptOf(graph, path, 1, file.lines.length, "The file that says what this project needs and how it's put together.", 20);
  }
  const noteFor = (script) => script.name === "lint" && !/eslint/.test(script.command) ? null : TOOL_NOTES.find(([pattern]) => pattern.test(script.command))?.[1];
  const hosting = recipe.deploy.filter((label) => label !== "a GitHub Actions workflow");
  const automated = hosting.length !== recipe.deploy.length;
  const shown = known.filter((script) => scriptLine(script.name) >= block.startLine && scriptLine(script.name) <= block.endLine).slice(0, 4);
  const firstLine = block.excerpt.split("\n")[0].trim();
  const walkthrough = [];
  if (recipe.install) {
    walkthrough.push({
      label: `Install: ${recipe.install}`,
      explanation: recipe.dependencies.length ? `Downloads what this project relies on, including ${recipe.dependencies.slice(0, 3).map((item) => `\`${item}\``).join(", ")}. None of that code lives in the repository.` : `Downloads whatever \`${baseName(path)}\` lists, so the project has what it needs.`,
      anchor: firstLine,
      deeper: `\`${baseName(path)}\` is the list; the install step fetches what's on it.`
    });
  }
  for (const script of shown) {
    const note = noteFor(script);
    walkthrough.push({
      label: `${script.name}: ${script.run}`,
      explanation: `This ${SCRIPT_ROLES[script.name]}.${note ? ` Under the hood, ${note}.` : ""}`,
      anchor: file.lines[scriptLine(script.name) - 1].trim(),
      deeper: `It runs exactly this: \`${script.command}\`.`
    });
  }
  if (hosting.length) {
    walkthrough.push({ label: "Shipping it", explanation: `The repository includes setup for ${hosting.join(" and ")}, which is likely how it reaches people.`, anchor: firstLine, deeper: "That's inferred from config files in the repository. We can't see what's actually deployed." });
  }
  if (automated) {
    walkthrough.push({ label: "What runs on its own", explanation: "There are GitHub Actions workflows in `.github/workflows`. Those run automated steps on GitHub, usually when code is pushed.", anchor: firstLine, deeper: "Open that folder to see exactly which steps they run." });
  }
  if (!walkthrough.length) {
    walkthrough.push({ label: "Read the recipe", explanation: `\`${baseName(path)}\` is where this project says what it needs. We couldn't find named commands, so check the README for how to run it.`, anchor: firstLine, deeper: "" });
  }

  const entryPath = analysis.project.entryPoints[0];
  const stages = [recipe.install && "install", recipe.main && recipe.main.name, known.find((script) => script.name === "build")?.name, known.find((script) => script.name === "test")?.name, hosting.length && "ship"].filter(Boolean);
  const diagram = [...new Set(stages)];
  // Only scripts with a known role can be described, so only those can be the answer.
  const startScript = recipe.main && known.includes(recipe.main) ? recipe.main : known.find((script) => script.name === "test");
  const wrongScripts = known.filter((script) => script !== startScript && !(startScript?.name !== "test" && ["dev", "start", "serve", "preview"].includes(script.name))).slice(0, 3);
  const check = startScript && wrongScripts.length ? assembleCheck({
    seed,
    question: startScript.name === "test" ? "You changed some code and want to know whether you broke anything. Which command do you run?" : "You just edited a file and want to see the project running. Which command do you run?",
    correct: `\`${startScript.run}\``,
    wrong: wrongScripts.map((script) => ({ text: `\`${script.run}\``, why: `That one ${SCRIPT_ROLES[script.name]}.` })),
    explanation: `\`${startScript.run}\` ${SCRIPT_ROLES[startScript.name]}.`
  }) : assembleCheck({
    seed,
    question: "Where do new dependencies get listed?",
    correct: `\`${path}\``,
    wrong: otherFiles(context, path, seed).map((item) => ({ text: `\`${item.path}\``, why: `\`${baseName(item.path)}\` may use a dependency, but it isn't where the project declares them.` })),
    explanation: `\`${path}\` is the project's own list of what it needs.`
  });

  const startedFile = recipe.scripts.map((script) => script.command.match(/(?:node|tsx|ts-node|nodemon|python3?)\s+(?:--?\S+\s+)*([\w./-]+\.\w+)/)?.[1]).find((candidate) => candidate && context.tree.includes(candidate.replace(/^\.\//, "")));
  return {
    plain: buildPlain({
      headline: recipe.install || recipe.main ? "A few commands turn this code into something that works." : `\`${baseName(path)}\` lists what this project needs.`,
      like: "Like a recipe: get the ingredients, then cook.",
      facts: [
        recipe.install && { label: "Download the parts", text: `\`${recipe.install}\`` },
        recipe.main && recipe.main.run !== recipe.install && { label: recipe.main.name === "test" ? "Check it works" : "Run it", text: `\`${recipe.main.run}\`` },
        known.find((script) => script.name === "build") && { label: "Package it", text: `\`${known.find((script) => script.name === "build").run}\`` },
        recipe.main?.name !== "test" && known.find((script) => script.name === "test") && { label: "Check it works", text: `\`${known.find((script) => script.name === "test").run}\`` }
      ].filter(Boolean),
      words: recipe.install || ""
    }),
    subtitle: diagram.length > 1 ? diagram.join(" → ") : `From \`${baseName(path)}\``,
    whyItMatters: `The recipe lives in \`${baseName(path)}\`.`,
    mentalModel: { text: "Code is the ingredients. These commands are the recipe.", diagram: diagram.length > 1 ? diagram : [baseName(path), baseName(entryPath)] },
    code: [block],
    walkthrough,
    connections: [connection(recipe.main?.run || baseName(path), startedFile || baseName(entryPath), startedFile ? "This command starts this file directly." : "The best candidate for where the project begins. The next lesson opens it.")],
    check,
    tryIt: recipe.main ? `Clone the project, run \`${recipe.install || recipe.main.run}\`${recipe.install ? `, then \`${recipe.main.run}\`` : ""}. Before you do: what do you expect to see, and where?` : `Find the install or run instructions in the README and follow them. Note every step that isn't written down.`
  };
}

function fileCheckForEntry(context, entryPath, seed) {
  const pool = otherFiles(context, entryPath, seed, /^readme|\.(?:json|toml|css|lock)$/i);
  return assembleCheck({
    seed,
    question: "What runs first? Which file do you open?",
    correct: `\`${entryPath}\``,
    wrong: pool.map((file) => ({ text: `\`${file.path}\``, why: `\`${baseName(file.path)}\` does a job once it's reached, but nothing here suggests the project starts there.` })),
    explanation: `\`${entryPath}\` is the start.`
  });
}

function entryLesson(context, graph, analysis, plan) {
  const entry = chooseEntry(context, graph);
  const { node } = entry;
  let block;
  if (node.kind === "top") {
    const firstCall = node.calls[0]?.line;
    const firstReal = fallbackExcerpt(graph, node.path, "");
    const start = firstCall ? Math.max(firstReal.startLine, firstCall - 4) : firstReal.startLine;
    block = excerptOf(graph, node.path, start, node.endLine, "The first code that runs when this file loads.", 26);
  } else {
    block = excerptOf(graph, node.path, node.startLine, node.endLine, "The first code that runs.", 30);
  }
  const callees = node.calls;
  const seed = plan.id + node.id;
  let check = null;
  // Only ask "what stops running?" when deleting the call silences something besides the
  // deleted function itself; otherwise the answer would just repeat the question.
  for (const { target: removed } of callees) {
    const stillReachable = reachableFrom(node, { skip: removed });
    const lost = [...reachableFrom(removed)].find((item) => !stillReachable.has(item) && item !== removed && item.kind !== "class" && item.name !== removed.name);
    if (!lost) continue;
    const exclude = new Set([lost, removed, node, ...stillReachable].filter((item) => item.kind !== "top" || item === node));
    const stay = [...stillReachable].filter((item) => item !== node && item.kind !== "top" && item.kind !== "class" && item.name !== lost.name);
    const distractors = seededOrder(stay, seed).concat(otherDefinitions(graph, exclude, seed)).slice(0, 3);
    if (!distractors.length) continue;
    check = assembleCheck({
      seed,
      question: `Delete the \`${removed.name}\` call. What else stops running?`,
      correct: inFile(lost),
      wrong: distractors.map((item) => ({
        text: inFile(item),
        why: stillReachable.has(item) ? `\`${item.name}\` is still reached another way, so removing that one call doesn't stop it.` : `\`${item.name}\` isn't reached through \`${removed.name}\`, so that call doesn't control it.`
      })),
      explanation: `\`${lost.name}\` is only reached through \`${removed.name}\`. Remove the first link and everything behind it goes quiet too.`
    });
    break;
  }
  if (!check && callees.length) {
    const direct = new Set(callees.map((call) => call.target));
    const directNames = new Set([...direct].map((item) => item.name));
    const distractors = otherDefinitions(graph, new Set([node, ...direct]), seed).filter((item) => !directNames.has(item.name)).slice(0, 3);
    if (distractors.length) {
      const first = callees[0];
      check = assembleCheck({
        seed,
        question: `Which of these does ${node.kind === "top" ? `\`${baseName(node.path)}\`` : `\`${node.name}\``} hand work to directly?`,
        correct: inFile(first.target),
        wrong: distractors.map((item) => ({ text: inFile(item), why: `\`${item.name}\` isn't called from here. It may run later, through something else.` })),
        explanation: `Line ${first.line} calls \`${first.target.name}\`.`
      });
    }
  }
  return {
    plain: buildPlain({
      headline: `Everything starts in \`${baseName(node.path)}\`.`,
      like: "Like the front door of a house: you always come in here first.",
      facts: callees.length
        ? callees.slice(0, 3).map((call, index) => ({ label: ["First", "Then", "Then"][index], text: `\`${call.target.name}\` ${shortOf(call.target)}` }))
        : [{ label: "What happens", text: "The project sets itself up here." }]
    }),
    subtitle: `The first page of \`${baseName(node.path)}\`.`,
    whyItMatters: "Find the first line of real work. Everything follows from it.",
    mentalModel: {
      text: callees.length ? `The start of a program is a to-do list: do this, then this, then that. Here, the list is \`${baseName(node.path)}\`.` : `This file is where the project is set up. Nothing else we read runs before it.`,
      diagram: [baseName(node.path), ...callees.slice(0, 3).map((call) => call.target.name)]
    },
    code: [block],
    walkthrough: walkthroughForDefinition(graph, node, block),
    connections: callees.slice(0, 3).map((call) => connection(baseName(node.path), call.target.name, `Line ${call.line}. ${call.target.path === node.path ? "Defined in the same file." : `Defined in \`${call.target.path}\`.`}`)),
    // A core definition's quiz would repeat its own lesson's quiz, so fall back to the file.
    check: check || fileCheckForEntry(context, node.path, seed),
    tryIt: callees.length
      ? `Add a one-line log just before the call to \`${callees[0].target.name}\` in \`${node.path}\`. Before you run it: will it print once or many times?`
      : `Add a one-line log at the top of \`${node.path}\` and run the project. Does it print before anything else you can see?`
  };
}

function conceptLesson(context, graph, analysis, plan) {
  const definition = graph.definitions.find((item) => item.id === plan.definitionId);
  const block = excerptOf(graph, definition.path, definition.startLine, definition.endLine, `All of \`${definition.name}\`${lineCount(definition) > 30 ? ", first 30 lines" : ""}.`);
  const caller = definition.callers[0]?.source;
  const callee = definition.calls[0]?.target;
  const role = caller && callee
    ? `It's a middle link: ${label(caller)} asks for something, and it gets help from \`${callee.name}\` to deliver.`
    : caller
      ? `It's the end of a line: ${label(caller)} asks, and this does the work itself.`
      : callee
        ? `It starts a line of work and hands part of it to \`${callee.name}\`.`
        : "It works on its own.";
  return {
    plain: plainForDefinition(graph, definition),
    subtitle: `\`${definition.name}\` in \`${definition.path}\``,
    whyItMatters: definition.doc || (definition.callers.length > 1
      ? `${definition.callers.length} different places depend on this. Change it and you change all of them.`
      : "Understanding one link properly makes the links on either side of it much easier to read."),
    mentalModel: { text: role, diagram: mentalDiagram(definition) },
    code: [block],
    walkthrough: walkthroughForDefinition(graph, definition, block),
    connections: connectionsFor(definition),
    check: checkForDefinition(graph, definition, plan.id) || fileCheck(context, graph, definition.path, plan.id, plan.title),
    tryIt: `Remove the first call or condition in \`${definition.name}\`. What breaks?`
  };
}

function fileLesson(context, graph, analysis, plan) {
  const start = baseName(analysis.project.entryPoints?.[0] || plan.path);
  const block = fallbackExcerpt(graph, plan.path, "The opening of this file, past the imports.");
  return {
    plain: buildPlain({
      headline: `\`${baseName(plan.path)}\` keeps the ${wordsLabel(plan.path)} code in one place.`,
      like: "Like one drawer in a kitchen: one kind of thing lives here.",
      facts: [{ label: "Find it at", text: `\`${plan.path}\`` }]
    }),
    subtitle: `\`${plan.path}\``,
    whyItMatters: plan.whyNow,
    mentalModel: { text: "Every file has one job. Find it.", diagram: start === baseName(plan.path) ? [start] : [start, baseName(plan.path)] },
    code: [block],
    walkthrough: [{ label: "Name its job", explanation: "Finish this: this file exists so that…", anchor: block.excerpt.split("\n")[0].trim(), deeper: "We couldn't detect function links here, so the reading is up to you." }],
    connections: [connection(start, baseName(plan.path), "We couldn't confirm a direct link from static reading. Search the project for this file's name to find out who uses it.")],
    check: fileCheck(context, graph, plan.path, plan.id, plan.title),
    tryIt: `Search the project for \`${baseName(plan.path).replace(/\.[^.]+$/, "")}\`. Who depends on it?`
  };
}

function traceLesson(context, graph, analysis, plan) {
  const chain = plan.chain.map((id) => graph.definitions.find((item) => item.id === id) || [...graph.files.values()].map((file) => file.top).find((top) => top.id === id));
  const code = [];
  const steps = [];
  chain.slice(0, -1).forEach((node, index) => {
    const next = chain[index + 1];
    const call = node.calls.find((item) => item.target === next);
    const block = excerptOf(graph, node.path, Math.max(node.kind === "top" ? 1 : node.startLine, call.line - 3), Math.min(node.endLine, call.line + 3), `${label(node)} handing off to \`${next.name}\`.`, 8);
    code.push(block);
    steps.push({
      label: `${node.kind === "top" ? baseName(node.path) : node.name} calls ${next.name}`,
      explanation: `Passes the job on. \`${next.name}\` ${shortOf(next)}`,
      anchor: lineText(graph, node.path, call.line),
      deeper: `While \`${next.name}\` runs, ${label(node)} is paused, waiting for it to finish.`
    });
  });
  const middle = chain[chain.length - 2];
  const last = chain.at(-1);
  const first = chain[0];
  const seed = plan.id;
  const onPath = new Set(chain);
  const unrelated = otherDefinitions(graph, onPath, seed).slice(0, 2);
  const wrong = [{ text: inFile(last), why: `\`${last.name}\` is called by \`${middle.name}\`. If \`${middle.name}\` leaves early, it never gets that far.` }]
    .concat(unrelated.map((item) => ({ text: inFile(item), why: `\`${item.name}\` isn't on this path at all.` })));
  const firstName = first.kind === "top" ? baseName(first.path) : first.name;
  const check = first.kind !== "top" ? assembleCheck({
    seed,
    question: `\`${middle.name}\` quits early. What already ran?`,
    correct: inFile(first),
    wrong,
    explanation: `\`${firstName}\` comes first. Nothing after the exit runs.`
  }) : assembleCheck({
    seed,
    question: `\`${middle.name}\` quits early. What still got called?`,
    correct: inFile(chain[1] === last ? middle : chain[1]),
    wrong: wrong.filter((item) => item.text !== inFile(chain[1])),
    explanation: "Before the exit ran. After it didn't."
  });
  return {
    plain: buildPlain({
      headline: `Here's one job, from start to finish, in ${chain.length} steps.`,
      like: "Like a relay race: each runner does a bit, then passes the baton.",
      facts: chain.slice(0, 4).map((node, index) => ({ label: `Step ${index + 1}`, text: `\`${node.kind === "top" ? baseName(node.path) : node.name}\` ${index === 0 && node.kind !== "top" && !plainTitle(node.name) ? "starts the job." : shortOf(node)}` }))
    }),
    subtitle: chain.map((node) => node.kind === "top" ? baseName(node.path) : node.name).join(" → "),
    whyItMatters: "Functions show what exists. Paths show what happens.",
    mentalModel: { text: "A relay. Each function passes the baton and waits.", diagram: chain.map((node) => node.kind === "top" ? baseName(node.path) : node.name) },
    code,
    walkthrough: steps,
    connections: chain.slice(0, -1).map((node, index) => connection(node.kind === "top" ? baseName(node.path) : node.name, chain[index + 1].name, chain[index + 1].path === node.path ? "Passes the job along." : `A hand-off across files, into \`${chain[index + 1].path}\`.`)),
    check,
    tryIt: "Log at the start of each function here. Which prints first?"
  };
}

function changeLesson(context, graph, analysis, plan) {
  const entry = chooseEntry(context, graph);
  const core = rankCore(graph, entry);
  const constant = findConstant(graph, core);
  const seed = plan.id;
  if (constant) {
    const user = constant.users[0];
    const usePattern = new RegExp(`\\b${constant.name}\\b`);
    const useIndex = constant.file.masked.slice(user.startLine - 1, user.endLine).findIndex((line) => usePattern.test(line));
    const useLine = user.startLine + Math.max(useIndex, 0);
    const declaration = excerptOf(graph, constant.file.path, Math.max(1, constant.line - 1), constant.line + 1, "Where the value is set.", 3);
    const usage = excerptOf(graph, constant.file.path, Math.max(user.startLine, useLine - 3), Math.min(user.endLine, useLine + 3), `Where \`${user.name}\` reads it.`, 8);
    const users = new Set(constant.users);
    const distractors = otherDefinitions(graph, users, seed).slice(0, 3);
    return {
      plain: buildPlain({
        headline: `\`${constant.name}\` is one value that \`${user.name}\` relies on.`,
        like: "Like a volume knob: turn one dial, and everything listening changes.",
        facts: [{ label: "Right now", text: `\`${constant.value}\`` }, { label: "Who reads it", text: `\`${user.name}\`` }]
      }),
      subtitle: `\`${constant.name}\` in \`${constant.file.path}\``,
      whyItMatters: "One edit, a predictable effect. The safest experiment.",
      mentalModel: { text: "Change it once. Everything reading it changes.", diagram: [constant.name, ...constant.users.slice(0, 2).map((item) => item.name)] },
      code: [declaration, usage],
      walkthrough: [
        { label: "Where it's set", explanation: `\`${constant.name}\` is ${constant.value}. That's the one place to edit.`, anchor: lineText(graph, constant.file.path, constant.line), deeper: `Line ${constant.line} of \`${constant.file.path}\`.` },
        { label: "Where it's used", explanation: `\`${user.name}\` reads it here, so this is where a new value would show up.`, anchor: lineText(graph, constant.file.path, useLine), deeper: constant.users.length > 1 ? `Also read by ${constant.users.slice(1, 4).map((item) => `\`${item.name}\``).join(", ")}.` : "No other function in this file reads it." }
      ],
      connections: constant.users.slice(0, 3).map((item) => connection(constant.name, item.name, `\`${item.name}\` reads this value, so its behaviour depends on it.`)),
      check: distractors.length ? assembleCheck({
        seed,
        question: `You change \`${constant.name}\`. Who feels it?`,
        correct: inFile(user),
        wrong: distractors.map((item) => ({ text: inFile(item), why: `\`${item.name}\` doesn't read \`${constant.name}\`, so a new value doesn't reach it directly.` })),
        explanation: `\`${user.name}\` reads \`${constant.name}\` directly, so a new value goes straight into its behaviour.`
      }) : fileCheck(context, graph, constant.file.path, seed, plan.title),
      tryIt: `Change \`${constant.name}\`. What looks different?`
    };
  }
  const target = core.at(-1);
  if (target) {
    const lesson = conceptLesson(context, graph, analysis, { ...plan, definitionId: target.id });
    const callers = new Set(target.callers.map((entry) => entry.source));
    const firstCaller = target.callers[0]?.source;
    const distractors = otherDefinitions(graph, new Set([target, ...callers]), seed).slice(0, 3);
    return {
      ...lesson,
      plain: buildPlain({
        headline: firstCaller ? `Change \`${target.name}\`, and \`${firstCaller.name}\` gets a different answer.` : `Change \`${target.name}\`, and whoever uses it gets a different answer.`,
        like: "Like changing a recipe: everyone who orders that dish tastes the difference.",
        facts: [
          { label: "You change", text: `\`${target.name}\`` },
          { label: "Who notices", text: firstCaller ? `\`${firstCaller.name}\`` : "Code outside this project" }
        ]
      }),
      check: firstCaller && firstCaller.kind !== "top" && distractors.length ? assembleCheck({
        seed,
        question: `You log inside \`${target.name}\`. What has to run to see it?`,
        correct: inFile(firstCaller),
        wrong: distractors.map((item) => ({ text: inFile(item), why: `\`${item.name}\` doesn't call \`${target.name}\`, so running it alone won't reach your log line.` })),
        explanation: `\`${firstCaller.name}\` calls \`${target.name}\` on line ${target.callers[0].line}. Your log only prints when something calls the function it's in.`
      // `target` already has a concept lesson; reusing its quiz would ask the same thing twice.
      }) : fileCheck(context, graph, target.path, seed, `\`${target.name}\``),
      whyItMatters: "Predict a change correctly and the code is yours.",
      tryIt: `Log at the top of \`${target.name}\`. How many times does it print?`
    };
  }
  const path = plan.files[0];
  return { ...fileLesson(context, graph, analysis, { ...plan, path }), tryIt: `Change one small piece of text or value in \`${path}\`. Predict what will look different, then run the project and check.` };
}

// Removes markdown decoration and GitHub emoji codes such as `:tada:`, but keeps the
// underscores inside names like `$_ENV` or `snake_case`.
function stripMarkdown(markdown) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s):[a-z0-9_+-]+:(?=\s|$)/g, "$1")
    .replace(/[#*`>]/g, "").replace(/(^|[\s(])_+|_+(?=[\s.,;:!?)]|$)/g, "$1")
    .replace(/\s+/g, " ").trim();
}

export const cleanDescription = (text) => stripMarkdown(String(text || ""));

function cleanSentence(markdown) {
  const text = stripMarkdown(markdown);
  const sentence = text.match(/^.{20,}?[.!?](?=\s|$)/)?.[0] || text;
  return sentence.length > 150 ? `${sentence.slice(0, 147).replace(/\s+\S*$/, "")}…` : sentence;
}

const wordsLabel = (path) => baseName(path).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").toLowerCase();

const builders = { orient: orientLesson, build: buildLesson, entry: entryLesson, concept: conceptLesson, file: fileLesson, trace: traceLesson, change: changeLesson };

export function buildEvidenceLesson(context, analysis, selectedLesson) {
  const graph = graphFor(context);
  const build = builders[selectedLesson.kind] || builders.file;
  const plan = selectedLesson.kind ? selectedLesson : { ...selectedLesson, path: selectedLesson.files?.find((path) => graph.files.has(path)) || context.files[0].path };
  const body = build(context, graph, analysis, plan);
  const index = analysis.learningTrail.findIndex((item) => item.id === selectedLesson.id);
  const next = analysis.learningTrail[index + 1];
  return {
    lessonId: selectedLesson.id,
    title: selectedLesson.title,
    nextReason: next ? next.whyNow : "That's the whole trail. You can now pick a change you want and trace it yourself.",
    ...body
  };
}
