import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFeed, extractPage, collect, prune } from "../src/collect.mjs";
import { makeWorkspace, fixturesRoot, sourceRecord, writeSource } from "./helpers.mjs";

const NOW = () => new Date("2026-09-04T08:00:00Z");

async function fixture(name) {
  return readFile(join(fixturesRoot, name), "utf8");
}

test("parses RSS 2.0 items", async () => {
  const items = parseFeed(await fixture("rss.xml"));
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Shipping without a launch day");
  assert.equal(items[0].link, "https://example.org/posts/no-launch-day");
  assert.equal(items[0].published, "2026-09-02T10:00:00.000Z");
  assert.match(items[0].summary, /^One reply argues/);
  assert.doesNotMatch(items[0].summary, /<[a-z]/i, "tags stripped");
});

test("parses Atom entries", async () => {
  const items = parseFeed(await fixture("atom.xml"));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Custom feeds, revisited");
  assert.equal(items[0].link, "https://example.net/2026/custom-feeds");
  assert.equal(items[0].published, "2026-09-01T00:00:00.000Z");
  assert.match(items[0].summary, /algorithmic choice/);
});

test("extracts a page's title, description, and first paragraphs, tags stripped", async () => {
  const page = extractPage(await fixture("page.html"));
  assert.equal(page.title, "Dittos: Mimetic, Reciprocal Agents");
  assert.match(page.description, /personal proxy agents/);
  assert.match(page.text, /^Abstract paragraph one\./);
  assert.match(page.text, /paragraph two/);
  assert.doesNotMatch(page.text, /paragraph three/, "only the first two paragraphs");
  assert.doesNotMatch(page.text, /<|script|cookie banner/i);
});

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const hit = routes[String(url)];
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(hit.body, { status: 200, headers: { "content-type": hit.type } });
  };
  return { fetchImpl, calls };
}

async function writeFeeds(workspace, feeds) {
  await writeFile(join(workspace, "preferences", "feeds.json"), JSON.stringify(feeds, null, 2));
}

test("writes one minimized source record per item and is idempotent by URL", async () => {
  const workspace = await makeWorkspace();
  await writeFeeds(workspace, {
    feeds: [{ url: "https://example.org/rss.xml", label: "Example blog" }],
    pages: [{ url: "https://example.com/dittos", label: "Dittos" }],
  });
  const { fetchImpl, calls } = fakeFetch({
    "https://example.org/rss.xml": { body: await fixture("rss.xml"), type: "application/rss+xml" },
    "https://example.com/dittos": { body: await fixture("page.html"), type: "text/html" },
  });

  const first = await collect({ workspace, fetch: fetchImpl, now: NOW });
  assert.equal(first.written.length, 3);
  assert.equal(first.errors.length, 0);
  assert.ok(calls.every((c) => !c.init?.headers?.authorization && !c.init?.headers?.cookie), "never authenticated");

  const files = (await readdir(join(workspace, "sources"))).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 3);
  assert.ok(files.every((f) => /^source_20260904_[a-z0-9-]+\.json$/.test(f)), files.join(","));

  const records = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(workspace, "sources", f), "utf8"))));
  for (const record of records) {
    assert.equal(record.schema, "afi.local_source_record.v1");
    assert.ok(["rss", "public_web"].includes(record.kind));
    assert.match(record.content_hash, /^sha256:[0-9a-f]{64}$/);
    assert.ok(record.excerpt.length <= 280);
    assert.equal(record.public_revalidation.status, "verified");
    assert.equal(record.public_revalidation.authenticated_origin_retained, false);
    assert.equal(record.retention.review_or_delete_at, "2026-10-04T08:00:00.000Z");
    assert.equal(record.retention.promotion_event_id, null);
    assert.equal(record.hub_eligible, true);
    assert.equal(record.evidence_class, "observed_public");
    assert.ok(["rss", "public_web"].includes(record.metadata.retrieval_method));
    assert.equal(record.metadata.visibility, "public");
    assert.equal(record.captured_at, "2026-09-04T08:00:00.000Z");
    // Template field parity: nothing missing, nothing extra.
    assert.deepEqual(Object.keys(record).sort(), Object.keys(sourceRecord()).sort());
  }
  const rss = records.filter((r) => r.kind === "rss");
  assert.equal(rss.length, 2);
  assert.equal(rss.find((r) => r.url.endsWith("no-launch-day")).metadata.published_at, "2026-09-02T10:00:00.000Z");

  const second = await collect({ workspace, fetch: fetchImpl, now: NOW });
  assert.equal(second.written.length, 0);
  assert.equal(second.skipped.length, 3);
});

test("respects --max and records fetch failures without throwing", async () => {
  const workspace = await makeWorkspace();
  await writeFeeds(workspace, {
    feeds: [{ url: "https://example.org/rss.xml", label: "Example blog" }],
    pages: [{ url: "https://example.com/missing", label: "Gone" }],
  });
  const { fetchImpl } = fakeFetch({
    "https://example.org/rss.xml": { body: await fixture("rss.xml"), type: "application/rss+xml" },
  });
  const result = await collect({ workspace, fetch: fetchImpl, now: NOW, max: 1 });
  assert.equal(result.written.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].url, /missing/);
});

test("prune deletes expired records unless promoted", async () => {
  const workspace = await makeWorkspace();
  await writeSource(workspace, sourceRecord({ source_item_id: "source_20260701_expired", retention: { class: "selected_public_source", review_or_delete_at: "2026-08-01T00:00:00Z", promotion_event_id: null } }));
  await writeSource(workspace, sourceRecord({ source_item_id: "source_20260701_promoted", retention: { class: "selected_public_source", review_or_delete_at: "2026-08-01T00:00:00Z", promotion_event_id: "evt_1" } }));
  await writeSource(workspace, sourceRecord({ source_item_id: "source_20260904_fresh" }));

  const result = await prune({ workspace, now: NOW });

  assert.deepEqual(result.deleted, ["source_20260701_expired"]);
  const files = (await readdir(join(workspace, "sources"))).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(files, ["source_20260701_promoted.json", "source_20260904_fresh.json"]);
});
