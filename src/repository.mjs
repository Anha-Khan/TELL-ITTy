import { extractLocalImports, isTestPath } from "./codeGraph.mjs";

const SOURCE_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "php", "java", "kt", "kts",
  "go", "rs", "c", "h", "cpp", "cc", "hpp", "cs", "swift", "vue", "svelte", "html",
  "css", "scss", "sass", "less", "sql", "sh", "bash", "zsh", "lua", "dart", "ex", "exs"
]);

const MANIFEST_NAMES = new Set([
  "package.json", "deno.json", "deno.jsonc", "pyproject.toml", "requirements.txt",
  "cargo.toml", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts", "gemfile",
  "composer.json", "pubspec.yaml", "mix.exs", "makefile", "cmakelists.txt", "dockerfile"
]);

const IGNORED_SEGMENTS = new Set([
  ".git", "node_modules", "vendor", "dist", "build", ".next", ".nuxt", "coverage",
  "target", "obj", ".cache", ".idea", ".vscode", "__pycache__", "fixtures", "third_party",
  "third-party", "bower_components", ".venv", "venv", "site-packages", "generated", "__snapshots__"
]);

const IGNORED_FILES = /(?:\.min\.(?:js|css)$|\.map$|\.d\.ts$|\.generated\.|\.pb\.go$|(?:^|\/)(?:package-lock|yarn|pnpm-lock|bun|poetry|cargo|composer|gemfile)\.lock(?:\.json)?$|(?:^|\/)package-lock\.json$|(?:^|\/)\.env[^/]*$|(?:secrets?|credentials?)\.[^/]+$)/i;
const MAX_SOURCE_BYTES = 120_000;
const MAX_CHARACTERS_PER_FILE = 42_000;
const FIRST_PASS_FILES = 20;
const MAX_FILES = 34;
const MAX_TOTAL_CHARACTERS = 260_000;
const ENTRY_NAMES = /(?:^|\/)(?:main|index|app|server|client|program|cli|application|game|lib)\.(?:[cm]?[jt]sx?|py|rb|php|java|kt|go|rs|c|cc|cpp|cs|swift|vue|svelte)$/i;

export class AppError extends Error {
  constructor(message, status = 400, code = "REQUEST_ERROR") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function parseGitHubUrl(value) {
  const raw = String(value || "").trim();
  const ssh = raw.match(/^git@github\.com:(.+)$/i);
  const shorthand = /^[\w.-]+\/[\w.-]+$/.test(raw) && !/^github\.com\//i.test(raw);
  const normalized = ssh ? `https://github.com/${ssh[1]}`
    : shorthand ? `https://github.com/${raw}`
    : /^(?:www\.)?github\.com\//i.test(raw) ? `https://${raw}`
    : raw;

  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new AppError("That's not a GitHub repo link.", 400, "INVALID_URL");
  }

  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    throw new AppError("Only github.com repos for now.", 400, "INVALID_HOST");
  }

  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new AppError("That link is missing the repo name.", 400, "INVALID_URL");
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new AppError("That's not a GitHub repo link.", 400, "INVALID_URL");
  }

  return { owner, repo, canonicalUrl: `https://github.com/${owner}/${repo}` };
}

export function isUsefulPath(path, size = 0) {
  const lower = path.toLowerCase();
  const segments = lower.split("/");
  if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) return false;
  if (IGNORED_FILES.test(lower)) return false;
  const name = segments.at(-1);
  const extension = name.includes(".") ? name.split(".").at(-1) : "";
  // READMEs are worth reading however long they are: content is truncated on fetch.
  if (segments.length === 1 && name.startsWith("readme")) return true;
  if (size > MAX_SOURCE_BYTES) return false;
  return MANIFEST_NAMES.has(name) || SOURCE_EXTENSIONS.has(extension);
}

export function scorePath(path, size = 0) {
  const lower = path.toLowerCase();
  const segments = lower.split("/");
  const name = segments.at(-1);
  let score = 0;
  if (segments.length === 1 && name.startsWith("readme")) score += 130;
  if (MANIFEST_NAMES.has(name)) score += segments.length === 1 ? 105 : 20;
  if (ENTRY_NAMES.test(lower)) score += 90;
  if (/^(src|source|app|lib|server|client|pkg|internal|cmd|core)\//.test(lower)) score += 28;
  if (/(route|controller|handler|service|model|store|state|component|view|screen|engine|parser|command|core|game|player|api)/.test(lower)) score += 22;
  if (/\.(?:css|scss|sass|less)$/.test(lower)) score -= 45;
  if (/(?:^|\/)types?(?:\/|\.)/.test(lower)) score -= 30;
  if (/\.config\.|(?:^|\/)\.[^/]+$/.test(lower)) score -= 40;
  if (isTestPath(lower)) score -= 120;
  score -= Math.max(0, segments.length - 2) * 6;
  // Small files are cheap to include; very large ones are less likely to be hand-written.
  score += Math.max(-12, 10 - Math.floor(size / 8000));
  return score;
}

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "tell-itty-mvp",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function githubJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AppError("Can't reach GitHub right now.", 502, "GITHUB_NETWORK");
  }

  if (response.status === 404) {
    throw new AppError("Not found. Is it private?", 404, "REPO_NOT_FOUND");
  }
  if (response.status === 409) {
    throw new AppError("That repo is empty.", 422, "EMPTY_REPO");
  }
  if (response.status === 451) {
    throw new AppError("GitHub has blocked access to that repository.", 403, "REPO_BLOCKED");
  }
  if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
    throw new AppError("GitHub says slow down. Try again soon.", 429, "GITHUB_RATE_LIMIT");
  }
  if (response.status === 403) {
    throw new AppError("GitHub refused access to that repository.", 403, "REPO_FORBIDDEN");
  }
  if (!response.ok) {
    throw new AppError(`GitHub returned an unexpected ${response.status} response.`, 502, "GITHUB_ERROR");
  }
  return response.json();
}

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

