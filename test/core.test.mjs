import test from "node:test";
import assert from "node:assert/strict";
import { parseGitHubUrl, isUsefulPath, scorePath, compactRepositoryContext } from "../src/repository.mjs";
import { analyzeRepository, buildEvidenceAnalysis, buildEvidenceLesson, generateLesson, locateExcerpt, sanitizeAnalysis, sanitizeLesson } from "../src/curriculum.mjs";
import { buildCodeGraph, maskSource } from "../src/codeGraph.mjs";

const context = {
  repository: {
    owner: "student",
    name: "tiny-notes",
    fullName: "student/tiny-notes",
    url: "https://github.com/student/tiny-notes",
    description: "A tiny notes API and browser interface.",
    language: "JavaScript",
    defaultBranch: "main"
  },
  tree: ["README.md", "package.json", "src/server.js", "src/routes/notes.js", "public/app.js"],
  files: [
    { path: "README.md", content: "# Tiny Notes\nSave and list notes." },
    { path: "package.json", content: "{\"dependencies\":{\"express\":\"latest\"}}" },
    { path: "src/server.js", content: "import express from 'express';\nconst app = express();\napp.listen(3000);" },
    { path: "src/routes/notes.js", content: "export function listNotes(req, res) {\n  res.json([]);\n}" },
    { path: "public/app.js", content: "fetch('/notes').then((response) => response.json());" }
  ],
  selection: { analyzedFileCount: 5, discoveredFileCount: 5, analyzedPaths: ["README.md", "package.json", "src/server.js", "src/routes/notes.js", "public/app.js"] }
};

test("parses canonical and .git GitHub repository URLs", () => {
  assert.deepEqual(parseGitHubUrl("https://github.com/openai/openai-node.git"), {
    owner: "openai",
    repo: "openai-node",
    canonicalUrl: "https://github.com/openai/openai-node"
  });
});

test("rejects non-GitHub URLs", () => {
  assert.throws(() => parseGitHubUrl("https://example.com/user/repo"), /github\.com/);
});

test("filters noise and prioritizes entry points", () => {
  assert.equal(isUsefulPath("node_modules/react/index.js", 1200), false);
  assert.equal(isUsefulPath("src/main.ts", 1200), true);
  assert.ok(scorePath("src/main.ts", 1200) > scorePath("test/example.ts", 1200));
});

test("builds a bounded compact repository context", () => {
  const compact = compactRepositoryContext(context, 5000);
  assert.match(compact, /student\/tiny-notes/);
  assert.match(compact, /src\/server\.js/);
  assert.ok(compact.length <= 5000);
});

test("builds a repository-specific trail and grounded lesson", () => {
  const analysis = buildEvidenceAnalysis(context);
  assert.equal(analysis.project.name, "tiny-notes");
  assert.ok(analysis.project.stack.includes("Express"));
  assert.ok(analysis.learningTrail.length >= 5);
  assert.ok(analysis.learningTrail.every((lesson) => lesson.files.every((path) => context.tree.includes(path))));

  const lesson = buildEvidenceLesson(context, analysis, analysis.learningTrail[1]);
  assert.equal(lesson.lessonId, "02");
  assert.ok(lesson.code.length > 0);
  assert.ok(context.tree.includes(lesson.code[0].path));
  assert.ok(lesson.check.choices.length >= 3);
  assert.ok(lesson.code[0].startLine >= 1);
});

const linked = {
  repository: { owner: "s", name: "relay", fullName: "s/relay", url: "https://github.com/s/relay", description: "A small relay.", language: "JavaScript", defaultBranch: "main" },
  tree: ["README.md", "src/main.js", "src/fetcher.js", "src/parser.js", "src/other.js"],
  files: [
    { path: "README.md", content: "# Relay\nThis project passes messages along a short chain of functions." },
    { path: "src/main.js", content: "import { load } from './fetcher.js';\n\nfunction main() {\n  const value = load('x');\n  return value;\n}\n\nmain();\n" },
    { path: "src/fetcher.js", content: "import { parse } from './parser.js';\n\nexport function load(name) {\n  if (!name) return null;\n  return parse(name);\n}\n" },
    { path: "src/parser.js", content: "// parse('not a call') in a comment\nexport function parse(text) {\n  const size = text.length;\n  return size;\n}\n" },
    { path: "src/other.js", content: "export function unrelated(a) {\n  const b = a + 1;\n  return b;\n}\nexport function lonely(a) {\n  const b = a + 2;\n  return b;\n}\n" }
  ],
  selection: { analyzedFileCount: 5, discoveredFileCount: 5, analyzedPaths: [] }
};

