import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runDay } from "../src/run-day.mjs";
import { fixtureProvider } from "../src/providers/fixture.mjs";
import { makeWorkspace, writeCapture, writeReadySources, writeSource, sourceRecord } from "./helpers.mjs";

const DATE = "2026-09-04";
const NOW = () => new Date("2026-09-04T08:00:00Z");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function onlyRun(workspace) {
  const files = (await readdir(join(workspace, "runs"))).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 1, "exactly one run record");
  return readJson(join(workspace, "runs", files[0]));
}

test("fails closed without a capture and never calls the provider", async () => {
  const workspace = await makeWorkspace();
  await writeReadySources(workspace);
  let calls = 0;
  const provider = { name: "spy", model: "spy", converse: async () => { calls += 1; throw new Error("must not be called"); } };

  const result = await runDay({ workspace, date: DATE, provider, now: NOW });

  assert.equal(result.status, "failed");
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.blockers, ["capture_missing"]);
  assert.equal(calls, 0);
  const run = await onlyRun(workspace);
  assert.equal(run.status, "failed");
  assert.deepEqual(run.blockers, ["capture_missing"]);
});

test("no_new_input is a completed no-op: no provider call, no places", async () => {
  const workspace = await makeWorkspace();
  await writeReadySources(workspace);
  let calls = 0;
  const provider = { name: "spy", model: "spy", converse: async () => { calls += 1; throw new Error("must not be called"); } };

  const result = await runDay({ workspace, date: DATE, provider, mode: "no_new_input", now: NOW });

  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(calls, 0);
  const run = await onlyRun(workspace);
  assert.equal(run.completion_mode, "intentional_no_new_input");
  const dirs = await readdir(join(workspace, "places"));
  assert.deepEqual(dirs, []);
});

test("stops partial when fewer than two verified sources are inside the window", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  await writeSource(workspace, sourceRecord({ source_item_id: "source_20260904_only" }));
  // A second source, but stale: outside a 7-day window.
  await writeSource(workspace, sourceRecord({ source_item_id: "source_20260801_old", captured_at: "2026-08-01T00:00:00Z" }));
  // A third that is not revalidated as public.
  await writeSource(
    workspace,
    sourceRecord({
      source_item_id: "source_20260904_unverified",
      public_revalidation: { status: "pending", verified_at: null, verified_url: null, authenticated_origin_retained: false },
    }),
  );
  let calls = 0;
  const provider = { name: "spy", model: "spy", converse: async () => { calls += 1; throw new Error("must not be called"); } };

  const result = await runDay({ workspace, date: DATE, provider, now: NOW });

  assert.equal(result.status, "partial");
  assert.equal(result.exitCode, 3);
  assert.deepEqual(result.blockers, ["outside_context_not_ready"]);
  assert.equal(calls, 0);
});

test("a ready day writes the conversation, places, machine form, and run record", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  const ids = await writeReadySources(workspace);

  const result = await runDay({ workspace, date: DATE, provider: fixtureProvider(), now: NOW });

  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.exitCode, 0);

  const md = await readFile(join(workspace, "daily", DATE, "daily-conversation.md"), "utf8");
  assert.match(md, /^# Daily conversation — 2026-09-04/m);
  assert.match(md, /Source doors:.*https:\/\/example\.com\//);
  assert.match(md, /capture\.md/);
  assert.match(md, /- Status: completed/);

  const conversation = await readJson(join(workspace, "daily", DATE, "conversation.json"));
  assert.equal(conversation.schema, "afi.local_daily_conversation.v1");
  assert.ok(conversation.places.length >= 1 && conversation.places.length <= 3);
  for (const dev of conversation.developments) {
    for (const id of dev.source_item_ids) assert.ok(ids.includes(id), `${id} is a loaded source`);
  }
  assert.equal(typeof conversation.markdown_sha256, "string");

  const placeDirs = await readdir(join(workspace, "places"));
  assert.equal(placeDirs.length, conversation.places.length);
  const place = await readFile(join(workspace, "places", placeDirs[0], "place.md"), "utf8");
  assert.match(place, /- Status: surfaced/);
  assert.match(place, /- Decision:\s*$/m);

  const run = await onlyRun(workspace);
  assert.equal(run.status, "completed");
  assert.equal(run.provider, "fixture");
  assert.ok(run.usage);
  assert.deepEqual(run.validation_dropped, []);
});

test("the capture is copied verbatim into the conversation, never rewritten", async () => {
  const workspace = await makeWorkspace();
  const body = "# Day\n\n## Human seed\n\nI wrote this exactly, typos adn all.\n\n## Current position\n\n- one\n";
  await writeCapture(workspace, DATE, body);
  await writeReadySources(workspace);

  await runDay({ workspace, date: DATE, provider: fixtureProvider(), now: NOW });

  const md = await readFile(join(workspace, "daily", DATE, "daily-conversation.md"), "utf8");
  assert.match(md, /I wrote this exactly, typos adn all\./);
  const conversation = await readJson(join(workspace, "daily", DATE, "conversation.json"));
  assert.match(conversation.capture.verbatim, /typos adn all/);
  assert.equal(conversation.capture.authored_by, "human");
});

