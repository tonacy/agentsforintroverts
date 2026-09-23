/**
 * A piece from the Desk, set in the house style.
 *
 * The words live in Markdown (`article.md`) and the facts about the piece in
 * `piece.json`. This module turns them into a reader page, three social
 * cards, and a copy of the house assets, so every piece opens from disk
 * looking finished. Text is always escaped; the only markup that survives is
 * the small, safe subset described in PIECE.md.
 *
 * The page is signed only when a saved approval matches the exact canonical
 * words. Editing them unsigns it again.
 */

import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PIECE_GENERATOR = "quiet-desk-piece/1";

const HOUSE = fileURLToPath(new URL("../../../templates/quiet-desk-publishing/piece/", import.meta.url));
const HOUSE_FONTS = [
  "newsreader-roman.woff2",
  "newsreader-italic.woff2",
  "plex-mono-400.woff2",
  "plex-mono-500.woff2",
  "plex-mono-400-italic.woff2",
  "Newsreader-OFL.txt",
  "IBMPlexMono-OFL.txt",
];
const MARK_WORDS = "I made this with Agents for Introverts. The point of view is mine, and the agents helped it travel.";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
const SPRIG = `<svg viewBox="0 0 28 28" aria-hidden="true"><path fill="currentColor" d="M13.6 24.6c-.4-3.6-1.8-6.3-4.6-8.1 2.9.2 5 1.8 5.6 4.3zM15.6 15.3c.3-4.6 2.8-8 7-9.3-1.3 4.2-3.8 7.2-7 9.3zM14.4 13.7C11.8 11.4 11 8.3 12 4.6c2.5 2.6 3.2 5.7 2.4 9.1z"/><path d="M14.3 25.2c.1-4.4.5-8.3 1.6-11.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

// ---------- Escaping and links ----------

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Only credential-free https links leave the page. */
function safeHref(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** An asset is https, or a relative path that stays inside the piece. */
function safeAsset(src) {
  if (/^https:/i.test(src)) return safeHref(src);
  if (src.startsWith("/") || src.startsWith("\\") || /^[a-z][a-z0-9+.-]*:/i.test(src)) return null;
  const normalized = posix.normalize(src);
  if (normalized.startsWith("..") || normalized.startsWith("/")) return null;
  return normalized;
}

function referenceLabel(url) {
  const { hostname, pathname } = new URL(url);
  const text = `${hostname.replace(/^www\./, "")}${pathname}`.replace(/\/$/, "");
  return text.length > 64 ? `${text.slice(0, 63)}…` : text;
}

// ---------- Inline ----------

const INLINE =
  /`([^`]+)`|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*|\[(\d{1,3})\]/g;

/**
 * The inline subset: `code`, [links](https://…), **strong**, *emphasis* and
 * numbered source references like [1]. Everything else is text.
 */
export function renderInline(text, context = {}) {
  let out = "";
  let last = 0;
  for (const match of String(text).matchAll(INLINE)) {
    out += escapeHtml(text.slice(last, match.index));
    last = match.index + match[0].length;
    const [whole, code, linkText, linkUrl, strong, em, ref] = match;
    if (code !== undefined) {
      out += `<code>${escapeHtml(code)}</code>`;
    } else if (linkText !== undefined) {
      const href = context.links === false ? null : safeHref(linkUrl);
      const label = renderInline(linkText, { ...context, links: false });
      out += href ? `<a href="${escapeHtml(href)}">${label}</a>` : label;
    } else if (strong !== undefined) {
      out += `<strong>${renderInline(strong, context)}</strong>`;
    } else if (em !== undefined) {
      out += `<em>${renderInline(em, context)}</em>`;
    } else {
      out += renderReference(ref, whole, context);
    }
  }
  return out + escapeHtml(String(text).slice(last));
}

function renderReference(n, whole, context) {
  const source = context.references?.[n];
  if (!source) return escapeHtml(whole);
  const first = !context.seen?.has(n);
  if (first) {
    context.seen?.add(n);
    context.notes?.push(n);
  }
  const id = first ? ` id="ref-${n}"` : "";
  return `<a class="ref" href="#note-${n}"${id}>${n}</a>`;
}

function plainText(markdown) {
  return String(markdown)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s*\[\d{1,3}\]/g, "");
}

// ---------- Blocks ----------

const REFERENCE = /^\[(\d{1,3})\]:\s*(\S+)(?:\s+"([^"]*)")?\s*$/;
const FIGURE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)\s*$/;
const LIST = /^(?:[-*+]|\d{1,3}\.)\s+(.*)$/;