test("accepts the URL forms people actually paste", () => {
  assert.equal(parseGitHubUrl("github.com/a/b").canonicalUrl, "https://github.com/a/b");
  assert.equal(parseGitHubUrl("a/b").canonicalUrl, "https://github.com/a/b");
  assert.equal(parseGitHubUrl("git@github.com:a/b.git").canonicalUrl, "https://github.com/a/b");
  assert.equal(parseGitHubUrl("https://github.com/a/b/tree/main/src").repo, "b");
});

test("keeps READMEs and bin scripts, drops lockfiles and secrets", () => {
  assert.equal(isUsefulPath("readme.md", 900_000), true);
  assert.equal(isUsefulPath("bin/cli.js", 500), true);
  assert.equal(isUsefulPath("package-lock.json", 500), false);
  assert.equal(isUsefulPath("config/secrets.js", 500), false);
});

test("masks strings and comments so they can't look like code", () => {
  const [line] = maskSource("run('call()'); // later()", "js");
  assert.match(line, /run\(/);
  assert.doesNotMatch(line, /call|later/);
});

test("the code graph finds real cross-file calls and ignores comments", () => {
  const graph = buildCodeGraph(linked);
  const load = graph.definitions.find((item) => item.name === "load");
  const parse = graph.definitions.find((item) => item.name === "parse");
  assert.deepEqual(load.calls.map((call) => call.target.name), ["parse"]);
  assert.deepEqual(parse.callers.map((entry) => entry.source.name), ["load"]);
  assert.equal(parse.startLine, 2);
});

test("every evidence lesson has verbatim code and a graph-true answer", () => {
  const analysis = buildEvidenceAnalysis(linked);
  assert.equal(analysis.project.entryPoints[0], "src/main.js");
  assert.ok(analysis.learningTrail.some((lesson) => lesson.kind === "trace"));
  for (const item of analysis.learningTrail) {
    const lesson = buildEvidenceLesson(linked, analysis, item);
    for (const block of lesson.code) assert.ok(linked.files.find((file) => file.path === block.path).content.includes(block.excerpt));
    assert.equal(lesson.check.misconceptions.length, lesson.check.choices.length);
    assert.equal(lesson.check.misconceptions[lesson.check.answerIndex], "");
  }
  const parseLesson = analysis.learningTrail.find((item) => item.title.includes("parse"));
  const { check } = buildEvidenceLesson(linked, analysis, parseLesson);
  assert.match(check.choices[check.answerIndex], /load/);
});

test("excerpts are restored to the source's exact text, or rejected", () => {
  const source = "function a() {\n    return 1;\n}\n";
  assert.deepEqual(locateExcerpt(source, "function a() {\n  return 1;\n}"), { excerpt: "function a() {\n    return 1;\n}", startLine: 1, endLine: 3 });
  assert.equal(locateExcerpt(source, "function b() {}"), null);
});

const modelLesson = {
  title: "T", subtitle: "S", whyItMatters: "W", mentalModel: { text: "M", diagram: ["a", "b"] },
  code: [
    { path: "src/fetcher.js", language: "JavaScript", excerpt: "export function load(name) {\n  return parse(name);", whyShown: "invented" },
    { path: "src/parser.js", language: "JavaScript", excerpt: "const size = text.length;", whyShown: "real" }
  ],
  walkthrough: [{ label: "L", explanation: "E", anchor: "const size = text.length;", deeper: "D" }],
  connections: [], check: { question: "Q", choices: ["a", "b", "c"], answerIndex: 1, explanation: "X", misconceptions: ["no"] }, tryIt: "T", nextReason: "N"
};

test("a lesson survives one bad excerpt but not zero good ones", () => {
  const lesson = sanitizeLesson(modelLesson, linked, { id: "02" });
  assert.equal(lesson.lessonId, "02");
  assert.equal(lesson.code.length, 1);
  assert.equal(lesson.code[0].startLine, 3);
  assert.deepEqual(lesson.check.misconceptions, ["no", "", ""]);
  assert.throws(() => sanitizeLesson({ ...modelLesson, code: [modelLesson.code[0]] }, linked, { id: "02" }), /verified/);
});

test("invented paths are dropped from a generated trail", () => {
  const lesson = (files) => ({ id: "x", title: "t", goal: "g", whyNow: "w", files, prerequisites: [] });
  const clean = sanitizeAnalysis({
    project: { entryPoints: ["src/main.js", "src/ghost.js"] }, systems: [], importantFlows: [],
    learningTrail: [lesson(["src/main.js", "src/ghost.js"]), lesson(["src/parser.js"]), lesson(["src/other.js"])]
  }, linked);
  assert.deepEqual(clean.project.entryPoints, ["src/main.js"]);
  assert.deepEqual(clean.learningTrail[0].files, ["src/main.js"]);
  assert.equal(clean.learningTrail[2].id, "03");
});

test("the model path parses a response and falls back honestly when it fails", async () => {
  const realFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  const warn = console.warn;
  console.warn = () => {};
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(modelLesson) }] }] }), { status: 200 });
    const analysis = { project: {}, systems: [], importantFlows: [], learningTrail: [{ id: "01", title: "t", goal: "g", whyNow: "w", files: ["src/parser.js"], prerequisites: [] }] };
    const good = await generateLesson(linked, analysis, analysis.learningTrail[0]);
    assert.equal(good.lessonMode, "openai");

    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 500 });
    const failed = await analyzeRepository(linked);
    assert.equal(failed.analysisMode, "repository-evidence-fallback");
    assert.ok(failed.analysis.learningTrail.length >= 3);
    const fallback = await generateLesson(linked, analysis, analysis.learningTrail[0]);
    assert.equal(fallback.lessonMode, "repository-evidence-fallback");
    assert.ok(fallback.lesson.code.length);
  } finally {
    globalThis.fetch = realFetch;
    console.warn = warn;
    delete process.env.OPENAI_API_KEY;
  }
});

