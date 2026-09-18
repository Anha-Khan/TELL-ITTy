# Tell-itty — Idea

## One-line product
**Paste a public GitHub repository. Tell-itty turns the codebase into a project-specific learning trail and teaches the student what they built, one meaningful module and execution flow at a time.**

## Problem
Students increasingly use AI to help build projects. The project may run, but the student can still struggle to answer basic questions such as:
- Where does execution begin?
- Why does this file exist?
- What happens after I click this button?
- How do the frontend, API and database connect?
- Which code is core and which code is supporting infrastructure?
- What would break if I changed this function?

A generic chatbot can answer questions, but the learner must know what to ask. Raw documentation can describe files without creating understanding.

## Target user
A student or beginner developer who has a working or partially working project — especially one created with AI assistance — and wants to genuinely understand the codebase well enough to explain, modify and learn from it.

## Core promise
**You built it. Now understand it.**

Tell-itty does not merely summarize a repository. It first builds a mental model of the project, then decides what the learner should understand and in what order.

## Input
For the MVP: one **public GitHub repository URL**.

The product must be stack-agnostic. A C game, React website, full-stack application, Python CLI or another readable software repository should produce different learning trails based on the actual project.

## Output
1. A concise project orientation: what it is, stack, important entry points and major systems.
2. A dynamically generated **Learning Trail** ordered by conceptual dependency, not alphabetically and not simply file-by-file.
3. Focused lessons that use excerpts from the learner's own code.
4. Connections between modules/files so the student sees how the project works as a system.
5. Small understanding checks based on prediction and reasoning.
6. Tiny “try it” exercises that encourage the learner to safely modify or trace their own code.

## The key differentiator
A chatbot waits for questions. **Tell-itty determines what the learner needs to learn next.**

A documentation generator describes a codebase. **Tell-itty teaches a mental model of the codebase.**

A repository tree groups files. **Tell-itty groups concepts, responsibilities and execution/data flows.**

## Product principles
- Teach concepts and flows, not folders.
- Use the student's real code whenever possible.
- Explain *why* before *how*.
- One learning objective at a time.
- Progressive disclosure: simple first, deeper only when requested.
- Never pretend certainty when repository evidence is incomplete.
- Prefer concrete names from the repo over generic programming examples.
- Make the student predict, connect and modify — not merely read.
- Keep the interface calm enough that the code remains the subject.

## MVP screens
### 1. Landing / Repository input
A single strong promise, GitHub URL field and obvious **Start Learning** action.

### 2. Project Map / Learning Trail
After analysis, show what Tell-itty discovered and a short ordered trail. The learner should immediately understand: “This app has figured out how my project fits together.”

### 3. Lesson
One lesson at a time. It should contain only what is needed for the current objective: key idea, relevant code, explanation/visual, connection to the larger project, one understanding check, and Next.

## Out of scope for the one-hour MVP
- Authentication
- Private repositories
- Teams/social features
- PDF/document export
- General-purpose chat as the primary experience
- Complex databases or persistent progress
- Full IDE/code execution
- Teaching every file
- Perfect support for every programming language

## Demo success criteria
A judge pastes a public repo (or sees the prepared demo repo) and within seconds can see:
1. Tell-itty correctly recognizes the kind of project.
2. The generated learning trail is specific to that repository.
3. Opening a lesson teaches one important concept using real code.
4. The lesson connects that code to another part of the project.
5. The understanding check requires reasoning rather than trivia.

The demo should make the value understandable without a long pitch.

## Product voice
Curious, warm, concise and intelligent. It should feel like a patient senior student sitting beside a junior — never childish, never corporate, never overly enthusiastic.

Avoid AI filler such as “Let's dive in!”, “Great question!”, “In today's fast-paced world”, “powerful”, “seamlessly”, or unnecessary motivational paragraphs.

## Suggested microcopy
Brand: **tell-itty**
Tagline: **you built it. now understand it.**
Input helper: **Paste a public GitHub repo. We'll find the trail through it.**
Analysis state: **finding the shape of your project…**
Trail reveal: **Tell-itty found your learning trail.**
Lesson helper: **one thing at a time.**
