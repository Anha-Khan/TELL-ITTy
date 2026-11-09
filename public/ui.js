// Small presentational helpers shared by the screens.

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Prose from lessons uses `backticks` for identifiers and paths.
export function prose(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function icon(name, className = "") {
  return `<svg class="icon ${className}" aria-hidden="true"><use href="#${name}"></use></svg>`;
}

export function brand() {
  return `<a class="brand" href="#/" aria-label="Tell-itty home"><span>tell-itty</span><img class="brand-cat" src="/assets/cat.png" alt=""></a>`;
}

const KEYWORDS = "abstract|async|await|bool|boolean|break|case|catch|char|class|const|continue|def|default|defer|double|elif|else|enum|except|export|extends|false|final|finally|float|fn|for|from|func|function|go|if|impl|implements|import|in|include|int|interface|let|long|match|mod|mut|new|nil|None|not|null|or|package|pass|private|protected|pub|public|raise|return|self|short|static|struct|super|switch|this|throw|trait|True|False|true|try|type|typedef|undefined|unsigned|use|var|void|while|with|yield";

const HASH_LANGUAGES = new Set(["Python", "Ruby", "Shell", "Elixir"]);
const PLAIN_LANGUAGES = new Set(["Markdown", "Text", "JSON"]);

export function highlightLine(line, language) {
  if (PLAIN_LANGUAGES.has(language)) return escapeHtml(line);
  const comment = HASH_LANGUAGES.has(language) ? "#.*$" : "\\/\\/.*$|\\/\\*.*?(?:\\*\\/|$)|^\\s*\\*.*$";
  const pattern = new RegExp(`(${comment})|("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|\\b(${KEYWORDS})\\b|\\b(\\d[\\d_.]*)\\b`, "g");
  let html = "";
  let cursor = 0;
  for (const match of line.matchAll(pattern)) {
    html += escapeHtml(line.slice(cursor, match.index));
    const kind = match[1] ? "c" : match[2] ? "s" : match[3] ? "k" : "n";
    html += `<span class="t-${kind}">${escapeHtml(match[0])}</span>`;
    cursor = match.index + match[0].length;
  }
  return html + escapeHtml(line.slice(cursor));
}