// --- regressions found by fault testing ---------------------------------------------

const repoOf = (name, files, extra = {}) => ({
  repository: { owner: "someone", name, fullName: `someone/${name}`, url: `https://github.com/someone/${name}`, description: "", language: "Unknown", defaultBranch: "main", ...extra },
  tree: files.map((file) => file.path),
  files,
  selection: { analyzedFileCount: files.length, discoveredFileCount: files.length, analyzedPaths: files.map((file) => file.path) }
});

const everyLesson = (repo) => {
  const analysis = buildEvidenceAnalysis(repo);
  return { analysis, lessons: analysis.learningTrail.map((step) => buildEvidenceLesson(repo, analysis, step)) };
};

test("a repository with no recognisable code still builds every lesson with a real quiz", () => {
  const repo = repoOf("awesome", [
    { path: "README.md", content: "# Awesome\n\nA curated list of awesome lists about all kinds of interesting topics." },
    { path: ".github/workflows/lint.sh", content: "#!/bin/sh\nnpx awesome-lint" }
  ]);
  const { analysis, lessons } = everyLesson(repo);
  assert.ok(analysis.project.entryPoints.length >= 1);
  for (const lesson of lessons) assert.ok(lesson.check.choices.length >= 2, lesson.title);
});

test("a Makefile target with no npm-style name never says undefined", () => {
  const repo = repoOf("dotenvish", [
    { path: "Makefile", content: "install:\n\tcomposer install\n\ntest:\n\tvendor/bin/phpunit\n" },
    { path: "src/Loader.php", content: "<?php\nclass Loader {\n  public function load($path) {\n    return $this->read($path);\n  }\n  public function read($path) {\n    return file_get_contents($path);\n  }\n}\n" }
  ]);
  const { lessons } = everyLesson(repo);
  assert.doesNotMatch(JSON.stringify(lessons), /\bundefined\b/);
});

