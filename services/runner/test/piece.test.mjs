import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PIECE_GENERATOR,
  parseArticle,
  renderCards,
  renderInline,
  renderPiece,
  renderPieceHtml,
} from "../src/piece.mjs";

const ARTICLE = `# A conversation that stays

*A broken connection should not send a conversation back to the beginning.*

A visitor asks for help. Kit replies. Then the connection drops.

## Give the conversation a home

The saved record lives on the server, in a Durable Object. [1]

> The connection can be temporary. The conversation can keep its place.

## Restore from what was saved

- Up to 250 messages
- In conversation order

![A browser reconnects to the same saved conversation.](assets/continuity.svg "The saved conversation stays beneath all three states.")

[1]: https://developers.cloudflare.com/durable-objects/ "What are Durable Objects?"

---
Prepared by Codex for review. Not approved or published.
`;

const MANIFEST = {
  schema: "afi.piece.prototype.v1",
  id: "kit-conversation-that-stays",
  revision: 1,
  status: "draft_for_review",
  project: "Kit",
  title: "A conversation that *stays.*",
  created_at: "2026-09-11",
  authored_by: "Codex",
  reviewer: "Tony",
  human_approved: false,
  canonical_text: "article.md",
  adaptations: [
    { channel: "Substack", path: "adaptations/substack.md" },
    { channel: "LinkedIn", path: "adaptations/linkedin.md" },
  ],
};

test("an article becomes a title, a deck, numbered sections, sources and a postscript", () => {
  const article = parseArticle(ARTICLE);
  assert.equal(article.title, "A conversation that stays");
  assert.equal(article.deck, "A broken connection should not send a conversation back to the beginning.");
  const sections = article.blocks.filter((b) => b.type === "h2");
  assert.deepEqual(sections.map((s) => [s.n, s.text]), [
    [1, "Give the conversation a home"],
    [2, "Restore from what was saved"],
  ]);
  assert.equal(article.blocks.find((b) => b.type === "p").lede, true);
  assert.deepEqual(article.references["1"], {
    url: "https://developers.cloudflare.com/durable-objects/",
    label: "What are Durable Objects?",
  });
  assert.deepEqual(article.blocks.find((b) => b.type === "ul").items, ["Up to 250 messages", "In conversation order"]);
  assert.equal(article.blocks.find((b) => b.type === "quote").text, "The connection can be temporary. The conversation can keep its place.");
  assert.deepEqual(article.postscript, ["Prepared by Codex for review. Not approved or published."]);
  assert.ok(article.words > 40 && article.words < 120);
});

test("a plain first paragraph is the lede, not the deck", () => {
  const article = parseArticle("# Title\n\nA broken connection should not reset a conversation.\n\nSecond paragraph.");
  assert.equal(article.deck, null);
  const [first, second] = article.blocks;
  assert.equal(first.lede, true);
  assert.equal(second.lede, undefined);
});

test("a break in the middle stays a break; only a trailing run of paragraphs is a postscript", () => {
  const article = parseArticle("# T\n\nOne.\n\n---\n\nTwo.\n\n## Later\n\nThree.");
  assert.deepEqual(article.postscript, []);
  assert.ok(article.blocks.some((b) => b.type === "break"));
});

test("inline text is escaped and only credential-free https links survive", () => {
  assert.equal(renderInline("<script>alert(1)</script> & \"quotes\""), "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;");
  assert.equal(renderInline("*quiet* and **sure** and `code`"), "<em>quiet</em> and <strong>sure</strong> and <code>code</code>");
  assert.equal(renderInline("[docs](https://example.com/a?b=1&c=2)"), '<a href="https://example.com/a?b=1&amp;c=2">docs</a>');
  assert.equal(renderInline("[bad](javascript:alert(1))"), "bad");
  assert.equal(renderInline("[plain](http://example.com)"), "plain");
  assert.equal(renderInline("[secret](https://user:pw@example.com)"), "secret");
  assert.equal(renderInline('[x](https://example.com/"onmouseover="alert(1))'), '<a href="https://example.com/%22onmouseover=%22alert(1)">x</a>');
});

test("a numbered reference becomes a sidenote beside its paragraph; unknown numbers stay text", () => {
  const html = renderPieceHtml({ manifest: MANIFEST, article: parseArticle(ARTICLE) });
  assert.match(html, /<div class="row"><p>The saved record lives on the server, in a Durable Object\. <a class="ref" href="#note-1" id="ref-1">1<\/a><\/p><ol class="notes"><li id="note-1"><span class="n">1<\/span><a href="https:\/\/developers\.cloudflare\.com\/durable-objects\/">What are Durable Objects\?<\/a><\/li><\/ol><\/div>/);
  const unknown = renderPieceHtml({ manifest: MANIFEST, article: parseArticle("# T\n\nSee [7] later.") });
  assert.match(unknown, /See \[7\] later\./);
});

test("figures must stay inside the piece or be https", () => {
  const ok = parseArticle("# T\n\n![Inside](assets/fig.svg)");
  assert.equal(ok.blocks[0].type, "figure");
  for (const src of ["../outside.svg", "/etc/passwd", "file:///etc/passwd", "http://example.com/x.png", "assets/../../x.png"]) {
    const article = parseArticle(`# T\n\n![Nope](${src})`);
    assert.equal(article.blocks.some((b) => b.type === "figure"), false, src);
  }
});

