import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  COPY_DESK_GENERATOR,
  parseEssay,
  parsePosts,
  readDraft,
  renderCopyDesk,
  renderCopyDeskHtml,
  renderInline,
  splitThread,
} from "../src/copy-desk.mjs";
import { fixturesRoot } from "./helpers.mjs";

const KICKOFF = join(fixturesRoot, "drafts", "2026-10-15-kickoff");

async function deskWithKickoff() {
  const root = await mkdtemp(join(tmpdir(), "afi-copy-desk-"));
  await mkdir(join(root, "drafts"), { recursive: true });
  await cp(KICKOFF, join(root, "drafts", "2026-10-15-kickoff"), { recursive: true });
  return root;
}

function pageData(html) {
  const match = /<script type="application\/json" id="desk-data">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "the page carries its data");
  return JSON.parse(match[1]);
}

test("the kickoff draft reads into title, subtitle, one confirm line and its notes", async () => {
  const draft = await readDraft(KICKOFF);
  assert.equal(draft.name, "Kickoff");
  assert.equal(draft.revision, "7");
  assert.equal(draft.date, "2026-10-15");
  assert.equal(draft.title, "Why I'm handing over the keys to my agents");
  assert.equal(draft.subtitle, "I want to take part without living inside the feed. I'm working out how as I go.");
  assert.equal(draft.essay.confirms.length, 1);
  assert.match(draft.essay.confirms[0].plain, /^Across my projects/);
  assert.equal(draft.essay.notes.length, 1);
  assert.ok(draft.essay.blocks.every((b) => !b.plain.includes("<!--") && !b.plain.includes("Revision 7")));
  assert.equal(draft.essay.blocks.filter((b) => b.type === "h").length, 5);
});

test("posts.md splits into channels, the X thread into four posts, without emphasis marks", async () => {
  const draft = await readDraft(KICKOFF);
  assert.deepEqual(Object.keys(draft.posts), ["linkedin", "x", "threads"]);
  assert.equal(draft.posts.x.length, 4);
  assert.match(draft.posts.x[0], /^I spent weeks/);
  assert.ok(draft.posts.x.every((post) => post.length <= 280));
  assert.equal(draft.posts.linkedin.length, 1);
  assert.match(draft.posts.linkedin[0], /I've handed over the keys/);
  assert.ok(!draft.posts.linkedin[0].includes("*"));
  assert.equal(draft.steps.length, 5);
  assert.equal(draft.stepsNote, "About 20 minutes once the essay reads right.");
});

test("rendering writes one self-contained page into the draft and refuses a hand-built one", async () => {
  const root = await deskWithKickoff();
  try {
    const result = await renderCopyDesk({ workspace: root, draft: "drafts/2026-10-15-kickoff" });
    assert.deepEqual(result.written, ["drafts/2026-10-15-kickoff/copy-desk.html"]);
    const target = join(root, "drafts", "2026-10-15-kickoff", "copy-desk.html");
    const html = await readFile(target, "utf8");
    assert.ok(html.includes(`<meta name="generator" content="${COPY_DESK_GENERATOR}">`));
    assert.ok(html.includes("Agents for Introverts · Kickoff · Revision 7 · 15 Oct 2026"));
    assert.ok(html.includes("One essay, three posts."));
    const data = pageData(html);
    assert.equal(data.key, "cd:2026-10-15-kickoff:7:");
    assert.deepEqual(Object.keys(data.posts), ["linkedin", "x", "threads"]);

    // Rendering again replaces our own page.
    await renderCopyDesk({ workspace: root, draft: "drafts/2026-10-15-kickoff" });
    await writeFile(target, "<!doctype html><p>mine</p>");
    await assert.rejects(renderCopyDesk({ workspace: root, draft: "drafts/2026-10-15-kickoff" }), /hand-built/);
    const all = await renderCopyDesk({ workspace: root });
    assert.deepEqual(all, { written: [], skipped: ["drafts/2026-10-15-kickoff/copy-desk.html"] });
    await renderCopyDesk({ workspace: root, draft: "drafts/2026-10-15-kickoff", force: true });
    assert.ok((await readFile(target, "utf8")).includes(COPY_DESK_GENERATOR));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("without --draft every draft folder with words gets a page", async () => {
  const root = await deskWithKickoff();
  try {
    await mkdir(join(root, "drafts", "2026-10-22-second", "adaptations"), { recursive: true });
    await writeFile(join(root, "drafts", "2026-10-22-second", "article.md"), "# Second\n\nOne paragraph.\n");
    await writeFile(join(root, "drafts", "2026-10-22-second", "adaptations", "x.md"), "A single post.\n");
    await mkdir(join(root, "drafts", "empty"), { recursive: true });
    const result = await renderCopyDesk({ workspace: root });
    assert.deepEqual(result.written, [
      "drafts/2026-10-15-kickoff/copy-desk.html",
      "drafts/2026-10-22-second/copy-desk.html",
    ]);
    const data = pageData(await readFile(join(root, "drafts", "2026-10-22-second", "copy-desk.html"), "utf8"));
    assert.equal(data.title, "Second");
    assert.deepEqual(Object.keys(data.posts), ["x"]);
    assert.equal(data.steps.length, 5, "a draft with no checklist gets the default one");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a draft must stay inside the workspace", async () => {
  const root = await deskWithKickoff();
  try {
    await assert.rejects(renderCopyDesk({ workspace: root, draft: "../elsewhere" }), /inside the workspace/);
    await assert.rejects(renderCopyDesk({ workspace: root, draft: "drafts/2026-10-15-kickoff", output: "../x.html" }), /\.html file name/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("text is escaped, and only https links survive", () => {
  assert.equal(renderInline("<b>hi</b> *there*"), "&lt;b&gt;hi&lt;/b&gt; <em>there</em>");
  assert.equal(renderInline("[a](javascript:alert(1))"), "[a](javascript:alert(1))");
  assert.equal(renderInline("[a](https://example.com)"), '<a href="https://example.com/">a</a>');
  const html = renderCopyDeskHtml({
    folder: "x",
    name: "Odd",
    revision: null,
    date: null,
    title: "</script><script>alert(1)</script>",
    subtitle: "",
    essay: parseEssay("# T\n\nBody </script> text.\n"),
    posts: {},
    steps: ["One"],
    stepsNote: "",
  });
  assert.ok(!html.includes("</script><script>alert(1)"));
  assert.equal(pageData(html).title, "</script><script>alert(1)</script>");
});

test("thread markers, checklists and a deck parse on their own", () => {
  assert.deepEqual(splitThread("1/\nOne\n\n2/\nTwo *x*\n"), ["One", "Two x"]);
  assert.deepEqual(splitThread("Just one."), ["Just one."]);
  const posts = parsePosts("# Name: posts\n\n## LinkedIn\n\nHello.\n\n---\n\n## Publish checklist\n\n1. First\n   continued\n2. Second\n");
  assert.deepEqual(posts.posts, { linkedin: ["Hello."] });
  assert.deepEqual(posts.steps, ["First continued", "Second"]);
  const essay = parseEssay("# T\n\n*Deck line.*\n\nLead [CONFIRM: maybe] here.\n\n- a\n- b\n\n> quote\n");
  assert.equal(essay.subtitle, "Deck line.");
  assert.deepEqual(essay.blocks.map((b) => b.type), ["p", "ul", "quote"]);
  assert.equal(essay.blocks[0].plain, "Lead \u00010\u0001 here.");
});
