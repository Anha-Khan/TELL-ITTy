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
  "target", "bin", "obj", ".cache", ".idea", ".vscode", "__pycache__", "fixtures"
]);

const IGNORED_FILES = /(?:\.min\.(?:js|css)$|\.map$|(?:^|\/)(?:package-lock|yarn\.lock|pnpm-lock|bun\.lockb|poetry\.lock|cargo\.lock)$)/i;
const ENTRY_NAMES = /(?:^|\/)(?:main|index|app|server|client|program|cli|application|game|src\/lib)\.(?:[cm]?[jt]sx?|py|rb|php|java|kt|go|rs|c|cc|cpp|cs|swift|vue|svelte)$/i;

export class AppError extends Error {
  constructor(message, status = 400, code = "REQUEST_ERROR") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function parseGitHubUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new AppError("Paste a full GitHub URL, like https://github.com/username/repo.", 400, "INVALID_URL");
  }

  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    throw new AppError("Tell-itty currently reads public repositories on github.com.", 400, "INVALID_HOST");
  }

  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new AppError("That URL is missing an owner or repository name.", 400, "INVALID_URL");
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new AppError("That doesn't look like a valid GitHub repository URL.", 400, "INVALID_URL");
  }

  return { owner, repo, canonicalUrl: `https://github.com/${owner}/${repo}` };
}

export function isUsefulPath(path, size = 0) {
  const lower = path.toLowerCase();
  const segments = lower.split("/");
  if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) return false;
  if (IGNORED_FILES.test(lower) || size > 45_000) return false;
  const name = segments.at(-1);
  const extension = name.includes(".") ? name.split(".").at(-1) : "";
  return lower.startsWith("readme") || MANIFEST_NAMES.has(name) || SOURCE_EXTENSIONS.has(extension);
}

export function scorePath(path, size = 0) {
  const lower = path.toLowerCase();
  const name = lower.split("/").at(-1);
  let score = 0;
  if (lower.startsWith("readme")) score += 120;
  if (MANIFEST_NAMES.has(name)) score += 105;
  if (ENTRY_NAMES.test(lower)) score += 90;
  if (/^(src|app|lib|server|client)\//.test(lower)) score += 28;
  if (/(route|controller|handler|service|model|store|state|component|view|screen|engine|parser|command)/.test(lower)) score += 22;
  if (/(test|spec|stories|mock|example|demo)/.test(lower)) score -= 22;
  score += Math.max(0, 18 - Math.floor(size / 2500));
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
    throw new AppError("GitHub could not be reached. Check your connection and try again.", 502, "GITHUB_NETWORK");
  }

  if (response.status === 404) {
    throw new AppError("We couldn't find that public repository. Check the URL or its visibility.", 404, "REPO_NOT_FOUND");
  }
  if (response.status === 403 || response.status === 429) {
    throw new AppError("GitHub's public rate limit was reached. Try again shortly or add GITHUB_TOKEN.", 429, "GITHUB_RATE_LIMIT");
  }
  if (!response.ok) {
    throw new AppError(`GitHub returned an unexpected ${response.status} response.`, 502, "GITHUB_ERROR");
  }
  return response.json();
}

async function fetchText(owner, repo, branch, path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
  const response = await fetch(rawUrl, {
    headers: { "User-Agent": "tell-itty-mvp" },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) return null;
  const text = await response.text();
  if (text.includes("\u0000")) return null;
  return text.slice(0, 42_000);
}

export async function ingestRepository(repoUrl) {
  const parsed = parseGitHubUrl(repoUrl);
  const base = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const metadata = await githubJson(base);

  if (metadata.private) {
    throw new AppError("Tell-itty's MVP can only read public repositories.", 403, "PRIVATE_REPO");
  }
  if (metadata.size > 300_000) {
    throw new AppError("This repository is too large for the prototype. Try a smaller public project.", 413, "REPO_TOO_LARGE");
  }

  const tree = await githubJson(`${base}/git/trees/${encodeURIComponent(metadata.default_branch)}?recursive=1`);
  if (tree.truncated) {
    throw new AppError("This repository's file tree is too large for the prototype.", 413, "TREE_TOO_LARGE");
  }

  const blobs = (tree.tree || [])
    .filter((item) => item.type === "blob" && isUsefulPath(item.path, item.size))
    .sort((a, b) => scorePath(b.path, b.size) - scorePath(a.path, a.size));

  if (!blobs.length) {
    throw new AppError("We found the repository, but not enough readable source text to build a trail.", 422, "NO_SOURCE");
  }

  const selected = [];
  let budget = 0;
  for (const file of blobs) {
    if (selected.length >= 24 || budget + Math.min(file.size || 0, 42_000) > 150_000) continue;
    selected.push(file);
    budget += Math.min(file.size || 0, 42_000);
  }

  const contents = await Promise.all(selected.map(async (file) => ({
    path: file.path,
    size: file.size || 0,
    content: await fetchText(parsed.owner, parsed.repo, metadata.default_branch, file.path)
  })));

  const files = contents.filter((file) => file.content && file.content.trim());
  if (!files.length) {
    throw new AppError("We could read the file tree, but not the selected source files.", 502, "CONTENT_UNAVAILABLE");
  }

  return {
    repository: {
      owner: parsed.owner,
      name: metadata.name,
      fullName: metadata.full_name,
      url: metadata.html_url,
      description: metadata.description || "No repository description provided.",
      language: metadata.language || "Unknown",
      stars: metadata.stargazers_count,
      defaultBranch: metadata.default_branch,
      updatedAt: metadata.updated_at
    },
    tree: (tree.tree || []).filter((item) => item.type === "blob").map((item) => item.path).slice(0, 1200),
    files,
    selection: {
      discoveredFileCount: (tree.tree || []).filter((item) => item.type === "blob").length,
      analyzedFileCount: files.length,
      analyzedPaths: files.map((file) => file.path)
    }
  };
}

export function compactRepositoryContext(context, maxCharacters = 110_000) {
  const treeText = context.tree.slice(0, 500).join("\n");
  const header = [
    `Repository: ${context.repository.fullName}`,
    `Description: ${context.repository.description}`,
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
