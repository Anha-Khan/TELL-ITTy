// Turns what the code graph observed into sentences someone who has never coded can read.
// Everything here is derived from real names, parameters, conditions and return lines.

export function wordsOf(name) {
  return name.replace(/\.[^.]+$/, "").replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[_\-$.]+/g, " ").trim().toLowerCase().split(/\s+/).filter(Boolean);
}

const article = (word) => (/^[aeiou]/.test(word) ? "an" : "a");

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const questionOf = (rest) => `is ${rest.length > 1 ? `the ${rest.slice(0, -1).join(" ")} ${rest.at(-1)}` : `this ${article(rest[0])} ${rest[0]}`}`;

const VERBS = [
  { verbs: ["is", "are"], yesNo: true, title: (_, rest) => `${capital(questionOf(rest))}?`, say: (rest) => `answers one question: ${questionOf(rest)}?`, like: "Like a bouncer with a guest list: yes or no." },
  { verbs: ["has", "have"], yesNo: true, say: (rest) => `answers one question: is there ${article(rest[0])} ${rest.join(" ")}?`, like: "Like checking your pocket for keys: yes or no." },
  { verbs: ["can", "should", "may"], yesNo: true, say: (rest, verb) => `answers one question: ${verb} it ${rest.join(" ")}?`, like: "Like asking permission: yes or no." },
  { verbs: ["check", "validate", "verify", "ensure", "assert"], title: (s) => `Checking ${s}`, say: (rest, __, s) => rest[0] === "not" ? `makes sure it's ${s}.` : `makes sure the ${s} is OK.`, like: "Like a ticket inspector: nothing wrong gets past." },
  { verbs: ["configure", "config", "setup", "init", "initialize", "prepare"], title: (s) => `Setting up ${s}`, say: (_, __, s) => `works out the ${s} settings.`, like: "Like filling in a form before you start." },
  { verbs: ["set"], title: (s) => `Setting ${s}`, say: (_, __, s) => `fills in the ${s}.`, like: "Like writing a name on a label." },
  { verbs: ["apply", "use", "attach"], title: (s) => `Applying ${s}`, say: (_, __, s) => `puts the ${s} in place.`, like: "Like sticking the stamps on before posting a letter." },
  { verbs: ["get", "fetch", "load", "read", "find", "lookup", "select", "query", "pull"], title: (s) => `Getting ${s}`, say: (_, __, s) => `goes and gets the ${s}.`, like: "Like a waiter fetching your order." },
  { verbs: ["create", "make", "build", "new", "generate", "compose"], title: (s) => `Making ${s}`, say: (_, __, s) => `makes a new ${s}.`, like: "Like baking from a recipe: ingredients in, finished thing out." },
  { verbs: ["parse", "decode", "deserialize"], title: (s) => `Reading ${s}`, say: (_, __, s) => `turns raw text into ${s} the program can use.`, like: "Like a translator turning a foreign menu into English." },
  { verbs: ["format", "encode", "serialize", "stringify", "convert", "transform", "to"], title: (s) => `Reshaping ${s}`, say: (_, __, s) => `reshapes the ${s} into a new form.`, like: "Like rewriting messy notes neatly." },
  { verbs: ["render", "draw", "show", "display", "print", "paint"], title: (s) => `Showing ${s}`, say: (_, __, s) => `puts the ${s} on screen.`, like: "Like an artist turning an idea into a picture." },
  { verbs: ["send", "post", "emit", "publish", "dispatch", "notify"], title: (s) => `Sending ${s}`, say: (_, __, s) => `sends the ${s} out.`, like: "Like dropping a letter in the post." },
  { verbs: ["save", "store", "write", "persist", "cache"], title: (s) => `Saving ${s}`, say: (_, __, s) => `saves the ${s} for later.`, like: "Like putting something in a labelled box." },
  { verbs: ["add", "push", "append", "insert", "register"], title: (s) => `Adding ${s}`, say: (_, __, s) => `adds the ${s} to the pile.`, like: "Like adding an item to a shopping list." },
  { verbs: ["remove", "delete", "clear", "drop", "reset"], title: (s) => `Removing ${s}`, say: (_, __, s) => `removes the ${s}.`, like: "Like crossing an item off a list." },
  { verbs: ["update", "change", "merge", "patch"], title: (s) => `Updating ${s}`, say: (_, __, s) => `changes the ${s} to its new version.`, like: "Like correcting a page instead of rewriting the book." },
  { verbs: ["handle", "on", "process", "run", "execute", "start", "main"], title: (s) => `Handling ${s}`, say: (_, __, s) => `deals with the ${s} when it comes up.`, like: "Like a receptionist dealing with whoever walks in." }
];

export function describeName(name, doc = "") {
  const [verb, ...rest] = wordsOf(name);
  const rule = rest.length ? VERBS.find((item) => item.verbs.includes(verb)) : null;
  if (rule) {
    const subject = rest.join(" ");
    return { short: rule.say(rest, verb, subject), like: rule.like, yesNo: Boolean(rule.yesNo), title: rule.title?.(subject, rest) || "" };
  }
  if (doc) return { short: `does this, in its author's words: “${doc}”`, like: "", yesNo: false, title: "" };
  return { short: `takes care of ${wordsOf(name).join(" ")}.`, like: "", yesNo: false, title: "" };
}

export const plainTitle = (name) => describeName(name).title;

