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

`OPENAI_API_KEY` is optional. When it is present, the server uses the OpenAI Responses API with strict JSON-schema outputs. Without it, the complete demo path uses a deterministic repository-evidence mode; that mode still reads and teaches from the live public repository rather than returning canned data.

Optional environment variables:

- `OPENAI_MODEL` — defaults to `gpt-5-mini`.
- `GITHUB_TOKEN` — raises the GitHub API rate limit; it is never sent to the browser.
- `PORT` — defaults to `3000`.

## Architecture

- `server.mjs` — dependency-free HTTP server and API routes.
- `src/repository.mjs` — GitHub URL parsing, metadata/tree retrieval, source selection, and compact context creation.
- `src/curriculum.mjs` — structured model calls plus the evidence-grounded local curriculum and lesson generator.
- `public/` — the authored landing, trail, lesson, quiz, loading, and error experience.

Repository sessions live in server memory for three hours. There is no authentication or persistent progress in this MVP.

## Verify

```bash
npm test
```

The tests cover URL validation, noise filtering, entry-point prioritization, context bounding, repository-specific trail generation, and grounded lesson generation.