test("drops model claims that cite unknown sources and records what was dropped", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  const ids = await writeReadySources(workspace);
  const provider = {
    name: "fixture",
    model: "fixture",
    async converse() {
      return {
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
        output: {
          developments: [
            { title: "Good", distillation: "d", source_item_ids: [ids[0]], disagreement: null, why_it_matters: "w" },
            { title: "Invented", distillation: "d", source_item_ids: ["source_made_up"], disagreement: null, why_it_matters: "w" },
          ],
          inside_reading: { established_positions: ["Agents may draft."], forming: [] },
          places: [
            { title: "P1", kind: "learn", why_it_fits: "f", what_to_add: "a", human_time: "10 min", source_item_ids: [ids[1]], context_refs: [], fit_requires_confirmation: false },
            { title: "P2", kind: "respond", why_it_fits: "f", what_to_add: "a", human_time: "10 min", source_item_ids: ["nope"], context_refs: [], fit_requires_confirmation: false },
            { title: "P3", kind: "hold", why_it_fits: "f", what_to_add: "a", human_time: "10 min", source_item_ids: [ids[0]], context_refs: [], fit_requires_confirmation: true },
            { title: "P4", kind: "hold", why_it_fits: "f", what_to_add: "a", human_time: "10 min", source_item_ids: [ids[0]], context_refs: [], fit_requires_confirmation: true },
            { title: "P5", kind: "ask", why_it_fits: "f", what_to_add: "a", human_time: "10 min", source_item_ids: [ids[1]], context_refs: [], fit_requires_confirmation: true },
          ],
          return_tomorrow: { watch: [], open_question: null },
          honest_note: "n",
        },
      };
    },
  };

  const result = await runDay({ workspace, date: DATE, provider, now: NOW });

  assert.equal(result.status, "completed");
  const conversation = await readJson(join(workspace, "daily", DATE, "conversation.json"));
  assert.equal(conversation.developments.length, 1);
  assert.equal(conversation.places.length, 3, "P2 dropped for its source, P5 dropped by the ceiling of three");
  const run = await onlyRun(workspace);
  assert.equal(run.validation_dropped.length, 3);
  assert.deepEqual(
    run.validation_dropped.map((d) => d.title),
    ["Invented", "P2", "P5"],
  );
  assert.ok(run.validation_dropped.every((d) => typeof d.reason === "string"));
});

test("everything dropped means partial", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  await writeReadySources(workspace);
  const provider = {
    name: "fixture",
    model: "fixture",
    async converse() {
      return {
        stop_reason: "end_turn",
        usage: {},
        output: {
          developments: [{ title: "x", distillation: "d", source_item_ids: ["ghost"], disagreement: null, why_it_matters: "w" }],
          inside_reading: { established_positions: [], forming: [] },
          places: [],
          return_tomorrow: { watch: [], open_question: null },
          honest_note: "n",
        },
      };
    },
  };
  const result = await runDay({ workspace, date: DATE, provider, now: NOW });
  assert.equal(result.status, "partial");
  assert.ok(result.blockers.includes("no_source_backed_claims"));
});

test("a refusal or truncated provider answer is a failed run", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  await writeReadySources(workspace);
  const provider = { name: "fixture", model: "fixture", converse: async () => ({ stop_reason: "max_tokens", usage: {}, output: null }) };
  const result = await runDay({ workspace, date: DATE, provider, now: NOW });
  assert.equal(result.status, "failed");
  assert.ok(result.blockers.includes("provider_stop_max_tokens"));
});

test("never overwrites a daily-conversation.md that Tony edited", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  await writeReadySources(workspace);
  await runDay({ workspace, date: DATE, provider: fixtureProvider(), now: NOW });

  const path = join(workspace, "daily", DATE, "daily-conversation.md");
  const edited = `${await readFile(path, "utf8")}\n\nTony's note: keep this.\n`;
  await writeFile(path, edited);

  const second = await runDay({ workspace, date: DATE, provider: fixtureProvider(), now: () => new Date("2026-09-04T09:00:00Z") });

  assert.equal(await readFile(path, "utf8"), edited, "the edited file is untouched");
  const files = await readdir(join(workspace, "daily", DATE));
  const sidecar = files.find((f) => f.startsWith("daily-conversation.") && f.endsWith(".md") && f !== "daily-conversation.md");
  assert.ok(sidecar, `sidecar written: ${files.join(", ")}`);
  assert.ok(second.notes.some((n) => /edited/.test(n)));
});
