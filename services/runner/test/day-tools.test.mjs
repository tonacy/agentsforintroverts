import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readPreference, writePreference } from "../src/preferences.mjs";
import { dayStatus } from "../src/status.mjs";
import { newCapture } from "../src/capture.mjs";
import { runDay } from "../src/run-day.mjs";
import { makeWorkspace, writeCapture, writeReadySources } from "./helpers.mjs";

const DATE = "2026-09-04";
const NOW = () => new Date("2026-09-04T08:00:00Z");

test("preference: absent by default, then written with the schema and read back", async () => {
  const workspace = await makeWorkspace();
  assert.equal(await readPreference(workspace), null);

  const saved = await writePreference(workspace, { provider: "claude", model: "opus", now: NOW });
  assert.equal(saved.schema, "afi.provider_preference.v1");
  assert.equal(saved.provider, "claude");
  assert.equal(saved.model, "opus");
  assert.equal(saved.chosen_at, "2026-09-04T08:00:00.000Z");

  const onDisk = JSON.parse(await readFile(join(workspace, "preferences", "provider.json"), "utf8"));
  assert.deepEqual(onDisk, saved);
  assert.deepEqual(await readPreference(workspace), saved);
});

test("preference: refuses an unknown provider id", async () => {
  const workspace = await makeWorkspace();
  await assert.rejects(() => writePreference(workspace, { provider: "gemini" }), /Unknown provider/);
});

test("capture new: creates today's capture from the template once, never overwrites", async () => {
  const workspace = await makeWorkspace();
  const first = await newCapture({ workspace, date: DATE, now: NOW });
  assert.equal(first.created, true);
  assert.equal(first.path, join(workspace, "daily", DATE, "capture.md"));

  const text = await readFile(first.path, "utf8");
  assert.match(text, /^---\n/);
  assert.match(text, /author: human/);
  assert.match(text, /id: capture_20260904_day/);
  assert.match(text, /created_at: 2026-09-04T08:00:00Z/);
  assert.match(text, /# Friday/);
  assert.match(text, /## Human seed/);

  const again = await newCapture({ workspace, date: DATE, now: NOW });
  assert.equal(again.created, false);
  assert.equal(await readFile(first.path, "utf8"), text);
});

test("status: an untouched day", async () => {
  const workspace = await makeWorkspace();
  const status = await dayStatus({ workspace, date: DATE, now: NOW });
  assert.equal(status.schema, "afi.day_status.v1");
  assert.equal(status.weekday, "Friday");
  assert.equal(status.capture.exists, false);
  assert.equal(status.capture.author_human, false);
  assert.equal(status.sources.verified_in_window, 0);
  assert.equal(status.sources.window_days, 7);
  assert.equal(status.sources.last_collected_at, null);
  assert.equal(status.latest_run, null);
  assert.equal(status.conversation.exists, false);
  assert.equal(status.conversation.public_exported, false);
  assert.equal(status.provider_preference, null);
});

test("status: after a run, reports the capture, sources, latest run, and conversation counts", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  await writeReadySources(workspace);
  await writePreference(workspace, { provider: "fixture", now: NOW });
  const result = await runDay({ workspace, date: DATE, now: NOW });
  assert.equal(result.status, "completed");

  const status = await dayStatus({ workspace, date: DATE, now: NOW });
  assert.equal(status.capture.exists, true);
  assert.equal(status.capture.author_human, true);
  assert.equal(status.sources.verified_in_window, 2);
  assert.equal(status.sources.last_collected_at, "2026-09-04T06:00:00Z");
  assert.equal(status.latest_run.run_id, result.runId);
  assert.equal(status.latest_run.status, "completed");
  assert.equal(status.latest_run.provider, "fixture");
  assert.equal(status.conversation.exists, true);
  assert.equal(status.conversation.places, 2);
  assert.equal(status.conversation.developments, 2);
  assert.equal(status.conversation.public_exported, false);
  assert.deepEqual(status.provider_preference, { provider: "fixture", model: null });
});

test("run-day: with no --provider, the workspace preference decides; without one, the sample provider", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  await writeReadySources(workspace);

  const noPreference = await runDay({ workspace, date: DATE, now: NOW });
  assert.equal(noPreference.status, "completed");
  const runs = JSON.parse(await readFile(join(workspace, "runs", `${noPreference.runId}.json`), "utf8"));
  assert.equal(runs.provider, "fixture");

  await writePreference(workspace, { provider: "codex", model: "gpt-5" });
  const spy = { name: "spy", model: "spy", converse: async () => ({ stop_reason: "end_turn", usage: {}, output: null }) };
  // An explicit provider object still wins over the preference.
  const explicit = await runDay({ workspace, date: DATE, provider: spy, now: NOW });
  assert.equal(explicit.status, "failed");
  const explicitRun = JSON.parse(await readFile(join(workspace, "runs", `${explicit.runId}.json`), "utf8"));
  assert.equal(explicitRun.provider, "spy");
});

test("run-day: a harness that is not signed in is a named blocker, not a crash", async () => {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  await writeReadySources(workspace);
  const notSignedIn = {
    name: "claude",
    model: null,
    converse: async () => ({ stop_reason: "not_signed_in", stop_details: { message: "Not logged in" }, usage: null, output: null }),
  };
  const result = await runDay({ workspace, date: DATE, provider: notSignedIn, now: NOW });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.blockers, ["provider_stop_not_signed_in"]);
});

test("sources collected after UTC midnight still count for the local date they were collected on", async () => {
  const { loadSources } = await import("../src/workspace.mjs");
  const { writeSource, sourceRecord } = await import("./helpers.mjs");
  const workspace = await makeWorkspace();
  await writeSource(workspace, sourceRecord({ source_item_id: "source_20260905_late", captured_at: "2026-09-05T03:00:00Z" }));
  await writeSource(workspace, sourceRecord({ source_item_id: "source_20260907_toolate", captured_at: "2026-09-07T03:00:00Z" }));
  const sources = await loadSources(workspace, { date: DATE, windowDays: 7 });
  assert.deepEqual(sources.map((s) => s.source_item_id), ["source_20260905_late"]);
});