/**
 * Markdown, line by line, into a flat list of blocks. The first `#` heading is
 * the title; an all-italic first paragraph is the deck; `##` sections are
 * numbered; a trailing `---` followed only by paragraphs is the postscript.
 */
export function parseArticle(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  const references = {};
  const blocks = [];
  let title = null;
  let paragraph = [];
  let sections = 0;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const reference = line.match(REFERENCE);
    if (!line) {
      flush();
    } else if (reference) {
      flush();
      const url = safeHref(reference[2]);
      if (url) references[reference[1]] = { url, label: reference[3]?.trim() || referenceLabel(url) };
    } else if (/^#\s+/.test(line) && title === null && blocks.length === 0) {
      flush();
      title = line.replace(/^#\s+/, "");
    } else if (/^##\s+/.test(line)) {
      flush();
      sections += 1;
      blocks.push({ type: "h2", text: line.replace(/^##\s+/, ""), n: sections });
    } else if (/^#{3,6}\s+/.test(line)) {
      flush();
      blocks.push({ type: "h3", text: line.replace(/^#{3,6}\s+/, "") });
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      blocks.push({ type: "break" });
    } else if (line.startsWith(">")) {
      flush();
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "quote", text: quote.join(" ").trim() });
    } else if (LIST.test(line) && paragraph.length === 0) {
      const ordered = /^\d/.test(line);
      const items = [];
      while (i < lines.length && LIST.test(lines[i].trim()) && /^\d/.test(lines[i].trim()) === ordered) {
        items.push(lines[i].trim().match(LIST)[1]);
        i += 1;
      }
      i -= 1;
      blocks.push({ type: ordered ? "ol" : "ul", items });
    } else if (FIGURE.test(line) && paragraph.length === 0) {
      const [, alt, src, caption] = line.match(FIGURE);
      const safe = safeAsset(src);
      if (safe) blocks.push({ type: "figure", src: safe, alt, caption: caption ?? null });
    } else {
      paragraph.push(line);
    }
  }
  flush();

  // An all-italic opening paragraph is the deck.
  let deck = null;
  const first = blocks[0];
  if (first?.type === "p" && /^\*[^*].*[^*]\*$/.test(first.text) && !first.text.slice(1, -1).includes("*")) {
    deck = first.text.slice(1, -1).trim();
    blocks.shift();
  }

  // Everything after the last break is a postscript, if it is only prose.
  let postscript = [];
  const lastBreak = blocks.findLastIndex((b) => b.type === "break");
  if (lastBreak !== -1) {
    const tail = blocks.slice(lastBreak + 1);
    if (tail.length > 0 && tail.every((b) => b.type === "p")) {
      postscript = tail.map((b) => b.text);
      blocks.splice(lastBreak);
    }
  }

  const lede = blocks.find((b) => b.type === "p");
  if (lede) lede.lede = true;

  const counted = [deck ?? "", ...blocks.flatMap((b) => b.items ?? [b.text ?? ""])];
  const words = counted.map(plainText).join(" ").split(/\s+/).filter(Boolean).length;

  return { title, deck, blocks, postscript, references, words };
}

// ---------- The reader page ----------

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match) return null;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

function monthYear(value) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value ?? ""));
  return match ? `${MONTHS[Number(match[2]) - 1]} ${match[1]}` : null;
}