// One unreadable file must never sink the whole analysis, so failures return null.
async function fetchText(owner, repo, branch, path) {
  const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodePath(branch)}/${encodePath(path)}`;
  try {
    const response = await fetch(rawUrl, {
      headers: { "User-Agent": "tell-itty-mvp" },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.includes("\u0000")) return null;
    return text.slice(0, MAX_CHARACTERS_PER_FILE);
  } catch {
    return null;
  }
}

export async function ingestRepository(repoUrl) {
  const parsed = parseGitHubUrl(repoUrl);
  const base = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const metadata = await githubJson(base);

  if (metadata.private) {
    throw new AppError("Tell-itty can only read public repositories.", 403, "PRIVATE_REPO");
  }
  if (metadata.size === 0) {
    throw new AppError("That repo is empty.", 422, "EMPTY_REPO");
  }
  if (metadata.size > 300_000) {
    throw new AppError("Too big for now. Try a smaller repo.", 413, "REPO_TOO_LARGE");
  }

  const tree = await githubJson(`${base}/git/trees/${encodePath(metadata.default_branch)}?recursive=1`);
  if (tree.truncated) {
    throw new AppError("Too big for now. Try a smaller repo.", 413, "TREE_TOO_LARGE");
  }

  const allPaths = (tree.tree || []).filter((item) => item.type === "blob").map((item) => item.path);
  const pathSet = new Set(allPaths);
  const blobs = (tree.tree || [])
    .filter((item) => item.type === "blob" && isUsefulPath(item.path, item.size))
    .sort((a, b) => scorePath(b.path, b.size) - scorePath(a.path, a.size));

  if (!blobs.length) {
    throw new AppError("No readable code in there.", 422, "NO_SOURCE");
  }

  const fetchFiles = (items) => Promise.all(items.map(async (file) => ({
    path: file.path,
    size: file.size || 0,
    content: await fetchText(parsed.owner, parsed.repo, metadata.default_branch, file.path)
  })));
  const readable = (items) => items.filter((file) => file.content && file.content.trim());

  // First pass: the files most likely to matter by name and location.
  const files = readable(await fetchFiles(blobs.slice(0, FIRST_PASS_FILES)));
  if (!files.length) {
    throw new AppError("We could read the file tree, but not the selected source files.", 502, "CONTENT_UNAVAILABLE");
  }

  // Second pass: whatever those files import, because real dependencies beat name guessing.
  const byPath = new Map(blobs.map((item) => [item.path, item]));
  const have = new Set(files.map((file) => file.path));
  let characters = files.reduce((total, file) => total + file.content.length, 0);
  for (let round = 0; round < 2 && files.length < MAX_FILES; round++) {
    const wanted = [...new Set(files.flatMap((file) => extractLocalImports(file.path, file.content, pathSet)))]
      .filter((path) => !have.has(path) && byPath.has(path) && !isTestPath(path))
      .sort((a, b) => scorePath(b, byPath.get(b).size) - scorePath(a, byPath.get(a).size))
      .slice(0, MAX_FILES - files.length);
    if (!wanted.length) break;
    for (const file of readable(await fetchFiles(wanted.map((path) => byPath.get(path))))) {
      have.add(file.path);
      if (characters + file.content.length > MAX_TOTAL_CHARACTERS) continue;
      files.push(file);
      characters += file.content.length;
    }
  }

  return {
    repository: {
      owner: parsed.owner,
      name: metadata.name,
      fullName: metadata.full_name,
      url: metadata.html_url,
      description: metadata.description || "",
      language: metadata.language || "Unknown",
      stars: metadata.stargazers_count,
      defaultBranch: metadata.default_branch,
      updatedAt: metadata.updated_at
    },
    tree: allPaths.slice(0, 1200),
    files,
    selection: {
      discoveredFileCount: allPaths.length,
      analyzedFileCount: files.length,
      analyzedPaths: files.map((file) => file.path)
    }
  };
}

export function compactRepositoryContext(context, maxCharacters = 110_000) {
  const treeText = context.tree.slice(0, 500).join("\n");
  const header = [
    `Repository: ${context.repository.fullName}`,
    `Description: ${context.repository.description || "(none)"}`,
    `Primary language: ${context.repository.language}`,
    `Default branch: ${context.repository.defaultBranch}`,
    `Selected ${context.selection.analyzedFileCount} of ${context.selection.discoveredFileCount} files.`,
    "",
    "FILE TREE:",
    treeText,
    "",
    "SELECTED FILE CONTENTS:"
  ].join("\n");

  let output = header;
  for (const file of context.files) {
    const section = `\n\n--- ${file.path} ---\n${file.content}`;
    if (output.length + section.length > maxCharacters) break;
    output += section;
  }
  return output;
}
