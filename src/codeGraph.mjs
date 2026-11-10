// A small, language-tolerant static reader. It finds where functions are defined and
// which ones call each other, so lessons and quiz answers can be derived from facts in
// the code instead of templates. It is regex-based on purpose: good enough to teach
// from, with no parser dependency per language.

const INDENT_LANGUAGES = new Set(["py", "rb", "ex", "exs", "lua"]);
const HASH_COMMENTS = new Set(["py", "rb", "sh", "bash", "zsh", "ex", "exs"]);

const NOT_A_FUNCTION = new Set([
  "if", "else", "for", "while", "switch", "case", "catch", "return", "function", "typeof", "await", "yield",
  "new", "delete", "throw", "sizeof", "do", "try", "super", "this", "self", "def", "fn", "func", "match", "with",
  "import", "require", "export", "from", "print", "println", "printf", "assert", "elif", "except", "lambda", "not", "and", "or", "in", "is",
  "constructor", "main_loop"
]);

const COMMON_MEMBER_NAMES = new Set([
  "get", "set", "has", "add", "delete", "map", "filter", "reduce", "find", "push", "pop", "join", "split", "slice", "then", "catch",
  "finally", "json", "text", "keys", "values", "entries", "toString", "update", "render", "close", "open", "start", "stop", "run", "init",
  "read", "write", "send", "next", "clone", "parse", "format", "append", "remove", "length", "sort", "log", "error", "warn"
]);

const TEST_PATH = /(?:^|\/)(?:tests?|__tests__|specs?|e2e|examples?|demos?|fixtures?|mocks?|stories|benchmarks?|benches)(?:\/|$)|[._-](?:test|spec|stories)\.[^/]+$|(?:^|\/)(?:test_[^/]+|bench(?:mark)?s?\.[^/]+)$/i;

export const isTestPath = (path) => TEST_PATH.test(path);

export function extensionOf(path) {
  const name = path.split("/").at(-1);
  return name.includes(".") ? name.split(".").at(-1).toLowerCase() : "";
}

const JS_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte"];

