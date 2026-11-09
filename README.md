# tell-itty

**You built it. Now understand it.**

Tell-itty turns a public GitHub repository into a project-specific learning trail. It reads a compact set of useful repository files, builds a conceptual curriculum, teaches one objective at a time with real excerpts, and finishes each lesson with a reasoning check and a tiny experiment.

## Run locally

Tell-itty has no runtime package dependencies. It requires Node.js 20 or newer.

```bash
cp .env.example .env
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

`OPENAI_API_KEY` is optional. With it, the server uses the OpenAI Responses API with strict JSON-schema output, and verifies every code excerpt against the repository before showing it. Without it, the full path still works: trails and lessons are built by reading the code's structure, and the app says so on screen.

Optional environment variables:

- `OPENAI_MODEL` — defaults to `gpt-5-mini`.
- `GITHUB_TOKEN` — raises the GitHub API rate limit; it is never sent to the browser.
- `PORT` — defaults to `3000`.

## Architecture

- `server.mjs` — dependency-free HTTP server and API routes.
- `src/repository.mjs` — GitHub URL parsing, metadata/tree retrieval, file selection that follows imports, and compact context creation.
- `src/codeGraph.mjs` — regex-based reader that finds functions and who calls whom across languages.
- `src/evidence.mjs` — trails and lessons built from that graph, including how the project is built and run. Quiz answers are computed from it.
- `src/curriculum.mjs` — structured model calls, and validation of what the model returns.
- `public/` — `app.js` (state and routing), `api.js`, `views.js` (landing, trail), `lesson.js` (the six lesson stages), `ui.js`.

Repository sessions live in server memory for three hours. There is no authentication or persistent progress in this MVP.

## Verify

```bash
npm test
```

The tests cover URL handling, file filtering, the code graph, lesson grounding, and the model path with a stubbed API.