test("the reader page is a draft until the exact words carry the person's mark", () => {
  const html = renderPieceHtml({ manifest: MANIFEST, article: parseArticle(ARTICLE) });
  assert.match(html, new RegExp(`<meta name="generator" content="${PIECE_GENERATOR}">`));
  assert.match(html, /<h1 class="title">A conversation that <em>stays\.<\/em><\/h1>/);
  assert.match(html, /<p class="deck">A broken connection should not send a conversation back to the beginning\.<\/p>/);
  assert.match(html, /data-state="draft"[^>]*>Draft r1 · not released/);
  assert.match(html, /<span class="n">01<\/span>Give the conversation a home/);
  assert.match(html, /<blockquote class="pull"><p>The connection can be temporary\./);
  assert.match(html, /<figure class="plate">[\s\S]*src="assets\/continuity\.svg"[\s\S]*The saved conversation stays beneath all three states\./);
  assert.match(html, /adapted for Substack and LinkedIn/);
  assert.match(html, /class="signature" data-state="unsigned"/);
  assert.match(html, /The point of view is mine, and the agents helped it travel\./);
  assert.doesNotMatch(html, /<script/);
});

test("a valid approval of the canonical words signs the page; any edit unsigns it", () => {
  const article = parseArticle(ARTICLE);
  const digest = createHash("sha256").update(ARTICLE).digest("hex");
  const approval = { form: "web", payload_sha256: digest, approved_at: "2026-09-14T10:00:00Z", approved_by: "human" };
  const signed = renderPieceHtml({ manifest: MANIFEST, article, canonical: ARTICLE, approvals: [approval] });
  assert.match(signed, /class="signature" data-state="signed"/);
  assert.match(signed, /Signed by Tony · 14 Sept 2026/);
  assert.match(signed, /data-state="released"[^>]*>Signed r1/);

  const stale = renderPieceHtml({ manifest: MANIFEST, article, canonical: ARTICLE + "\nOne more line.", approvals: [approval] });
  assert.match(stale, /class="signature" data-state="unsigned"/);
});

test("social cards are fixed-size pages in the same house style", () => {
  const cards = renderCards({ manifest: MANIFEST, article: parseArticle(ARTICLE) });
  assert.deepEqual(Object.keys(cards).sort(), ["link.html", "portrait.html", "square.html"]);
  assert.match(cards["link.html"], /width: 1200px; height: 630px/);
  assert.match(cards["portrait.html"], /width: 1080px; height: 1350px/);
  assert.match(cards["square.html"], /width: 1080px; height: 1080px/);
  assert.match(cards["link.html"], /A conversation that <em>stays\.<\/em>/);
  assert.match(cards["portrait.html"], /The connection can be temporary\. The conversation can keep its place\./);
});

async function pieceFixture(t, { index } = {}) {
  const root = await mkdtemp(join(tmpdir(), "afi-piece-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "drafts", "2026-09-11-a-conversation");
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "piece.json"), JSON.stringify(MANIFEST));
  await writeFile(join(dir, "article.md"), ARTICLE);
  await writeFile(join(dir, "assets", "continuity.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  if (index) await writeFile(join(dir, "index.html"), index);
  return { root, dir, rel: "drafts/2026-09-11-a-conversation" };
}

test("rendering writes a self-contained piece: page, house style, fonts and cards", async (t) => {
  const { root, dir, rel } = await pieceFixture(t);
  const result = await renderPiece({ workspace: root, piece: rel });
  assert.deepEqual(result.written.sort(), ["cards/link.html", "cards/portrait.html", "cards/square.html", "index.html"]);
  const html = await readFile(join(dir, "index.html"), "utf8");
  assert.match(html, /href="assets\/house\.css"/);
  assert.ok((await stat(join(dir, "assets", "house.css"))).size > 1000);
  assert.ok((await stat(join(dir, "assets", "fonts", "newsreader-roman.woff2"))).size > 1000);
  assert.ok((await stat(join(dir, "assets", "mark.png"))).size > 1000);
  const card = await readFile(join(dir, "cards", "link.html"), "utf8");
  assert.match(card, /href="\.\.\/assets\/house\.css"/);
  // Rendering again is safe: the page is ours.
  await renderPiece({ workspace: root, piece: rel });
});

test("a hand-built page is never overwritten without force", async (t) => {
  const { root, dir, rel } = await pieceFixture(t, { index: "<!doctype html><p>Made by hand</p>" });
  await assert.rejects(renderPiece({ workspace: root, piece: rel }), /hand-built index\.html/);
  assert.equal(await readFile(join(dir, "index.html"), "utf8"), "<!doctype html><p>Made by hand</p>");
  const result = await renderPiece({ workspace: root, piece: rel, output: "edition.html" });
  assert.ok(result.written.includes("edition.html"));
  assert.equal(await readFile(join(dir, "index.html"), "utf8"), "<!doctype html><p>Made by hand</p>");
});

test("a piece must live inside the workspace and name its own words", async (t) => {
  const { root, dir, rel } = await pieceFixture(t);
  await assert.rejects(renderPiece({ workspace: root, piece: "../elsewhere" }), /inside the workspace/);
  await writeFile(join(dir, "piece.json"), JSON.stringify({ ...MANIFEST, canonical_text: "../../context/context.md" }));
  await assert.rejects(renderPiece({ workspace: root, piece: rel }), /canonical text/);
  await writeFile(join(dir, "piece.json"), JSON.stringify({ ...MANIFEST, title: "" }));
  await assert.rejects(renderPiece({ workspace: root, piece: rel }), /title/);
});