const definitionPatterns = {
  js: [
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[(<]/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\(.*\)\s*(?::[^=]+)?=>|\($|[A-Za-z_$][\w$]*\s*=>|<[^>]*>\s*\()/,
    /^\s+(?:(?:public|private|protected|static|async|override|readonly|get|set)\s+)*#?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/,
    /^\s+(?:(?:public|private|protected|static|readonly)\s+)*#?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(.*\)\s*(?::[^=]+)?=>/
  ],
  py: [/^\s*(?:async\s+)?def\s+(\w+)\s*\(/],
  go: [/^func\s+(?:\([^)]*\)\s*)?(\w+)\s*[(\[]/],
  rs: [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/],
  rb: [/^\s*def\s+(?:self\.)?(\w+[?!]?)/],
  ex: [/^\s*defp?\s+(\w+[?!]?)/],
  php: [/^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?(\w+)\s*\(/],
  lua: [/^\s*(?:local\s+)?function\s+(?:[\w.]+[.:])?(\w+)\s*\(/],
  swift: [/^\s*(?:(?:public|private|internal|fileprivate|open|static|class|override|mutating)\s+)*func\s+(\w+)/],
  kt: [/^\s*(?:(?:public|private|internal|protected|override|suspend|inline)\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)\s*\(/],
  cLike: [
    /^(?:[A-Za-z_][\w:<>,]*[\s*&]+)+[*&]*([A-Za-z_~][\w:~]*)\s*\([^;]*$/,
    /^\s+(?:(?:public|private|protected|internal|static|final|override|async|virtual|abstract|synchronized)\s+)+(?:[\w<>,[\]?.]+\s+)+(\w+)\s*\([^;]*$/
  ]
};

const classPatterns = {
  js: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Z][\w$]*)/,
  py: /^\s*class\s+(\w+)/,
  rb: /^\s*class\s+(\w+)/,
  php: /^\s*(?:abstract\s+|final\s+)?class\s+(\w+)/,
  swift: /^\s*(?:(?:public|final|open)\s+)*(?:class|struct)\s+(\w+)/,
  kt: /^\s*(?:(?:public|open|data|abstract)\s+)*class\s+(\w+)/,
  cLike: /^\s*(?:(?:public|final|abstract|static|internal)\s+)*class\s+(\w+)/
};

function familyOf(extension) {
  if (JS_EXTENSIONS.includes(extension)) return "js";
  if (["ex", "exs"].includes(extension)) return "ex";
  if (["kt", "kts"].includes(extension)) return "kt";
  if (definitionPatterns[extension]) return extension;
  if (["c", "h", "cpp", "cc", "hpp", "java", "cs", "dart"].includes(extension)) return "cLike";
  return null;
}

// Blanks out strings and comments, keeping every character position, so braces and
// call-looking text inside them cannot confuse the scanners below.
export function maskSource(content, extension) {
  const hash = HASH_COMMENTS.has(extension);
  const output = [];
  let inBlock = false;
  let multiline = null;

  for (const line of content.split("\n")) {
    let masked = "";
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const pair = line.slice(i, i + 2);
      const triple = line.slice(i, i + 3);
      if (inBlock) {
        if (pair === "*/") { inBlock = false; masked += "  "; i++; } else masked += " ";
        continue;
      }
      if (multiline) {
        if (line.startsWith(multiline, i) && line[i - 1] !== "\\") { masked += " ".repeat(multiline.length); i += multiline.length - 1; multiline = null; } else masked += " ";
        continue;
      }
      if (quote) {
        if (char === "\\") { masked += "  "; i++; continue; }
        if (char === quote) quote = null;
        masked += " ";
        continue;
      }
      if (!hash && pair === "//") { masked += " ".repeat(line.length - i); break; }
      if (hash && char === "#") { masked += " ".repeat(line.length - i); break; }
      if (!hash && pair === "/*") { inBlock = true; masked += "  "; i++; continue; }
      if (extension === "py" && (triple === '"""' || triple === "'''")) { multiline = triple; masked += "   "; i += 2; continue; }
      if (char === "`" && extension !== "go") { multiline = "`"; masked += " "; continue; }
      if (char === '"' || char === "'") { quote = char; masked += " "; continue; }
      masked += char;
    }
    output.push(masked);
  }
  return output;
}

function blockEndForBraces(masked, start) {
  let depth = 0;
  let opened = false;
  for (let index = start; index < Math.min(masked.length, start + 500); index++) {
    for (const char of masked[index]) {
      if (char === "{") { depth++; opened = true; }
      if (char === "}") depth--;
    }
    if (opened && depth <= 0) return index;
    if (!opened && index - start >= 6) break;
  }
  if (opened) return Math.min(masked.length - 1, start + 500);
  // Expression-bodied arrow functions: run to the first line that closes its brackets.
  let round = 0;
  for (let index = start; index < Math.min(masked.length, start + 12); index++) {
    for (const char of masked[index]) {
      if ("([".includes(char)) round++;
      if (")]".includes(char)) round--;
    }
    if (round <= 0) return index;
  }
  return start;
}

function blockEndForIndent(masked, start) {
  const indent = masked[start].search(/\S/);
  let last = start;
  for (let index = start + 1; index < masked.length; index++) {
    const line = masked[index];
    if (!line.trim()) continue;
    const current = line.search(/\S/);
    if (current <= indent) return /^\s*end\b/.test(line) ? index : last;
    last = index;
  }
  return last;
}

function leadingDoc(lines, start) {
  const collected = [];
  for (let index = start - 1; index >= 0 && start - index < 8; index--) {
    const trimmed = lines[index].trim();
    // `#` counts as a comment only before a space: `#[inline]`, `#define` and `#endif` are code.
    if (!trimmed || !/^(?:\/\/|\/\*|\*|#+(?:\s|$)|--)/.test(trimmed)) break;
    collected.unshift(trimmed.replace(/^(?:\/\*\*?|\*\/|\*|\/\/+|#+|--)\s?/, "").replace(/\*\/$/, "").trim());
  }
  for (let index = 0; index < collected.length; index++) {
    // Javadoc and JSDoc markup: `{@code Entry}` → `Entry`, `<p>` → nothing.
    collected[index] = collected[index].replace(/\{@\w+\s+([^}]*)\}/g, "$1").replace(/<\/?[a-z][^>]*>/gi, "").trim();
  }
  if (!collected.length) {
    const next = (lines[start + 1] || "").trim();
    const match = next.match(/^(?:"""|''')(.+?)(?:"""|''')?$/);
    if (match) collected.push(match[1]);
  }
  const text = collected.filter((line) => line && !line.startsWith("@")).join(" ").trim();
  const sentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || text;
  return sentence.length > 8 && sentence.length < 180 ? sentence : "";
}

function findDefinitions(path, lines, masked) {
  const extension = extensionOf(path);
  const family = familyOf(extension);
  if (!family) return [];
  const indentBased = INDENT_LANGUAGES.has(extension);
  const definitions = [];

  masked.forEach((line, index) => {
    if (!line.trim()) return;
    let name = null;
    let kind = "function";
    const classMatch = classPatterns[family]?.exec(line);
    if (classMatch) {
      name = classMatch[1];
      kind = "class";
    } else {
      for (const pattern of definitionPatterns[family] || []) {
        const match = pattern.exec(line);
        if (match && !NOT_A_FUNCTION.has(match[1])) { name = match[1]; break; }
      }
    }
    if (!name) return;
    const endLine = indentBased ? blockEndForIndent(masked, index) : blockEndForBraces(masked, index);
    definitions.push({
      id: `${path}#${name}@${index + 1}`,
      name,
      kind,
      path,
      startLine: index + 1,
      endLine: endLine + 1,
      // Methods sit indented inside a class or module; Go methods name a receiver.
      member: /^\s/.test(line) || /^func\s*\(/.test(line),
      doc: leadingDoc(lines, index),
      calls: [],
      callers: []
    });
  });
  return definitions;
}

function resolveWithExtensions(base, tree, extensions) {
  const stripped = base.replace(/\.(?:m?js|cjs|jsx)$/, "");
  const candidates = [base];
  for (const extension of extensions) candidates.push(`${stripped}.${extension}`);
  for (const extension of extensions) candidates.push(`${stripped}/index.${extension}`);
  return candidates.find((candidate) => tree.has(candidate)) || null;
}

function normalizeRelative(fromPath, specifier) {
  const parts = fromPath.split("/").slice(0, -1);
  for (const piece of specifier.split("/")) {
    if (piece === "." || piece === "") continue;
    if (piece === "..") parts.pop();
    else parts.push(piece);
  }
  return parts.join("/");
}

// Returns repository paths this file imports. Package imports are ignored.
export function extractLocalImports(path, content, tree) {
  const extension = extensionOf(path);
  const found = new Set();
  const add = (candidate) => { if (candidate && candidate !== path) found.add(candidate); };
  const specifiersFrom = (pattern) => [...content.matchAll(pattern)].map((match) => match[1]);

  if (JS_EXTENSIONS.includes(extension)) {
    const specifiers = specifiersFrom(/(?:from\s+|import\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g);
    for (const specifier of specifiers) {
      let base = null;
      if (specifier.startsWith(".")) base = normalizeRelative(path, specifier);
      else if (/^[@~]\//.test(specifier)) base = `src/${specifier.slice(2)}`;
      if (base !== null) add(resolveWithExtensions(base, tree, JS_EXTENSIONS));
    }
  } else if (extension === "py") {
    for (const specifier of specifiersFrom(/^\s*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/gm).concat([...content.matchAll(/^\s*import\s+([\w.]+)/gm)].map((match) => match[1]))) {
      if (!specifier) continue;
      const leadingDots = specifier.match(/^\.*/)[0].length;
      const dotted = specifier.slice(leadingDots).replaceAll(".", "/");
      const roots = leadingDots
        ? [normalizeRelative(path, "../".repeat(leadingDots - 1) || ".")]
        : ["", "src", path.split("/").slice(0, -1).join("/")];
      for (const root of roots) {
        const base = [root, dotted].filter(Boolean).join("/");
        add([`${base}.py`, `${base}/__init__.py`].find((candidate) => tree.has(candidate)));
      }
    }
  } else if (["c", "h", "cpp", "cc", "hpp"].includes(extension)) {
    for (const specifier of specifiersFrom(/^\s*#include\s+"([^"]+)"/gm)) {
      const relative = normalizeRelative(path, specifier);
      const name = specifier.split("/").at(-1);
      const header = tree.has(relative) ? relative : [...tree].find((candidate) => candidate.split("/").at(-1) === name);
      if (!header) continue;
      add(header);
      // Including a header really means depending on its implementation file.
      const stem = header.replace(/\.[^.]+$/, "");
      add(["c", "cpp", "cc"].map((suffix) => `${stem}.${suffix}`).find((candidate) => tree.has(candidate)));
    }
  } else if (extension === "html") {
    for (const specifier of specifiersFrom(/(?:src|href)=["']([^"':#?]+\.(?:js|mjs|ts|tsx|jsx))["']/g)) {
      const direct = specifier.startsWith("/") ? specifier.slice(1) : normalizeRelative(path, specifier);
      add([direct, `public/${direct}`, `src/${direct}`].find((candidate) => tree.has(candidate)));
    }
  } else if (extension === "rs") {
    for (const specifier of specifiersFrom(/^\s*(?:pub\s+)?mod\s+(\w+)\s*;/gm)) {
      const base = normalizeRelative(path, specifier);
      add([`${base}.rs`, `${base}/mod.rs`].find((candidate) => tree.has(candidate)));
    }
  } else if (extension === "rb") {
    for (const specifier of specifiersFrom(/require_relative\s+['"]([^'"]+)['"]/g)) add([`${normalizeRelative(path, specifier)}.rb`].find((candidate) => tree.has(candidate)));
  } else if (extension === "go") {
    for (const specifier of specifiersFrom(/"([\w.-]+\/[\w./-]+)"/g)) {
      const pieces = specifier.split("/");
      for (let start = 1; start < pieces.length; start++) {
        const directory = pieces.slice(start).join("/");
        const member = [...tree].find((candidate) => candidate.startsWith(`${directory}/`) && candidate.endsWith(".go") && !candidate.slice(directory.length + 1).includes("/"));
        if (member) { add(member); break; }
      }
    }
  }
  return [...found];
}

const CALL_PATTERN = /(\.|->|::)?\s*([A-Za-z_$][\w$]*[?!]?)\s*\(/g;
const NEW_PATTERN = /\bnew\s+([A-Z][\w$]*)/g;

function innermost(definitions, lineNumber) {
  let best = null;
  for (const definition of definitions) {
    if (definition.startLine <= lineNumber && definition.endLine >= lineNumber && definition.kind !== "class") {
      if (!best || definition.startLine >= best.startLine) best = definition;
    }
  }
  return best;
}

export function buildCodeGraph(context) {
  const tree = new Set(context.tree);
  const files = new Map();
  const definitionsByName = new Map();
  const imports = new Map();
  const importedBy = new Map();

  for (const file of context.files) {
    const lines = file.content.replaceAll("\r\n", "\n").split("\n");
    const masked = maskSource(lines.join("\n"), extensionOf(file.path));
    const definitions = isTestPath(file.path) ? [] : findDefinitions(file.path, lines, masked);
    const top = { id: `${file.path}#top`, name: file.path.split("/").at(-1), kind: "top", path: file.path, startLine: 1, endLine: lines.length, doc: "", calls: [], callers: [] };
    files.set(file.path, { path: file.path, lines, masked, definitions, top });
    for (const definition of definitions) {
      if (!definitionsByName.has(definition.name)) definitionsByName.set(definition.name, []);
      definitionsByName.get(definition.name).push(definition);
    }
    const local = extractLocalImports(file.path, file.content, tree);
    imports.set(file.path, new Set(local));
    for (const target of local) {
      if (!importedBy.has(target)) importedBy.set(target, new Set());
      importedBy.get(target).add(file.path);
    }
  }

  const resolve = (name, fromPath, isMember) => {
    const imported = imports.get(fromPath) || new Set();
    // `sha256.New()` or `obj.helper()` is a method or another package's function, not a
    // top-level function of this project, unless that function's file is imported here.
    const candidates = definitionsByName.get(name)?.filter((definition) => !isMember || definition.member || definition.kind === "class" || imported.has(definition.path));
    if (!candidates?.length) return null;
    const sameFile = candidates.filter((definition) => definition.path === fromPath);
    if (sameFile.length) return sameFile[0];
    const viaImport = candidates.filter((definition) => imported.has(definition.path));
    if (viaImport.length === 1) return viaImport[0];
    if (isMember && COMMON_MEMBER_NAMES.has(name)) return null;
    return candidates.length === 1 ? candidates[0] : null;
  };

  const link = (caller, target, lineNumber) => {
    if (!target || target === caller || target.id === caller.id) return;
    if (!caller.calls.some((call) => call.target === target)) caller.calls.push({ target, line: lineNumber });
    if (!target.callers.some((entry) => entry.source === caller)) target.callers.push({ source: caller, line: lineNumber });
  };

  for (const file of files.values()) {
    if (isTestPath(file.path)) continue;
    file.masked.forEach((line, index) => {
      const lineNumber = index + 1;
      const owner = innermost(file.definitions, lineNumber) || file.top;
      const isDefinitionLine = file.definitions.some((definition) => definition.startLine === lineNumber);
      for (const match of line.matchAll(CALL_PATTERN)) {
        const name = match[2];
        if (NOT_A_FUNCTION.has(name)) continue;
        if (isDefinitionLine && file.definitions.some((definition) => definition.startLine === lineNumber && definition.name === name)) continue;
        link(owner, resolve(name, file.path, Boolean(match[1])), lineNumber);
      }
      for (const match of line.matchAll(NEW_PATTERN)) link(owner, resolve(match[1], file.path, false), lineNumber);
    });
  }

  const allDefinitions = [...files.values()].flatMap((file) => file.definitions);
  return { files, imports, importedBy, definitions: allDefinitions, tree };
}

export function reachableFrom(node, { skip = null } = {}) {
  const seen = new Set([node]);
  const queue = [node];
  while (queue.length) {
    for (const call of queue.shift().calls) {
      if (call.target === skip || seen.has(call.target)) continue;
      seen.add(call.target);
      queue.push(call.target);
    }
  }
  return seen;
}

// A compact plain-text index of what calls what, handed to the model as a structural hint.
export function describeGraph(graph, maxCharacters = 6000) {
  let output = "";
  for (const definition of [...graph.definitions].sort((a, b) => b.callers.length - a.callers.length)) {
    if (!definition.calls.length && !definition.callers.length) continue;
    const line = `${definition.path}:${definition.startLine} ${definition.name} <- [${definition.callers.map((entry) => entry.source.name).slice(0, 5).join(", ")}] -> [${definition.calls.map((call) => call.target.name).slice(0, 6).join(", ")}]\n`;
    if (output.length + line.length > maxCharacters) break;
    output += line;
  }
  return output;
}
