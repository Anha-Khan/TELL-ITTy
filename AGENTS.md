# Tell-itty — Agent Instructions

## Mission
Build the smallest convincing version of Tell-itty: a public GitHub repository becomes a repository-specific learning trail, and the learner can open lessons that teach the project using its own code.

The quality bar is **coherent student product**, not feature quantity. It should feel deliberately designed, technically believable and immediately understandable in a short judge demo.

## Read first
Before changing code, read:
1. `idea.md`
2. `teaching.md`
3. `design.md`
4. `plan.md`

Treat those files as product requirements. If implementation convenience conflicts with the core idea, preserve the core idea.

## Non-negotiable product behavior
- Accept a public GitHub repository URL.
- Validate the URL and show a useful error for invalid/private/unreachable repositories.
- Retrieve a useful repository representation: tree plus relevant text/source files.
- Ignore obvious noise and oversized/generated/binary content.
- Analyze the repository before generating lessons.
- Generate a project-specific learning trail. Never hardcode “game loop”, React, websites or any single stack into the curriculum.
- Teach concepts/flows rather than listing every file.
- Let the user open one lesson at a time.
- Use actual file paths and actual repository excerpts.
- Include one understanding check in the lesson experience.
- Keep API secrets server-side. Never expose the OpenAI API key in browser code or commit it.

## OpenAI integration
The human will provide the OpenAI API key. Implement the rest of the integration and use an environment variable such as `OPENAI_API_KEY`.

Prefer a simple server endpoint such as:
- `POST /api/analyze-repo`
- `POST /api/generate-lesson`

Use structured JSON output matching `teaching.md`. Validate model output before rendering it. If parsing fails, show a recoverable error rather than breaking the page.

Do not send the entire repository blindly. Build a compact context:
- README and manifest/build/config files when useful
- repository tree
- source files likely to matter
- entry points
- files referenced by imports/includes when feasible

Exclude examples such as `.git`, `node_modules`, `dist`, `build`, vendored dependencies, binary/media files, minified bundles, large lockfiles and secrets.

For a one-hour prototype, prioritize reliability over sophisticated retrieval. A simple deterministic file-selection heuristic is acceptable.

## GitHub integration
For public repos, parse owner/repository from the URL and retrieve repository metadata/tree/content through GitHub's public API or raw content endpoints as appropriate.

Handle:
- malformed URL
- repository not found
- rate limit / network error
- empty or unsupported repository
- repository too large for the prototype

Never claim the app analyzed files it did not receive.

## UI implementation rules
- Follow `design.md` and the supplied reference image closely.
- Do not redesign into a generic SaaS dashboard.
- Do not add gradients, neon AI colors, glassmorphism, excessive pills/cards or generic robot/sparkle branding.
- Preserve whitespace.
- Keep primary actions unmistakable.
- Use maroon as the primary accent, black/ink for structure, warm textured white/cream as the canvas.
- Cats are visual identity, not UI clutter.
- Prefer one dominant task per screen.
- Desktop first for the demo; make it reasonably responsive only if time remains.

## Code quality rules
- Inspect existing project structure before editing.
- Reuse working setup and dependencies when possible.
- Avoid unnecessary packages.
- Keep components small and named by responsibility.
- Keep data/API logic separate from presentational components.
- No dead buttons in the main demo path.
- No lorem ipsum.
- No fake “AI analyzing” results presented as real when an API call failed. A clearly labeled demo fallback is acceptable only if intentionally implemented for presentation resilience.
- Preserve console cleanliness where practical.

## Suggested frontend components
Names are flexible; responsibilities are not.
- `RepoInput`
- `AnalysisLoading`
- `ProjectSummary`
- `LearningTrail`
- `TrailStep`
- `LessonView`
- `CodeExcerpt`
- `MentalModel`
- `UnderstandingCheck`
- `ErrorState`

## State machine
Keep the product understandable as a small state machine:
`idle → validating → fetching → analyzing → trailReady → lessonLoading → lessonReady`

Errors should return the user to a recoverable state.

## Loading experience
Analysis can take time. Make the wait feel intentional with short changing status text, for example:
- reading the repo…
- finding the entry points…
- tracing how the pieces connect…
- building your learning trail…

Do not fake percentage progress.

## Demo resilience
The prepared demo repository must work before optional polish.

If time allows, cache the analysis in browser/session state so returning to a lesson does not repeat the expensive analysis call.

## Definition of done
The MVP is done when this path works:
1. Open landing page.
2. Paste public repo URL.
3. Start Learning.
4. See meaningful analysis/loading state.
5. See a repository-specific trail.
6. Open a lesson.
7. Read a concise explanation grounded in real code.
8. Answer an understanding check.
9. Move to the next lesson.

Anything outside that path is secondary.
