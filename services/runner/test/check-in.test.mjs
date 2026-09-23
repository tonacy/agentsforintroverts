import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareCheckIn, calibrateCheckIn, readCheckIn, historyConfiguration } from "../src/check-in.mjs";
import { researchOutside, validatePublicURL } from "../src/outside-research.mjs";
import { collect } from "../src/collect.mjs";
import { loadSources } from "../src/workspace.mjs";
import { runDay } from "../src/run-day.mjs";
import { fixtureProvider } from "../src/providers/fixture.mjs";
import { makeWorkspace, writeReadySources, writeCapture } from "./helpers.mjs";

const date = "2026-09-04";
const output = { recap: "Observed a folder-picker repair.", coverage: "Supplied context only.", evidence: ["User-supplied context"], question: "What mattered?" };
const provider = { converse: async () => ({ stop_reason: "end_turn", output }) };
const now = () => new Date("2026-09-04T12:00:00Z");
const prepare = workspace => prepareCheckIn({ workspace, date, context: "Test context", provider, now });

test("recap is agent-authored; only the person's response becomes human capture, then the pinned recap reaches synthesis", async () => {
  const workspace = await makeWorkspace();
  const recap = await prepare(workspace);
  assert.equal(recap.author, "agent");
  const reflection = "The fix matters because I can finally try the app.";
  await calibrateCheckIn({ workspace, date, revision: recap.revision, reflection, now });
  const capture = await readFile(join(workspace, "daily", date, "capture.md"), "utf8");
  assert.ok(capture.includes(reflection));
  assert.ok(!capture.includes(output.recap));
  await writeReadySources(workspace);
  let prompt;
  const fixture = fixtureProvider();
  const result = await runDay({ workspace, date, now, provider: { ...fixture, converse: async args => { prompt = args.user; return fixture.converse(args); } } });
  assert.equal(result.status, "completed");
  assert.ok(prompt.includes(output.recap));
  assert.ok(prompt.includes("remains agent-authored"));
  const record = JSON.parse(await readFile(join(workspace, "daily", date, "conversation.json")));
  assert.equal(record.reviewed_recall.revision, recap.revision);
  assert.equal(record.capture.authored_by, "human");
});

test("stale review, empty reflection, and an existing capture cannot be silently accepted or overwritten", async () => {
  const workspace = await makeWorkspace();
  const recap = await prepare(workspace);
  await assert.rejects(calibrateCheckIn({ workspace, date, revision: "stale", reflection: "yes" }), /changed/);
  await assert.rejects(calibrateCheckIn({ workspace, date, revision: recap.revision, reflection: "  " }), /Add what mattered/);
  await writeCapture(workspace, date, "Original words");
  await assert.rejects(calibrateCheckIn({ workspace, date, revision: recap.revision, reflection: "replacement" }), /preserved/);
  await assert.rejects(prepare(workspace), /already exists/);
  assert.ok((await readFile(join(workspace, "daily", date, "capture.md"), "utf8")).includes("Original words"));
});

test("changing a reviewed recap blocks synthesis before any model call", async () => {
  const workspace = await makeWorkspace(); const recap = await prepare(workspace);
  await calibrateCheckIn({ workspace, date, revision: recap.revision, reflection: "Looks right", now });
  const path = join(workspace, "daily", date, "recall.json");
  const record = JSON.parse(await readFile(path)); record.recap = "Changed observation";
  await writeFile(path, JSON.stringify(record)); await writeReadySources(workspace);
  const result = await runDay({ workspace, date, now, provider: { name: "spy", converse: () => assert.fail("must not synthesize") } });
  assert.deepEqual(result.blockers, ["reviewed_recall_changed"]);
});

