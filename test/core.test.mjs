import test from "node:test";
import assert from "node:assert/strict";
import { parseGitHubUrl, isUsefulPath, scorePath, compactRepositoryContext } from "../src/repository.mjs";
import { buildEvidenceAnalysis, buildEvidenceLesson } from "../src/curriculum.mjs";

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
  assert.equal(lesson.check.choices.length, 4);
});