const PARAMETERS = {
  req: "the incoming request", request: "the incoming request", res: "the reply being built", response: "the reply", resp: "the reply",
  next: "what to do next", cb: "what to do when done", callback: "what to do when done", done: "what to do when done",
  err: "an error", error: "an error", e: "an event", event: "an event", ctx: "the current situation", context: "the current situation",
  opts: "settings", options: "settings", config: "settings", settings: "settings", args: "extra details", params: "extra details", props: "details from the parent",
  str: "some text", s: "some text", text: "some text", string: "some text", msg: "a message", message: "a message",
  arr: "a list", list: "a list", items: "a list", array: "a list", n: "a number", num: "a number", count: "a number",
  obj: "an object", data: "some data", input: "the input", value: "a value", val: "a value", v: "a value",
  url: "a web address", uri: "a web address", path: "a file path", file: "a file", id: "an ID", key: "a key", name: "a name", user: "a user", self: "", this: ""
};

export function friendlyParameters(signature) {
  const opened = signature.indexOf("(");
  if (opened < 0) return [];
  let depth = 0, end = -1;
  for (let index = opened; index < signature.length; index++) {
    if ("([{".includes(signature[index])) depth++;
    if (")]}".includes(signature[index]) && --depth === 0) { end = index; break; }
  }
  const inside = signature.slice(opened + 1, end < 0 ? undefined : end);
  return [...new Set(inside.split(",").map((part) => part.trim().replace(/^\.\.\./, "").split(/[:=\s]/)[0]).filter((part) => /^[A-Za-z_$][\w$]*$/.test(part))
    .map((part) => PARAMETERS[part.toLowerCase()] ?? `the ${wordsOf(part).join(" ")}`).filter(Boolean))];
}

export function givesBack(definition, description, bodyLines) {
  if (description.yesNo) return "Yes or no";
  const returns = bodyLines.map((line) => line.match(/^\s*return\s+(.+?);?\s*$/)?.[1]).filter(Boolean);
  if (!returns.length) return "Nothing. It just does the job.";
  if (returns.every((value) => /^(true|false|True|False)$/.test(value))) return "Yes or no";
  const named = returns.find((value) => /^[A-Za-z_$][\w$]*$/.test(value) && !/^(null|undefined|None|nil)$/.test(value));
  return named ? `\`${named}\`` : "A finished result";
}

export function readCondition(line) {
  const cleaned = line.trim().replace(/\{\s*$/, "").replace(/:\s*$/, "").trim();
  const inside = cleaned.replace(/^(?:else\s+if|elif|if|guard|switch|match)\s*/, "").replace(/^\((.*)\)$/, "$1").trim();
  const simplified = inside.replace(/Array\.isArray\(([\w$]+)\)/g, (_, name) => `${wordsOf(name).join(" ")} is a list`).replace(/typeof\s+([\w$]+)/g, "the type of $1");
  if (!simplified || simplified.length > 58 || /[()[\]]|\w\.\w/.test(simplified)) return "the code checks something. If it's true, it does the next part. If not, it skips it.";
  const words = simplified
    .replace(/===?/g, " is ").replace(/!==?/g, " is not ").replace(/&&/g, " and ").replace(/\|\|/g, " or ")
    .replace(/!(?=[A-Za-z_(])/g, "not ").replace(/\s+/g, " ").trim();
  return `if ${words}, it does the next part. If not, it skips it.`;
}

const TYPE_MEANINGS = [
  [/librar|package|middleware|sdk|module/i, "Ready-made code that programmers plug into their own apps."],
  [/cli|command/i, "A tool you run by typing a command."],
  [/game/i, "A game you can play."],
  [/api|server|backend|service/i, "A program that waits for requests and answers them."],
  [/web|site|front|app/i, "An app that people open and use."]
];
export const meaningOfType = (type) => TYPE_MEANINGS.find(([pattern]) => pattern.test(type))?.[1] || "A software project.";

const GLOSSARY = [
  ["middleware", "code that runs between a request arriving and the reply going out"],
  ["cors", "the browser rule for which websites may talk to a server"],
  ["origin", "the website a request came from"],
  ["headers?", "little notes attached to a web message"],
  ["api", "a menu of things one program can ask another to do"],
  ["cli", "a program you control by typing"],
  ["framework", "a ready-made skeleton you build an app on"],
  ["library", "ready-made code you can reuse"],
  ["server", "a computer program that answers requests"],
  ["requests?", "a message asking a server for something"],
  ["strings?", "a piece of text"],
  ["credentials", "proof of who someone is"],
  ["callback", "a job to do once something else finishes"],
  ["dependenc(?:y|ies)", "someone else's code this project relies on"],
  ["npm", "the tool that downloads JavaScript code"],
  ["pip", "the tool that downloads Python code"],
  ["async", "starts now, finishes later"],
  ["token", "a digital pass that proves who you are"],
  ["database", "where an app keeps its information"],
  ["route", "the address that leads to one page or action"],
  ["component", "one reusable piece of a screen"],
  ["config", "the settings for a program"],
  ["node(?:\\.js)?", "the program that runs JavaScript outside a browser"]
];

export function wordsToKnow(text, limit = 3) {
  const found = [];
  for (const [pattern, meaning] of GLOSSARY) {
    const match = text.match(new RegExp(`(?<![\\w-])${pattern}(?![\\w-])`, "i"));
    if (match) found.push({ index: match.index, term: match[0].toLowerCase(), meaning });
  }
  return found.sort((a, b) => a.index - b.index).slice(0, limit).map(({ term, meaning }) => ({ term, meaning }));
}

export function buildPlain({ headline, like = "", facts = [], words = "" }) {
  const text = [headline, words, ...facts.map((fact) => fact.text)].join(" ").replace(/`/g, " ");
  return { headline, like, facts: facts.slice(0, 4), words: wordsToKnow(text) };
}
