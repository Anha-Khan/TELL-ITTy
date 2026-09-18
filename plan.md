# Tell-itty — 60-Minute Build Plan

## Goal
Ship one complete, judge-ready vertical slice. Do not attempt the full future product.

## Before the timer / immediately
- Put `idea.md`, `teaching.md`, `agents.md`, `design.md` and this file in the project root.
- Put `design-reference.png` beside `design.md`.
- Have one known public demo repository URL ready.
- Add the OpenAI API key only to local/server environment configuration; never client code.

## Minute 0–5 — Inspect and lock scope
- Run the existing app.
- Inspect package scripts and current structure.
- Confirm the shortest path to a working server/API route.
- Do not change stack unless the existing setup cannot support the demo.

**Checkpoint:** landing app runs locally.

## Minute 5–15 — Build the visual shell
Implement only the essential desktop views from `design.md`:
- Landing / repo input
- Learning Trail
- Lesson

Create the palette, typography, paper texture, buttons and black-cat identity once and reuse them.

**Checkpoint:** the product already looks recognizably Tell-itty with static data.

## Minute 15–27 — Repository ingestion
Implement:
1. Parse GitHub public repo URL.
2. Fetch repository metadata/tree.
3. Select useful source/text files.
4. Build compact repository context.
5. Handle invalid repo/network/too-large states.

Test against the prepared repo.

**Checkpoint:** server can return a compact real representation of the demo repo.

## Minute 27–39 — Repository analysis call
Implement `analyze-repo` using the analysis prompt/schema from `teaching.md`.

Render returned:
- project summary
- stack/type
- Learning Trail

Add the purposeful loading states.

**Checkpoint:** different repository structures can produce different lesson titles; nothing is hardcoded to the game demo.

## Minute 39–49 — Lesson call
On trail-step click:
- send analysis + selected lesson + relevant repo evidence
- generate structured lesson
- render title, why it matters, mental model, real code excerpt, concise walkthrough and connection

Do not build advanced chat.

**Checkpoint:** one complete lesson is genuinely useful.

## Minute 49–54 — Understanding check
Render one multiple-choice/prediction question.
- Obvious selected state
- **Check answer** button
- concise explanation after submission
- **Next lesson** action

**Checkpoint:** learner performs an action rather than only reading.

## Minute 54–58 — Failure-proof the demo
Test the exact judge path from a fresh load.
Fix only blockers:
- API errors
- overflow
- unreadable code
- broken buttons
- missing loading states
- malformed model output

If needed, add a clearly controlled fallback for the prepared demo repository so a temporary external failure does not destroy the presentation. The live path should remain real.

## Minute 58–60 — Demo preparation
Prepare a 30–45 second explanation:

> “A lot of students can now build projects with AI before they can fully explain the code. Tell-itty takes a public GitHub repo, understands how that particular project works, and creates the learning order for you. It doesn't just document files. Here it found the important flow, teaches one concept using the student's actual code, connects it to the rest of the project, and checks whether they understood it.”

Then demonstrate, don't keep talking.

## Priority order if behind schedule
1. Beautiful functional landing
2. Real repo ingestion
3. Real repository-specific trail
4. One excellent lesson
5. Understanding check
6. Everything else

If there are only 10 minutes left, do **not** build Notes, settings, accounts, search, playground or animations.

## Judge-facing quality checklist
- Can the value be understood in five seconds?
- Is the problem recognizably student-relevant?
- Does the repo visibly affect the generated curriculum?
- Does the app teach rather than summarize?
- Is real code shown with its path?
- Does the UI feel authored rather than template-generated?
- Is every visible primary button functional?
- Can you explain the architecture simply?
- Is the scope small enough that the demo feels finished?
