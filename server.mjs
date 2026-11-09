import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { AppError, ingestRepository, parseGitHubUrl } from "./src/repository.mjs";
import { analyzeRepository, generateLesson } from "./src/curriculum.mjs";

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") console.warn("Could not read .env:", error.message);
}

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "public");
const sessions = new Map();
const analysesInFlight = new Map();
const MAX_BODY_BYTES = 24_000;
const MAX_SESSIONS = 40;
const SESSION_TTL_MS = 1000 * 60 * 60 * 3;
const ANALYSIS_REUSE_MS = 1000 * 60 * 20;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new AppError("Request body is too large.", 413, "BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new AppError("The request body must be valid JSON.", 400, "INVALID_JSON");
  }
}

// Re-analyzing the same repo costs GitHub quota and model tokens for nothing,
// so recent results are reused and simultaneous requests share one run.
async function analyzeOnce(repoUrl) {
  const { canonicalUrl } = parseGitHubUrl(repoUrl);
  const key = canonicalUrl.toLowerCase();
  for (const [sessionId, session] of sessions) {
    if (session.key === key && Date.now() - session.createdAt < ANALYSIS_REUSE_MS) return { sessionId, session };
  }
  if (!analysesInFlight.has(key)) {
    const work = (async () => {
      const context = await ingestRepository(repoUrl);
      const result = await analyzeRepository(context);
      const sessionId = randomUUID();
      const session = { key, context, result, analysis: result.analysis, lessons: new Map(), createdAt: Date.now() };
      sessions.set(sessionId, session);
      if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
      return { sessionId, session };
    })().finally(() => analysesInFlight.delete(key));
    analysesInFlight.set(key, work);
  }
  return analysesInFlight.get(key);
}

function publicSession(context, result, sessionId) {
  return {
    sessionId,
    repository: context.repository,
    selection: context.selection,
    ...result
  };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      modelAssistance: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || "gpt-5-mini") : null
    });
  }

  if (request.method === "POST" && url.pathname === "/api/analyze-repo") {
    const { repoUrl } = await readJson(request);
    const { sessionId, session } = await analyzeOnce(repoUrl);
    return sendJson(response, 200, publicSession(session.context, session.result, sessionId));
  }

  if (request.method === "POST" && url.pathname === "/api/generate-lesson") {
    const { sessionId, lessonId } = await readJson(request);
    const session = sessions.get(sessionId);
    if (!session) throw new AppError("This learning session expired. Analyze the repository again.", 410, "SESSION_EXPIRED");
    const selectedLesson = session.analysis.learningTrail.find((lesson) => lesson.id === String(lessonId));
    if (!selectedLesson) throw new AppError("That lesson is not part of this learning trail.", 404, "LESSON_NOT_FOUND");
    if (!session.lessons.has(selectedLesson.id)) {
      session.lessons.set(selectedLesson.id, generateLesson(session.context, session.analysis, selectedLesson).catch((error) => {
        session.lessons.delete(selectedLesson.id);
        throw error;
      }));
    }
    return sendJson(response, 200, await session.lessons.get(selectedLesson.id));
  }

  if (url.pathname.startsWith("/api/")) {
    return sendJson(response, 404, { error: { code: "NOT_FOUND", message: "API route not found." } });
  }
  return false;
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    decoded = "/index.html";
  }
  const filePath = resolve(PUBLIC_DIR, `.${decoded}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${sep}`)) {
    return sendJson(response, 403, { error: { code: "FORBIDDEN", message: "Forbidden." } });
  }

  let finalPath = filePath;
  try {
    if ((await stat(finalPath)).isDirectory()) finalPath = resolve(finalPath, "index.html");
    const body = await readFile(finalPath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(finalPath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": /\.(?:html|css|js)$/.test(finalPath) ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    response.end(body);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
    if (extname(decoded)) return sendJson(response, 404, { error: { code: "NOT_FOUND", message: "File not found." } });
    const body = await readFile(resolve(PUBLIC_DIR, "index.html"));
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    response.end(body);
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const handled = await handleApi(request, response, url);
    if (handled !== false) return;
    if (!new Set(["GET", "HEAD"]).has(request.method)) {
      return sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    if (!(error instanceof AppError)) console.error(error);
    const message = error instanceof AppError ? error.message : "Something went wrong on our side. Try again.";
    sendJson(response, status, { error: { code, message } });
  }
});

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [key, value] of sessions) if (value.createdAt < cutoff) sessions.delete(key);
}, 1000 * 60 * 30).unref();

server.listen(PORT, () => {
  console.log(`Tell-itty is ready at http://localhost:${PORT}`);
  console.log(process.env.OPENAI_API_KEY ? "Model-assisted teaching is enabled." : "No OPENAI_API_KEY found: lessons are built from the code's structure only." );
});