function listJoin(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** A valid approval names the web form and the exact canonical words. */
function webApproval(approvals, canonical) {
  if (canonical === undefined) return null;
  const digest = sha256(canonical);
  return approvals.find((a) => (a.form ?? "web") === "web" && a.payload_sha256 === digest && a.approved_by === "human") ?? null;
}

function ledgerFor(manifest) {
  const person = manifest.ledger?.person ?? ["the point of view", "the final say on every word"];
  const agents = manifest.ledger?.agents ?? [
    manifest.authored_by ? `drafted by ${manifest.authored_by}` : "drafted the piece",
    ...(manifest.adaptations?.length ? [`adapted for ${listJoin(manifest.adaptations.map((a) => a.channel))}`] : []),
    ...(manifest.source_ledger ? ["kept the source ledger"] : []),
  ];
  return { person, agents };
}

function renderFigure(figure, n) {
  const caption = figure.caption ?? figure.alt;
  return (
    `<figure class="plate"><div class="plate__sheet"><img src="${escapeHtml(encodeURI(figure.src))}" alt="${escapeHtml(figure.alt)}" loading="lazy"></div>` +
    (caption ? `<figcaption><b>FIG. ${n}</b><span>${renderInline(caption)}</span></figcaption>` : "") +
    `</figure>`
  );
}

function renderNotes(ids, references) {
  if (!ids.length) return "";
  const items = ids.map((n) => {
    const { url, label } = references[n];
    return `<li id="note-${n}"><span class="n">${n}</span><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></li>`;
  });
  return `<ol class="notes">${items.join("")}</ol>`;
}

function renderBody(article, figureStart) {
  const seen = new Set();
  let figures = figureStart;
  const html = article.blocks.map((block) => {
    const context = { references: article.references, seen, notes: [] };
    switch (block.type) {
      case "p": {
        const inner = renderInline(block.text, context);
        const cls = block.lede ? ' class="lede"' : "";
        const p = `<p${cls}>${inner}</p>`;
        return context.notes.length ? `<div class="row">${p}${renderNotes(context.notes, article.references)}</div>` : p;
      }
      case "h2":
        return `<h2 id="s${block.n}"><span class="n">${String(block.n).padStart(2, "0")}</span>${renderInline(block.text)}</h2>`;
      case "h3":
        return `<h3>${renderInline(block.text)}</h3>`;
      case "quote":
        return `<blockquote class="pull"><p>${renderInline(block.text)}</p></blockquote>`;
      case "ul":
      case "ol": {
        const items = block.items.map((item) => `<li>${renderInline(item, context)}</li>`).join("");
        const list = `<${block.type}>${items}</${block.type}>`;
        return context.notes.length ? `<div class="row">${list}${renderNotes(context.notes, article.references)}</div>` : list;
      }
      case "figure":
        figures += 1;
        return renderFigure(block, figures);
      case "break":
        return `<div class="break" aria-hidden="true">${SPRIG}</div>`;
      default:
        return "";
    }
  });
  const postscript = article.postscript.map((text) => `<p class="postscript">${renderInline(text)}</p>`);
  return [...html, ...postscript].join("\n");
}

function coverFigure(manifest) {
  const media = (manifest.media ?? []).find((m) => ["explanatory_diagram", "cover"].includes(m.role) && typeof m.path === "string");
  const src = media && safeAsset(media.path);
  return src ? { src, alt: media.alt ?? "", caption: media.caption ?? media.alt ?? null } : null;
}

/**
 * The reader page. `canonical` is the exact text of the canonical words, used
 * only to check an approval; `approvals` are the saved records for this piece.
 */
export function renderPieceHtml({ manifest, article, canonical, approvals = [], assets = "assets" }) {
  const titleMarkdown = manifest.title || article.title || "Untitled";
  const titleText = plainText(titleMarkdown);
  const deck = manifest.deck ?? article.deck;
  const revision = Number(manifest.revision) || 1;
  const approval = webApproval(approvals, canonical);
  const reviewer = manifest.reviewer ?? "the author";
  const byline = manifest.byline ?? manifest.reviewer ?? "The author";
  const project = manifest.project ?? null;
  const kicker = manifest.kicker ?? (project ? `From the ${project} workbench` : "From the Desk");
  const minutes = Math.max(1, Math.ceil(article.words / 220));
  const date = formatDate(manifest.updated_at ?? manifest.created_at);
  const issue = [manifest.number ? `No. ${String(manifest.number).padStart(3, "0")}` : null, project, monthYear(manifest.created_at)]
    .filter(Boolean)
    .join(" · ");
  const sections = article.blocks.filter((b) => b.type === "h2");
  const cover = coverFigure(manifest);
  const { person, agents } = ledgerFor(manifest);
  const digest = canonical !== undefined ? sha256(canonical) : manifest.canonical_sha256;
  const sources = Object.entries(article.references);
  const signedOn = approval ? formatDate(approval.approved_at) : null;

  const contents =
    sections.length >= 2
      ? `<nav class="contents" aria-label="Contents"><span class="contents__label">In this piece</span><ol>${sections
          .map((s) => `<li><a href="#s${s.n}"><span>${String(s.n).padStart(2, "0")}</span>${renderInline(s.text, { links: false })}</a></li>`)
          .join("")}</ol></nav>`
      : "";

  const state = approval
    ? `<span class="masthead__state" data-state="released">Signed r${revision}</span>`
    : `<span class="masthead__state" data-state="draft">Draft r${revision} · not released</span>`;

  const signature = approval
    ? `<span class="signature" data-state="signed"><span class="signature__line">${escapeHtml(reviewer)}<span class="chop" aria-hidden="true">${SPRIG}</span></span><span class="signature__label">Signed by ${escapeHtml(reviewer)} · ${signedOn}</span></span>`
    : `<span class="signature" data-state="unsigned"><span class="signature__line"></span><span class="signature__label">Not yet signed · awaiting ${escapeHtml(reviewer)}’s mark</span></span>`;

  const doors = sources.length
    ? `<div class="doors"><span class="doors__label">Sources</span><ol>${sources
        .map(([n, s]) => `<li><span class="n">${escapeHtml(n)}</span><a href="${escapeHtml(s.url)}">${escapeHtml(s.label)}</a></li>`)
        .join("")}</ol></div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${PIECE_GENERATOR}">
${approval ? "" : '<meta name="robots" content="noindex">\n'}<title>${escapeHtml(titleText)} · Agents for Introverts</title>
${deck ? `<meta name="description" content="${escapeHtml(plainText(deck))}">\n` : ""}<link rel="icon" href="${assets}/mark.png">
<link rel="stylesheet" href="${assets}/house.css">
</head>
<body>
<a class="skip" href="#piece">Skip to the piece</a>
<header class="masthead">
<a class="masthead__brand" href="https://agentsforintroverts.com/"><img src="${assets}/mark.png" alt=""><span>Agents for Introverts</span></a>
<span class="masthead__issue">${escapeHtml(issue)}</span>
${state}
</header>
<main class="piece" id="piece">
<article>
<header class="cover">
<p class="kicker">${renderInline(kicker)}</p>
<h1 class="title">${renderInline(titleMarkdown)}</h1>
<div class="cover__foot">
<div class="cover__words">
${deck ? `<p class="deck">${renderInline(deck)}</p>` : ""}
<p class="byline"><span><strong>${escapeHtml(byline)}</strong></span><span>Made with agents</span><span>${minutes} min read</span>${date ? `<span>${date}</span>` : ""}</p>
</div>
${contents}
</div>
</header>
${cover ? renderFigure(cover, 1) : ""}
<div class="body">
${renderBody(article, cover ? 1 : 0)}
</div>
<footer class="colophon" aria-label="Colophon">
<div class="colophon__head"><span>Colophon${manifest.number ? ` · No. ${String(manifest.number).padStart(3, "0")}` : ""}</span><span>Edition r${revision}</span></div>
<dl class="ledger">
<div><dt>The person</dt><dd><ul>${person.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul></dd></div>
<div><dt>The agents</dt><dd><ul>${agents.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul></dd></div>
</dl>
${doors}
<div class="mark-line"><p class="mark-line__words">${MARK_WORDS}</p>${signature}</div>
<div class="edition"><span>Printed from the Desk${date ? ` · ${date}` : ""}</span>${digest ? `<span>sha256 ${escapeHtml(String(digest).slice(0, 8))}…</span>` : ""}</div>
</footer>
</article>
</main>
<footer class="foot"><span>Agents for Introverts — from the work, into the world.</span><a href="https://agentsforintroverts.com/made-with/">How authorship works ↗</a></footer>
</body>
</html>
`;
}

// ---------- Cards ----------

function cardPage({ name, width, height, title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="generator" content="${PIECE_GENERATOR}">
<meta name="viewport" content="width=${width}">
<title>${escapeHtml(title)} · ${name} card</title>
<link rel="stylesheet" href="../assets/house.css">
<style>html, body { margin: 0; } .card { width: ${width}px; height: ${height}px; }</style>
</head>
<body class="card-page">
${body}
</body>
</html>
`;
}

/** Three images for the channels, as fixed-size pages the Desk rasterizes. */
export function renderCards({ manifest, article }) {
  const titleMarkdown = manifest.title || article.title || "Untitled";
  const title = renderInline(titleMarkdown, { links: false });
  const titleText = plainText(titleMarkdown);
  const deck = manifest.deck ?? article.deck;
  const kicker = manifest.kicker ?? (manifest.project ? `From the ${manifest.project} workbench` : "From the Desk");
  const lede = article.blocks.find((b) => b.type === "p" && b.lede)?.text;
  const opening = lede ? plainText(lede).match(/^.+?[.!?](?=\s|$)/)?.[0] : null;
  const quote = manifest.pull_quote ?? article.blocks.find((b) => b.type === "quote")?.text ?? deck ?? opening ?? titleText;
  const byline = manifest.byline ?? manifest.reviewer ?? "";
  const brand = `<div class="card__brand"><img src="../assets/mark.png" alt=""><span>Agents for Introverts</span></div>`;

  return {
    "link.html": cardPage({
      name: "Link",
      width: 1200,
      height: 630,
      title: titleText,
      body: `<main class="card card--link"><p class="card__kicker">${renderInline(kicker, { links: false })}</p><h1 class="card__title">${title}</h1>${deck ? `<p class="card__deck">${renderInline(deck, { links: false })}</p>` : ""}<footer class="card__foot">${brand}<span>${escapeHtml(byline)}${byline ? " · " : ""}made with agents</span></footer></main>`,
    }),
    "portrait.html": cardPage({
      name: "Portrait",
      width: 1080,
      height: 1350,
      title: titleText,
      body: `<main class="card card--portrait"><div class="card__sprig">${SPRIG}</div><blockquote class="card__quote">${renderInline(quote, { links: false })}</blockquote><p class="card__source">From “${escapeHtml(titleText)}”</p><footer class="card__foot">${brand}<span>${escapeHtml(byline)}</span></footer></main>`,
    }),
    "square.html": cardPage({
      name: "Square",
      width: 1080,
      height: 1080,
      title: titleText,
      body: `<main class="card card--square"><div class="card__plate"><p class="card__kicker">${renderInline(kicker, { links: false })}</p><h1 class="card__title">${title}</h1><footer class="card__foot">${brand}<span>made with agents</span></footer></div></main>`,
    }),
  };
}

// ---------- Where each piece stands ----------

function formKey(channel) {
  const lowered = String(channel).toLowerCase();
  if (["web", "essay", "site", "website"].includes(lowered)) return "web";
  return lowered.replace(/[^a-z0-9]/g, "");
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The state of every form of every piece, derived from the files: a
 * signature counts only while it matches the exact bytes, a publication only
 * with a receipt for them. A manifest's own status word is never trusted.
 */
export async function pieceStates(workspace) {
  const root = await realpath(resolve(workspace));
  let names;
  try {
    names = await readdir(join(root, "drafts"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const pieces = [];
  for (const name of names.sort()) {
    const dir = join(root, "drafts", name);
    const manifest = await readJson(join(dir, "piece.json"));
    if (!manifest || typeof manifest.title !== "string") continue;
    const forms = {};
    const candidates = [["web", manifest.canonical_text ?? "article.md"], ...(manifest.adaptations ?? []).map((a) => [formKey(a.channel), a.path])];
    for (const [key, path] of candidates) {
      if (typeof path !== "string" || key in forms) continue;
      const file = resolve(dir, path);
      if (!inside(dir, file)) continue;
      let bytes;
      try {
        bytes = await readFile(file);
      } catch {
        continue;
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      const receipt = await readJson(join(dir, "receipts", `${key}.json`));
      const approval = await readJson(join(dir, "approvals", `${key}.json`));
      if (receipt?.approved_payload_sha256 === digest && safeHref(receipt.public_url ?? "")) forms[key] = "published";
      else if (approval?.approved_by !== "human") forms[key] = "draft";
      else forms[key] = approval.payload_sha256 === digest ? "signed" : "changed_since_signed";
    }
    pieces.push({ folder: `drafts/${name}`, id: manifest.id ?? name, title: plainText(manifest.title), revision: Number(manifest.revision) || 1, forms });
  }
  return pieces;
}

// ---------- On disk ----------

async function readJsonFiles(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const records = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    try {
      records.push(JSON.parse(await readFile(join(dir, name), "utf8")));
    } catch {
      // A malformed record never signs anything.
    }
  }
  return records;
}

async function isOurs(path) {
  try {
    const text = await readFile(path, "utf8");
    return text.includes(`<meta name="generator" content="${PIECE_GENERATOR}">`);
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Render one piece in place. `piece` is its folder, relative to the workspace.
 * A hand-built page is never replaced unless `force` is set; render to another
 * `output` file to compare the two.
 */
export async function renderPiece({ workspace, piece, output = "index.html", force = false }) {
  const root = await realpath(resolve(workspace));
  const candidate = resolve(root, piece);
  if (!inside(root, candidate)) throw new Error("A piece must be a folder inside the workspace.");
  const dir = await realpath(candidate);
  if (!inside(root, dir)) throw new Error("A piece must be a folder inside the workspace.");

  const manifest = JSON.parse(await readFile(join(dir, "piece.json"), "utf8"));
  if (typeof manifest.title !== "string" || !manifest.title.trim() || manifest.title.length > 200) {
    throw new Error("piece.json needs a title of 1–200 characters.");
  }
  const canonicalPath = resolve(dir, manifest.canonical_text ?? "article.md");
  if (!inside(dir, canonicalPath)) throw new Error("The canonical text must be a file inside the piece.");
  const target = resolve(dir, output);
  if (!inside(dir, target) || !output.endsWith(".html")) throw new Error("Render to an .html file inside the piece.");

  const canonical = await readFile(canonicalPath, "utf8");
  const article = parseArticle(canonical);
  const approvals = await readJsonFiles(join(dir, "approvals"));

  if (!force && !(await isOurs(target))) {
    throw new Error(`This piece has a hand-built ${output}. Render to another file with --output, or pass --force.`);
  }
  const cards = renderCards({ manifest, article });
  for (const name of Object.keys(cards)) {
    if (!force && !(await isOurs(join(dir, "cards", name)))) throw new Error(`This piece has a hand-built cards/${name}.`);
  }

  await mkdir(join(dir, "assets", "fonts"), { recursive: true });
  await copyFile(join(HOUSE, "house.css"), join(dir, "assets", "house.css"));
  await copyFile(join(HOUSE, "mark.png"), join(dir, "assets", "mark.png"));
  for (const font of HOUSE_FONTS) await copyFile(join(HOUSE, "fonts", font), join(dir, "assets", "fonts", font));

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, renderPieceHtml({ manifest, article, canonical, approvals }));
  await mkdir(join(dir, "cards"), { recursive: true });
  for (const [name, html] of Object.entries(cards)) await writeFile(join(dir, "cards", name), html);

  return {
    piece: relative(root, dir),
    written: [relative(dir, target), ...Object.keys(cards).map((name) => `cards/${name}`)],
    signed: webApproval(approvals, canonical) !== null,
  };
}
