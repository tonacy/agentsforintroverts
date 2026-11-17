/**
 * The copy desk: one page per draft for the last step, moving the words into
 * Substack, LinkedIn, X and Threads by hand.
 *
 * A draft folder holds the essay (`essay.md`, or a piece's `article.md`) and
 * its platform posts (`posts.md` with one `## Channel` section each, or a
 * piece's `adaptations/<channel>.md`). This module reads them and writes a
 * single self-contained `copy-desk.html` beside them: a tab per channel, copy
 * buttons for title, subtitle and body, editable posts with limit meters, one
 * link bar that fills `[LINK]` everywhere, and the publish checklist.
 *
 * The page changes nothing on disk. Edits made on it stay in that browser.
 * `[CONFIRM: …]` marks a line the person decides on; the page shows it
 * highlighted with a keep switch and copies only what they kept. HTML comments
 * are notes to the person and never reach the clipboard.
 */

import { readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

export const COPY_DESK_GENERATOR = "quiet-desk-copy-desk/1";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

/** Character limits as each composer counts them. X weighs every link as 23. */
export const CHANNELS = {
  linkedin: { label: "LinkedIn", title: "LinkedIn", limit: 3000 },
  x: { label: "X", title: "X thread", limit: 280 },
  threads: { label: "Threads", title: "Threads", limit: 500 },
};

const DEFAULT_STEPS = [
  "Read the Substack tab. Decide on any highlighted line, and change anything that doesn't sound like you.",
  "In Substack, start a new post. Copy the title, subtitle and body into their fields. Publish and send to subscribers.",
  "Paste the live Substack link into the bar at the top. It fills in [LINK] in every post.",
  "Post each channel in turn. Reread each one before you post it.",
  "Paste the live links into receipts.md in the draft folder so the next session can pick up replies.",
];

// ---------- Markdown, the small subset drafts use ----------

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Only credential-free https links survive. */
function safeHref(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Escaped HTML for one run of text: links, bold and italics, nothing else. */
export function renderInline(text) {
  const links = [];
  let out = String(text).replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    const safe = safeHref(href);
    if (!safe) return whole;
    links.push(`<a href="${escapeHtml(safe)}">${escapeHtml(label)}</a>`);
    return `\u0002${links.length - 1}\u0002`;
  });
  out = escapeHtml(out)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, "$1<em>$2</em>")
    .replace(/(^|[^\w_])_([^_\n]+)_(?![\w_])/g, "$1<em>$2</em>");
  return out.replace(/\u0002(\d+)\u0002/g, (_, n) => links[Number(n)]);
}

/** Composers don't render Markdown, so posts lose their emphasis marks. */
export function plainPost(text) {
  return String(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, "$1$2")
    .replace(/(^|[^\w_])_([^_\n]+)_(?![\w_])/g, "$1$2")
    .trim();
}

function stripComments(markdown, notes) {
  return markdown.replace(/<!--([\s\S]*?)-->/g, (_, body) => {
    const note = body.replace(/\s+/g, " ").trim();
    if (note) notes.push(note);
    return "";
  });
}

function paragraphs(markdown) {
  return markdown
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((chunk) => chunk.replace(/^\n+|\n+$/g, ""))
    .filter((chunk) => chunk.trim());
}

const CONFIRM = /\[CONFIRM:\s*([^\]]+?)\s*\]/g;

/**
 * The essay as blocks the page can show and copy. Each block carries `html`
 * and `plain` (Markdown) with `\u0001N\u0001` where confirm line N sits, so
 * the page can keep or cut it without parsing anything itself.
 */
