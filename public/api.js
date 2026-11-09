export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function post(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    throw new ApiError("We couldn't reach the Tell-itty server. Check that it's still running.", "NETWORK");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error?.message || "That request couldn't be completed.", payload.error?.code || "UNKNOWN");
  return payload;
}

export async function analyzeRepo(repoUrl) {
  const result = await post("/api/analyze-repo", { repoUrl });
  if (!result.analysis?.learningTrail?.length) throw new ApiError("We read the repository, but no learning trail came back.", "EMPTY_TRAIL");
  return result;
}

export async function generateLesson(sessionId, lessonId) {
  const result = await post("/api/generate-lesson", { sessionId, lessonId });
  const { lesson } = result;
  if (!lesson?.check?.choices?.length || !lesson.code?.length) throw new ApiError("That lesson came back incomplete.", "BAD_LESSON");
  return result;
}