test("supplied context needs no Computer History; failure leaves no saved recap", async () => {
  const workspace = await makeWorkspace();
  await prepareCheckIn({ workspace, date, context: "A note", provider, history: () => assert.fail("history was not requested") });
  const fresh = await makeWorkspace();
  await assert.rejects(prepareCheckIn({ workspace: fresh, date, context: "note", provider: { converse: async () => ({ stop_reason: "error" }) } }), /could not prepare/);
  assert.equal(await readCheckIn({ workspace: fresh, date }), null);
});

test("Computer History connection exposes status only and preserves installed command arguments", async () => {
  const workspace = await makeWorkspace();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(workspace, "skills/computer-history"), { recursive: true });
  await writeFile(join(workspace, "skills/computer-history/SKILL.md"), "Read status first.");
  const result = await historyConfiguration({ spawn: async () => ({ code: 0, stdout: JSON.stringify({ enabled: true, transport: { type: "stdio", cwd: workspace, command: "./launcher", args: ["computer-history", "mcp"] } }) }) });
  assert.ok(result.config.includes('mcp_servers.computer-history.enabled_tools=["computer_history_status"]'));
  assert.ok(!result.config.some(value => value.includes("update_settings")));
  assert.equal(result.skill, "Read status first.");
});

test("outside research receives only public topics, then verifies fetched URLs rather than trusting generated claims", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, date, "PRIVATE CANARY");
  let prompt;
  const result = await researchOutside({ workspace, date, topics: "Public agent interoperability", provider: { converse: async args => { prompt = args; return { stop_reason: "end_turn", output: { urls: ["https://example.com/research", "https://example.com/research"] } }; } }, collectImpl: async args => { assert.equal(args.pages.length, 1); assert.equal(args.refresh, true); assert.equal(typeof args.fetch, "function"); return { written: ["source"], skipped: [], errors: [] }; } });
  assert.ok(!JSON.stringify(prompt).includes("PRIVATE CANARY"));
  assert.deepEqual(result.written, ["source"]);
});

test("discovered sources cannot target private or authenticated endpoints", async () => {
  const privateDNS = async () => [{ address: "127.0.0.1" }];
  for (const url of ["https://example.com", "http://example.com", "https://user:pass@example.com", "https://localhost", "https://example.com:444"]) {
    await assert.rejects(validatePublicURL(url, privateDNS));
  }
  assert.equal((await validatePublicURL("https://example.com/source", async () => [{ address: "93.184.216.34" }])).pathname, "/source");
});

test("refresh stores new verification while preserving old evidence, and duplicate URLs count once", async () => {
  const workspace = await makeWorkspace();
  const fetch = async () => ({ ok: true, text: async () => "<title>Public source</title><p>Evidence.</p>" });
  const pages = [{ url: "https://example.com/one" }];
  await collect({ workspace, pages, fetch, now: () => new Date("2026-08-01T12:00:00Z") });
  assert.equal((await loadSources(workspace, { date })).length, 0);
  const result = await collect({ workspace, pages, fetch, now, refresh: true });
  assert.equal(result.written.length, 1);
  await collect({ workspace, pages, fetch, now, refresh: true });
  assert.equal((await loadSources(workspace, { date })).length, 1);
});

test("an HTTP 200 bot challenge is a fetch failure, not verified public evidence", async () => {
  const workspace = await makeWorkspace();
  const result = await collect({ workspace, pages: [{ url: "https://example.com" }], fetch: async () => ({ ok: true, text: async () => "<title>Client Challenge</title><p>Verify you are human</p>" }) });
  assert.equal(result.written.length, 0);
  assert.match(result.errors[0].error, /access challenge/);
});

test("provider-reported blockers are partial, never a completed quiet day", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, date); await writeReadySources(workspace);
  const result = await runDay({ workspace, date, now, provider: { name: "test", converse: async args => {
    assert.match(args.system, /LOCAL RUNNER ADAPTER/);
    return { stop_reason: "end_turn", output: { completion: { status: "partial", blocker: "Evidence is insufficient" }, honest_note: "Could not finish" } };
  } } });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.blockers, ["provider_reported_partial"]);
});