export function parseEssay(markdown) {
  const notes = [];
  const confirms = [];
  const marked = (text) =>
    text.replace(CONFIRM, (_, line) => {
      confirms.push({ html: renderInline(line), plain: line });
      return `\u0001${confirms.length - 1}\u0001`;
    });

  let title = "";
  let subtitle = "";
  const blocks = [];
  for (const chunk of paragraphs(stripComments(markdown, notes))) {
    const lines = chunk.split("\n");
    const heading = /^(#{1,3})\s+(.+?)\s*#*$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      const text = heading[2];
      if (heading[1] === "#" && !title) title = text;
      else blocks.push({ type: "h", html: renderInline(marked(text)), plain: `## ${marked(text)}` });
      continue;
    }
    const joined = lines.join(" ").trim();
    const deck = /^\*([^*]+)\*$|^_([^_]+)_$/.exec(joined);
    if (deck && !subtitle && blocks.length === 0) {
      subtitle = (deck[1] ?? deck[2]).trim();
      continue;
    }
    if (lines.every((line) => /^\s*([-*]|\d+\.)\s+/.test(line))) {
      const ordered = /^\s*\d+\./.test(lines[0]);
      const items = lines.map((line) => marked(line.replace(/^\s*([-*]|\d+\.)\s+/, "")));
      blocks.push({
        type: ordered ? "ol" : "ul",
        html: items.map((item) => `<li>${renderInline(item)}</li>`).join(""),
        plain: items.map((item, i) => `${ordered ? `${i + 1}.` : "-"} ${item}`).join("\n"),
      });
      continue;
    }
    if (lines.every((line) => line.startsWith(">"))) {
      const text = marked(lines.map((line) => line.replace(/^>\s?/, "")).join(" "));
      blocks.push({ type: "quote", html: renderInline(text), plain: `> ${text}` });
      continue;
    }
    const text = marked(joined);
    blocks.push({ type: "p", html: renderInline(text), plain: text });
  }
  return { title, subtitle, blocks, confirms, notes };
}

// ---------- Posts ----------

function channelFor(heading) {
  const h = heading.toLowerCase();
  if (/linkedin/.test(h)) return "linkedin";
  if (/^threads\b/.test(h)) return "threads";
  if (/^x\b|twitter/.test(h)) return "x";
  if (/checklist|publish|steps/.test(h)) return "steps";
  return null;
}

/** A thread numbered `1/`, `2/` … becomes one post per number. */
export function splitThread(body) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  if (!lines.some((line) => /^\s*\d+\/\s*$/.test(line))) return [plainPost(body)].filter(Boolean);
  const posts = [];
  let current = null;
  for (const line of lines) {
    if (/^\s*\d+\/\s*$/.test(line)) {
      current = [];
      posts.push(current);
    } else if (current) current.push(line);
  }
  return posts.map((post) => plainPost(post.join("\n"))).filter(Boolean);
}

function parseSteps(body) {
  const steps = [];
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    const start = /^\s*(?:\d+[.)]|[-*])\s+(.*)$/.exec(line);
    if (start) steps.push(start[1].trim());
    else if (line.trim() && steps.length) steps[steps.length - 1] += ` ${line.trim()}`;
  }
  return steps.map(plainPost);
}