test("the entry quiz never answers with the call it deletes, and lessons don't repeat quizzes", () => {
  const repo = repoOf("tool", [
    { path: "main.go", content: "package main\n\nfunc main() {\n\tsetup()\n\trun()\n}\n\nfunc setup() {\n\tconfigure()\n}\n\nfunc configure() {\n\tx := 1\n\t_ = x\n}\n\nfunc run() {\n\tloop()\n}\n\nfunc loop() {\n\ty := 2\n\t_ = y\n}\n" }
  ]);
  const { lessons } = everyLesson(repo);
  for (const lesson of lessons) {
    const deleted = lesson.check.question.match(/Delete the `(\w+)` call/)?.[1];
    if (deleted) assert.ok(!lesson.check.choices[lesson.check.answerIndex].startsWith(`\`${deleted}\``), lesson.check.question);
  }
  const questions = lessons.map((lesson) => lesson.check.question);
  assert.equal(new Set(questions).size, questions.length, questions.join(" | "));
});

test("per-platform copies of one function become one lesson, not two", () => {
  const body = "package xid\n\nfunc readPlatformMachineID() (string, error) {\n\tvalue := lookup()\n\treturn value, nil\n}\n";
  const repo = repoOf("xid", [
    { path: "id.go", content: "package xid\n\nfunc New() ID {\n\tid := readPlatformMachineID()\n\treturn id\n}\n\nfunc lookup() string {\n\treturn \"\"\n}\n" },
    { path: "hostid_linux.go", content: body },
    { path: "hostid_darwin.go", content: body }
  ]);
  const titles = buildEvidenceAnalysis(repo).learningTrail.map((step) => step.title);
  assert.equal(new Set(titles).size, titles.length, titles.join(" | "));
});

test("a package call like sha256.New() is not linked to the project's own New", () => {
  const graph = buildCodeGraph(repoOf("xid", [
    { path: "id.go", content: "package xid\n\nfunc New() ID {\n\treturn ID{}\n}\n" },
    { path: "hostid.go", content: "package xid\n\nfunc machineID() []byte {\n\thw := sha256.New()\n\treturn hw.Sum(nil)\n}\n" }
  ]));
  const newDefinition = graph.definitions.find((definition) => definition.name === "New");
  assert.equal(newDefinition.callers.length, 0);
});

test("Rust attributes are not mistaken for documentation", () => {
  const graph = buildCodeGraph(repoOf("itoa", [
    { path: "src/lib.rs", content: "#[inline]\n#[cfg_attr(feature = \"no-panic\", no_panic)]\npub fn mulhi(a: u64) -> u64 {\n    a\n}\n" }
  ]));
  assert.equal(graph.definitions.find((definition) => definition.name === "mulhi").doc, "");
});

test("project summaries keep underscores in names and drop emoji codes", () => {
  const repo = repoOf("phpdotenv", [{ path: "src/Dotenv.php", content: "<?php\nfunction load() {\n  return 1;\n}\n" }], { description: ":tada: Loads variables from .env to $_ENV and _SERVER_ automagically." });
  assert.equal(buildEvidenceAnalysis(repo).project.summary, "Loads variables from .env to $_ENV and SERVER automagically.");
});

test("HTML inside a README never leaks into the headline", () => {
  const repo = repoOf("awesome", [
    { path: "README.md", content: "# Awesome\n\nJust type <a href=\"https://awesome.re\"><code>awesome.re</code></a> to go here. It lists the best lists." },
    { path: "src/index.js", content: "export function go() {\n  return 1;\n}\n" }
  ]);
  const { lessons } = everyLesson(repo);
  assert.equal(lessons[0].plain.headline, "Just type awesome.re to go here.");
});