/** `posts.md`: an optional `# heading` and intro, then `## Channel` sections. */
export function parsePosts(markdown) {
  const notes = [];
  const text = stripComments(markdown, notes).replace(/\r\n?/g, "\n");
  const head = /^#\s+(.+)$/m.exec(text);
  const result = { heading: head ? head[1].trim() : "", posts: {}, steps: null, stepsNote: "", notes };
  const sections = text.split(/^##\s+/m);
  const intro = sections.shift().replace(/^#\s+.+$/m, "").replace(/^-{3,}\s*$/gm, "").trim();
  if (intro) result.intro = plainPost(intro.replace(/\s*\n\s*/g, " "));
  for (const section of sections) {
    const [first, ...rest] = section.split("\n");
    const body = rest.join("\n").replace(/^-{3,}\s*$/gm, "").trim();
    const name = first.trim();
    const channel = channelFor(name);
    if (channel === "steps") {
      result.steps = parseSteps(body);
      const aside = /\(([^)]+)\)/.exec(name);
      if (aside) result.stepsNote = aside[1].charAt(0).toUpperCase() + aside[1].slice(1) + ".";
    } else if (channel && !result.posts[channel]) {
      result.posts[channel] = channel === "x" ? splitThread(body) : [plainPost(body)].filter(Boolean);
    }
  }
  return result;
}

// ---------- The draft folder ----------

async function readIfPresent(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function titleCase(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
}

/** Everything the page needs, read from one draft folder. */
export async function readDraft(dir) {
  let manifest = null;
  const manifestText = await readIfPresent(join(dir, "piece.json"));
  if (manifestText) manifest = JSON.parse(manifestText);

  const essayName = (await readIfPresent(join(dir, "essay.md"))) !== null ? "essay.md" : manifest?.canonical_text ?? "article.md";
  const essayPath = resolve(dir, essayName);
  if (!inside(dir, essayPath)) throw new Error("The essay must be a file inside the draft.");
  const essayText = await readIfPresent(essayPath);
  const essay = essayText === null ? null : parseEssay(essayText);

  const postsText = await readIfPresent(join(dir, "posts.md"));
  const posts = postsText === null ? { heading: "", posts: {}, steps: null, stepsNote: "", notes: [] } : parsePosts(postsText);
  for (const channel of Object.keys(CHANNELS)) {
    if (posts.posts[channel]) continue;
    const text = await readIfPresent(join(dir, "adaptations", `${channel}.md`));
    if (text !== null) posts.posts[channel] = channel === "x" ? splitThread(text) : [plainPost(text)].filter(Boolean);
  }

  if (!essay && !Object.keys(posts.posts).length) {
    throw new Error("A draft needs essay.md (or article.md) or posts.md.");
  }

  const folder = basename(dir);
  const dated = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(folder);
  const sources = [posts.heading, ...(essay?.notes ?? []), ...posts.notes].join(" ");
  const revision = manifest?.revision ?? /\b(?:rev(?:ision)?\.?)\s*(\d+)/i.exec(sources)?.[1] ?? null;
  const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(posts.heading)?.[1] ?? manifest?.updated_at ?? dated?.[1] ?? null;
  const name = /^([^:(]+?)\s*[:(]/.exec(posts.heading)?.[1] ?? (dated ? titleCase(dated[2]) : titleCase(folder));

  return {
    folder,
    name,
    revision: revision === null ? null : String(revision),
    date,
    title: plainPost(manifest?.title ?? essay?.title ?? name),
    subtitle: plainPost(manifest?.deck ?? essay?.subtitle ?? ""),
    essay,
    posts: posts.posts,
    postsNote: posts.intro ?? "",
    steps: posts.steps?.length ? posts.steps : DEFAULT_STEPS,
    stepsNote: posts.stepsNote,
  };
}

// ---------- The page ----------

function scriptJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

function count(n, one, many) {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  return `${words[n] ?? n} ${n === 1 ? one : many}`;
}

function sentence(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function renderCopyDeskHtml(draft, { sourcePath = `drafts/${draft.folder}/` } = {}) {
  const channels = Object.keys(CHANNELS).filter((c) => draft.posts[c]?.length);
  const postCount = channels.reduce((n, c) => n + (c === "x" ? 1 : draft.posts[c].length), 0);
  const eyebrow = ["Agents for Introverts", draft.name, draft.revision && `Revision ${draft.revision}`, formatDate(draft.date)]
    .filter(Boolean)
    .join(" · ");
  const lede = `${draft.essay ? "One essay" : "No essay"}, ${count(postCount, "post", "posts")}. Edit any post right here, then copy it. Your edits stay in this browser only.`;
  const confirms = draft.essay?.confirms ?? [];
  const data = {
    key: `cd:${draft.folder}:${draft.revision ?? "0"}:`,
    title: draft.title,
    subtitle: draft.subtitle,
    essay: draft.essay ? draft.essay.blocks : null,
    confirms,
    posts: Object.fromEntries(channels.map((c) => [c, { ...CHANNELS[c], items: draft.posts[c] }])),
    steps: draft.steps,
  };

  const notes = [...(draft.essay?.notes ?? [])].map((n) => `<p class="note">${escapeHtml(n)}</p>`).join("");
  const confirmBox = confirms.length
    ? `<div class="confirm-box" id="confirm-box"><span><strong>${confirms.length === 1 ? "One line needs you." : `${sentence(count(confirms.length, "line", "lines"))} need you.`}</strong> Keep or cut each highlighted line. Only what you keep is copied.</span><span id="confirm-toggles" class="toggles"></span></div>`
    : "";

  const panels = channels
    .map((c) => {
      const cfg = CHANNELS[c];
      const thread = draft.posts[c].length > 1;
      const angle =
        c === "x"
          ? `${sentence(count(draft.posts[c].length, "post", "posts"))}. Paste the first, then add each one below it with the + button in the composer.`
          : thread
            ? "Several posts. Copy each one in turn."
            : `One post, up to ${cfg.limit.toLocaleString("en-US")} characters.`;
      const copyAll = thread ? "" : `<button class="btn primary" data-copy-post="${c}">Copy post</button>`;
      return `
  <section class="panel" id="panel-${c}" role="tabpanel" aria-labelledby="tab-${c}" hidden>
    <div class="panel-head">
      <div>
        <h2>${escapeHtml(cfg.title)}</h2>
        <p class="angle">${escapeHtml(angle)}</p>
      </div>
      <div class="actions">
        <button class="btn quiet" data-reset="${c}">Undo my edits</button>
        ${copyAll}
      </div>
    </div>
    <div id="sheets-${c}" class="sheets"></div>${c === "x" ? '\n    <p class="note">X counts every link as 23 characters, and the meter does too.</p>' : ""}
  </section>`;
    })
    .join("");

  const substack = draft.essay
    ? `
  <section class="panel" id="panel-substack" role="tabpanel" aria-labelledby="tab-substack" hidden>
    <div class="panel-head">
      <div>
        <h2>Substack</h2>
        <p class="angle">The full story. Title, subtitle and body go in separate fields in the Substack editor.</p>
      </div>
      <div class="actions">
        <button class="btn" data-copy="title">Copy title</button>
        ${draft.subtitle ? '<button class="btn" data-copy="subtitle">Copy subtitle</button>' : ""}
        <button class="btn primary" data-copy="essay">Copy body</button>
      </div>
    </div>
    ${confirmBox}
    ${notes ? `<details class="notes"><summary>Notes in the draft</summary>${notes}<p class="note">Notes are never copied.</p></details>` : ""}
    <article class="sheet"><div class="essay" id="essay"></div></article>
  </section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="generator" content="${COPY_DESK_GENERATOR}">
<title>${escapeHtml(draft.name)} Desk</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Source+Sans+3:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${STYLE}</style>
</head>
<body>
<header class="top wrap">
  <div class="eyebrow">${escapeHtml(eyebrow)}</div>
  <h1>${escapeHtml(draft.title)}</h1>
  <p class="lede">${escapeHtml(lede)}</p>
</header>

<div class="linkbar">
  <div class="wrap">
    <label for="substack-url">Substack link</label>
    <input id="substack-url" type="url" inputmode="url" placeholder="Paste after the essay is live" autocomplete="off" spellcheck="false">
    <div class="linkstate" id="linkstate" aria-live="polite"></div>
  </div>
</div>

<main class="wrap">
  <nav class="tabs" role="tablist" aria-label="Channels" id="tabs"></nav>
${substack}${panels}

  <section class="panel" id="panel-steps" role="tabpanel" aria-labelledby="tab-steps" hidden>
    <div class="panel-head">
      <div>
        <h2>Publish checklist</h2>
        ${draft.stepsNote ? `<p class="angle">${escapeHtml(draft.stepsNote)}</p>` : ""}
      </div>
    </div>
    <ol class="steps" id="steps"></ol>
    <p class="note">Source files: <code>${escapeHtml(sourcePath)}</code>. Edits made on this page don't go back to those files.</p>
  </section>
</main>

<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>

<script type="application/json" id="desk-data">${scriptJson(data)}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

async function isOurs(path) {
  try {
    const text = await readFile(path, "utf8");
    return text.includes(`<meta name="generator" content="${COPY_DESK_GENERATOR}">`);
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}

async function isDraft(dir) {
  for (const name of ["essay.md", "article.md", "posts.md"]) {
    if ((await readIfPresent(join(dir, name))) !== null) return true;
  }
  return false;
}

/**
 * Write `copy-desk.html` into one draft, or into every draft under `drafts/`
 * when `draft` is omitted. A hand-built page of the same name is never
 * replaced unless `force` is set.
 */
export async function renderCopyDesk({ workspace, draft, output = "copy-desk.html", force = false }) {
  const root = await realpath(resolve(workspace));
  if (!output.endsWith(".html") || output.includes("/") || output.includes("\\")) {
    throw new Error("Render to an .html file name inside the draft.");
  }
  let folders;
  if (draft) {
    folders = [draft];
  } else {
    const entries = await readdir(join(root, "drafts"), { withFileTypes: true }).catch(() => []);
    folders = entries.filter((e) => e.isDirectory()).map((e) => join("drafts", e.name)).sort();
  }

  const written = [];
  const skipped = [];
  for (const folder of folders) {
    const candidate = resolve(root, folder);
    if (!inside(root, candidate)) throw new Error("A draft must be a folder inside the workspace.");
    const dir = await realpath(candidate);
    if (!inside(root, dir) || !(await stat(dir)).isDirectory()) throw new Error("A draft must be a folder inside the workspace.");
    if (!draft && !(await isDraft(dir))) continue;
    const target = join(dir, output);
    if (!force && !(await isOurs(target))) {
      if (draft) throw new Error(`This draft has a hand-built ${output}. Render to another file with --output, or pass --force.`);
      skipped.push(relative(root, target));
      continue;
    }
    const parsed = await readDraft(dir);
    await writeFile(target, renderCopyDeskHtml(parsed, { sourcePath: `${relative(root, dir)}/` }));
    written.push(relative(root, target));
  }
  return { written, skipped };
}

// ---------- Page style and behaviour ----------

const STYLE = `
:root {
  color-scheme: light;
  --paper: #FDFBF7; --sheet: #FFFFFF; --ink: #141714; --muted: #5C625D; --rule: #DCDAD6;
  --leaf: #0F4A38; --leaf-wash: #E8EEE7; --madder: #A8402A; --madder-wash: #F7E7E1; --on-leaf: #FDFBF7;
  --display: "Newsreader", Georgia, "Times New Roman", serif;
  --body: "Source Sans 3", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #0E1513; --sheet: #141E1A; --ink: #ECE8DF; --muted: #9DA8A1; --rule: #283630;
    --leaf: #8CCBAE; --leaf-wash: #1B2D26; --madder: #E58B70; --madder-wash: #3A211A; --on-leaf: #0E1513;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --paper: #0E1513; --sheet: #141E1A; --ink: #ECE8DF; --muted: #9DA8A1; --rule: #283630;
  --leaf: #8CCBAE; --leaf-wash: #1B2D26; --madder: #E58B70; --madder-wash: #3A211A; --on-leaf: #0E1513;
  color-scheme: dark;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--body); font-size: 16px; line-height: 1.5; }
.wrap { max-width: 760px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header.top { padding-block: 32px 8px; }
.eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
h1 { font-family: var(--display); font-weight: 500; font-size: clamp(28px, 5vw, 40px); line-height: 1.12; margin: 8px 0 6px; text-wrap: balance; }
.lede { color: var(--muted); margin: 0; }
.linkbar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--paper); border-bottom: 1px solid var(--rule); }
.linkbar .wrap { padding-block: 12px; display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.linkbar label { font-weight: 600; font-size: 14px; }
.linkbar input { flex: 1 1 260px; min-width: 0; font: 15px var(--mono); padding: 8px 10px; border: 1px solid var(--rule); border-radius: 6px; background: var(--sheet); color: var(--ink); }
.linkbar input:focus-visible { outline: 2px solid var(--leaf); outline-offset: 1px; }
.linkstate { font-size: 13px; color: var(--muted); flex-basis: 100%; }
.linkstate.ok { color: var(--leaf); }
.tabs { display: flex; gap: 4px; overflow-x: auto; padding-block: 20px 0; border-bottom: 1px solid var(--rule); }
.tabs button { font: 600 15px var(--body); color: var(--muted); background: none; border: 0; padding: 10px 14px; border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; display: flex; gap: 8px; align-items: center; }
.tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--leaf); }
.tabs button:focus-visible { outline: 2px solid var(--leaf); outline-offset: -2px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--leaf); }
.dot.warn { background: var(--madder); }
section.panel { padding-block: 24px 64px; display: grid; gap: 20px; }
.panel-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; justify-content: space-between; }
.panel-head h2 { font-family: var(--display); font-weight: 500; font-size: 24px; margin: 0; }
.angle { color: var(--muted); margin: 4px 0 0; font-size: 15px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.btn { font: 600 14px var(--body); border-radius: 6px; padding: 8px 14px; cursor: pointer; border: 1px solid var(--rule); background: var(--sheet); color: var(--ink); }
.btn.primary { background: var(--leaf); color: var(--on-leaf); border-color: var(--leaf); }
.btn:focus-visible { outline: 2px solid var(--leaf); outline-offset: 2px; }
.btn.quiet { border-color: transparent; background: none; color: var(--muted); padding-inline: 6px; }
.sheets { display: grid; gap: 12px; }
.sheet { background: var(--sheet); border: 1px solid var(--rule); border-radius: 8px; display: grid; }
.sheet-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--rule); }
.seq { font-family: var(--mono); font-size: 13px; color: var(--muted); }
.meter { font-family: var(--mono); font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.meter.over { color: var(--madder); font-weight: 500; }
textarea.post { width: 100%; border: 0; resize: none; background: transparent; color: var(--ink); font: 17px/1.55 var(--body); padding: 16px; overflow: hidden; min-height: 80px; }
textarea.post:focus-visible { outline: 2px solid var(--leaf); outline-offset: -2px; border-radius: 0 0 8px 8px; }
.essay { padding: 24px clamp(16px, 4vw, 40px) 32px; font-family: var(--display); font-size: 19px; line-height: 1.6; }
.essay h3 { font-family: var(--display); font-weight: 500; font-size: 24px; margin: 32px 0 8px; text-wrap: balance; }
.essay p, .essay ul, .essay ol, .essay blockquote { margin: 0 0 16px; max-width: 65ch; }
.essay blockquote { border-left: 3px solid var(--rule); padding-left: 14px; font-style: italic; }
.essay a { color: var(--leaf); }
.essay .sub { color: var(--muted); font-style: italic; }
.confirm { background: var(--madder-wash); border-left: 3px solid var(--madder); padding: 2px 6px; }
.confirm.cut { text-decoration: line-through; opacity: 0.5; }
.confirm-box { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; background: var(--madder-wash); color: var(--ink); border-radius: 8px; padding: 12px 14px; font-size: 15px; }
.confirm-box strong { color: var(--madder); }
.toggles { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.toggles label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
.notes summary { cursor: pointer; color: var(--muted); font-size: 14px; }
.notes .note { margin-top: 8px; }
.note { font-size: 14px; color: var(--muted); margin: 0; }
.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.steps li label { display: grid; grid-template-columns: 22px 1fr; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--rule); cursor: pointer; }
.steps input { width: 18px; height: 18px; margin-top: 3px; accent-color: var(--leaf); }
.steps input:checked + span { color: var(--muted); text-decoration: line-through; }
code { font-family: var(--mono); font-size: 0.88em; background: var(--leaf-wash); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }
.toast { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(20px + env(safe-area-inset-bottom, 0px)); background: var(--ink); color: var(--paper); padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 14px; max-width: calc(100% - 32px); }
@media (prefers-reduced-motion: no-preference) { .toast { transition: opacity .2s; } }
`;

const SCRIPT = String.raw`
(function () {
  var D = JSON.parse(document.getElementById("desk-data").textContent);
  var store = {
    get: function (k) { try { return localStorage.getItem(D.key + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(D.key + k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(D.key + k); } catch (e) {} }
  };
  var $ = function (s) { return document.querySelector(s); };
  var CHANNELS = Object.keys(D.posts);
  var TABS = (D.essay ? [{ id: "substack", label: "Substack" }] : [])
    .concat(CHANNELS.map(function (c) { return { id: c, label: D.posts[c].label }; }))
    .concat([{ id: "steps", label: "Checklist" }]);
  var urlInput = $("#substack-url");

  function link() { return urlInput.value.trim(); }
  function fill(text) { var l = link(); return l ? text.split("[LINK]").join(l) : text; }
  function weigh(text, channel) {
    var t = fill(text);
    if (channel === "x") t = t.replace(/https?:\/\/\S+/g, "x".repeat(23)).replace(/\[LINK\]/g, "x".repeat(23));
    return Array.from(t).length;
  }

  var toastTimer;
  function toast(msg) {
    var el = $("#toast"); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }
  function copyPlain(text, label, fallbackEl) {
    var warn = text.indexOf("[LINK]") !== -1 ? " It still has [LINK] in it." : "";
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject();
    p.then(function () { toast(label + " copied." + warn); })
     .catch(function () {
       if (fallbackEl && fallbackEl.select) { fallbackEl.focus(); fallbackEl.select(); toast("Text selected. Press ⌘C to copy."); }
       else toast("Copy was blocked here. Select the text and press ⌘C.");
     });
  }

  // ---- essay and its confirm lines
  function kept(i) { return store.get("confirm:" + i) !== "0"; }
  function resolveMarks(text, mode) {
    return text.replace(/(\s?)\u0001(\d+)\u0001/g, function (_, space, n) {
      var c = D.confirms[Number(n)];
      if (mode === "show") return space + '<span class="confirm' + (kept(n) ? "" : " cut") + '">' + c.html + "</span>";
      if (!kept(n)) return "";
      return space + (mode === "html" ? c.html : c.plain);
    }).trim();
  }
  var TAG = { h: "h3", p: "p", ul: "ul", ol: "ol", quote: "blockquote" };
  function renderEssay() {
    if (!D.essay) return;
    var html = D.subtitle ? '<p class="sub"></p>' : "";
    D.essay.forEach(function (b) { html += "<" + TAG[b.type] + ">" + resolveMarks(b.html, "show") + "</" + TAG[b.type] + ">"; });
    $("#essay").innerHTML = html;
    var sub = $("#essay .sub"); if (sub) sub.textContent = D.subtitle;
  }
  function essayParts() {
    var html = "", plain = [];
    D.essay.forEach(function (b) {
      var h = resolveMarks(b.html, "html"), p = resolveMarks(b.plain, "plain");
      if (!h || p === "##") return;
      html += "<" + TAG[b.type] + ">" + h + "</" + TAG[b.type] + ">";
      plain.push(p);
    });
    return { html: html, plain: plain.join("\n\n") };
  }
  function copyEssay() {
    var parts = essayParts();
    var canRich = window.ClipboardItem && navigator.clipboard && navigator.clipboard.write;
    var p = canRich
      ? navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([parts.html], { type: "text/html" }),
          "text/plain": new Blob([parts.plain], { type: "text/plain" })
        })])
      : Promise.reject();
    p.then(function () { toast("Essay body copied with formatting."); })
     .catch(function () { copyPlain(parts.plain, "Essay body"); });
  }
  function renderConfirmToggles() {
    var host = $("#confirm-toggles"); if (!host) return;
    D.confirms.forEach(function (c, i) {
      var label = document.createElement("label");
      var box = document.createElement("input"); box.type = "checkbox"; box.checked = kept(i);
      var words = c.plain.split(/\s+/).slice(0, 5).join(" ");
      label.appendChild(box);
      label.appendChild(document.createTextNode(D.confirms.length > 1 ? "Keep “" + words + "…”" : "Keep it"));
      box.addEventListener("change", function () { store.set("confirm:" + i, box.checked ? "1" : "0"); renderEssay(); });
      host.appendChild(label);
    });
  }

  // ---- posts
  function key(c, i) { return "edit:" + c + ":" + i; }
  function current(c, i) { var v = store.get(key(c, i)); return v === null ? D.posts[c].items[i] : v; }
  function autosize(ta) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }
  function renderPosts(c) {
    var cfg = D.posts[c], host = $("#sheets-" + c), n = cfg.items.length;
    host.innerHTML = "";
    cfg.items.forEach(function (_, i) {
      var sheet = document.createElement("div"); sheet.className = "sheet";
      var bar = document.createElement("div"); bar.className = "sheet-bar";
      var left = document.createElement("span"); left.className = "seq";
      left.textContent = n > 1 ? "Post " + (i + 1) + " of " + n : cfg.label + " post";
      var right = document.createElement("div"); right.className = "actions";
      var meter = document.createElement("span"); meter.className = "meter";
      right.appendChild(meter);
      var ta = document.createElement("textarea");
      ta.className = "post"; ta.id = "post-" + c + "-" + i; ta.rows = 3;
      ta.setAttribute("aria-label", left.textContent);
      ta.value = fill(current(c, i));
      if (n > 1) {
        var b = document.createElement("button"); b.className = "btn"; b.textContent = "Copy";
        b.addEventListener("click", function () { copyPlain(fill(ta.value), "Post " + (i + 1), ta); });
        right.appendChild(b);
      }
      bar.appendChild(left); bar.appendChild(right);
      sheet.appendChild(bar); sheet.appendChild(ta); host.appendChild(sheet);
      function update() {
        var count = weigh(ta.value, c);
        meter.textContent = count.toLocaleString() + " / " + cfg.limit.toLocaleString();
        meter.classList.toggle("over", count > cfg.limit);
        autosize(ta);
      }
      ta.addEventListener("input", function () {
        var raw = ta.value, l = link();
        if (l) raw = raw.split(l).join("[LINK]");
        store.set(key(c, i), raw); update(); refreshDots();
      });
      requestAnimationFrame(update);
    });
  }
  function refreshDots() {
    var hasLink = !!link();
    CHANNELS.forEach(function (c) {
      var texts = D.posts[c].items.map(function (_, i) { return current(c, i); });
      var over = texts.some(function (t) { return weigh(t, c) > D.posts[c].limit; });
      var needsLink = !hasLink && texts.some(function (t) { return t.indexOf("[LINK]") !== -1; });
      var dot = document.querySelector("#tab-" + c + " .dot");
      if (dot) { dot.classList.toggle("warn", over || needsLink); dot.title = over ? "Over the limit" : (needsLink ? "Needs the Substack link" : "Ready"); }
    });
  }

  // ---- tabs, steps, link bar
  function renderTabs() {
    var nav = $("#tabs");
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.id = "tab-" + t.id; b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "panel-" + t.id);
      if (D.posts[t.id]) { var dot = document.createElement("span"); dot.className = "dot"; dot.setAttribute("aria-hidden", "true"); b.appendChild(dot); }
      b.appendChild(document.createTextNode(t.label));
      b.addEventListener("click", function () { select(t.id); });
      nav.appendChild(b);
    });
  }
  function select(id) {
    TABS.forEach(function (t) {
      var on = t.id === id;
      $("#tab-" + t.id).setAttribute("aria-selected", on ? "true" : "false");
      $("#panel-" + t.id).hidden = !on;
    });
    store.set("tab", id);
    document.querySelectorAll("#panel-" + id + " textarea.post").forEach(autosize);
  }
  function renderSteps() {
    var ol = $("#steps");
    D.steps.forEach(function (s, i) {
      var li = document.createElement("li"), id = "step-" + i;
      li.innerHTML = '<label for="' + id + '"><input type="checkbox" id="' + id + '"><span></span></label>';
      li.querySelector("span").textContent = (i + 1) + ". " + s;
      var cb = li.querySelector("input");
      cb.checked = store.get(id) === "1";
      cb.addEventListener("change", function () { store.set(id, cb.checked ? "1" : "0"); });
      ol.appendChild(li);
    });
  }
  function syncLink() {
    var l = link(), st = $("#linkstate");
    store.set("url", l);
    if (l) { st.textContent = "Link added to every post."; st.className = "linkstate ok"; }
    else { st.textContent = "Publish the essay first. The link then fills in [LINK] in every post."; st.className = "linkstate"; }
    CHANNELS.forEach(renderPosts);
    refreshDots();
  }

  document.addEventListener("click", function (e) {
    var c = e.target.closest("[data-copy]");
    if (c) {
      var what = c.getAttribute("data-copy");
      if (what === "title") copyPlain(D.title, "Title");
      else if (what === "subtitle") copyPlain(D.subtitle, "Subtitle");
      else copyEssay();
      return;
    }
    var cp = e.target.closest("[data-copy-post]");
    if (cp) {
      var p = cp.getAttribute("data-copy-post");
      var ta = document.getElementById("post-" + p + "-0");
      copyPlain(fill(ta.value), D.posts[p].label + " post", ta);
      return;
    }
    var r = e.target.closest("[data-reset]");
    if (r) {
      var pl = r.getAttribute("data-reset");
      D.posts[pl].items.forEach(function (_, i) { store.del(key(pl, i)); });
      renderPosts(pl); refreshDots(); toast("Back to the original draft.");
    }
  });

  urlInput.value = store.get("url") || "";
  urlInput.addEventListener("input", syncLink);
  renderTabs();
  renderConfirmToggles();
  renderEssay();
  renderSteps();
  syncLink();
  var known = function (id) { return TABS.some(function (t) { return t.id === id; }); };
  var hash = (location.hash || "").slice(1);
  var start = known(hash) ? hash : store.get("tab");
  select(known(start) ? start : TABS[0].id);
})();
`;
