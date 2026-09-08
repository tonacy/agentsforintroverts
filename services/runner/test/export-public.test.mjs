import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { runDay } from "../src/run-day.mjs";
import { exportPublic } from "../src/export-public.mjs";
import { fixtureProvider } from "../src/providers/fixture.mjs";
import { makeWorkspace, writeCapture, writeReadySources } from "./helpers.mjs";

const DATE = "2026-09-04";
const NOW = () => new Date("2026-09-04T08:00:00Z");

async function readyDay() {
  const workspace = await makeWorkspace();
  await writeCapture(workspace, DATE);
  await writeReadySources(workspace);
  const run = await runDay({ workspace, date: DATE, provider: fixtureProvider(), now: NOW });
  assert.equal(run.status, "completed");
  return workspace;
}

test("refuses without the explicit approval flag", async () => {
  const workspace = await readyDay();
  const result = await exportPublic({ workspace, date: DATE, approve: false, now: NOW });
  assert.notEqual(result.exitCode, 0);
  await assert.rejects(access(join(workspace, "daily", DATE, "public.json")));
});

test("writes a minimized afi.public_day.v1 with no capture text by default", async () => {
  const workspace = await readyDay();
  const result = await exportPublic({ workspace, date: DATE, approve: true, now: NOW });
  assert.equal(result.exitCode, 0);

  const day = JSON.parse(await readFile(join(workspace, "daily", DATE, "public.json"), "utf8"));
  assert.equal(day.schema, "afi.public_day.v1");
  assert.equal(day.date, DATE);
  assert.equal(day.weekday, "Friday");
  assert.equal(day.example, false);
  assert.equal(day.nothing_sent, true);
  assert.equal(day.inside, null, "capture verbatim is not public unless asked");
  assert.ok(Array.isArray(day.outside) && day.outside.length >= 1);
  for (const item of day.outside) {
    assert.equal(typeof item.surface, "string");
    assert.equal(typeof item.distillation, "string");
    for (const door of item.sources) {
      assert.deepEqual(Object.keys(door).sort(), ["label", "url"]);
      assert.match(door.url, /^https:\/\//);
    }
    assert.ok(item.disagreement === null || typeof item.disagreement === "string");
  }
  for (const [index, place] of day.places.entries()) {
    assert.equal(place.index, index + 1);
    assert.ok(["learn", "hold", "respond", "create", "ask", "meet"].includes(place.kind));
    assert.ok(["surfaced", "held", "draft ready"].includes(place.status));
  }
  assert.ok(day.context_used.some((c) => c.basis === "explicit"), "explicit positions from the capture");
  assert.ok(day.context_used.every((c) => ["explicit", "observed", "inferred"].includes(c.basis)));
  assert.equal(typeof day.generated_at, "string");
  assert.equal(typeof day.run_id, "string");
  // Minimization: nothing from the source records beyond label + url leaks.
  assert.equal(JSON.stringify(day).includes("content_hash"), false);
  assert.equal(JSON.stringify(day).includes("An example excerpt"), false);
});

test("--include-inside carries the capture, still marked human-authored", async () => {
  const workspace = await readyDay();
  await exportPublic({ workspace, date: DATE, approve: true, includeInside: true, now: NOW });
  const day = JSON.parse(await readFile(join(workspace, "daily", DATE, "public.json"), "utf8"));
  assert.equal(day.inside.authored_by, "human");
  assert.match(day.inside.text, /Wired the subscribe endpoint/);
  assert.equal(day.inside.mode_label, "short version");
});

test("--out copies the file to the site's content path", async () => {
  const workspace = await readyDay();
  const out = join(workspace, "site-day.json");
  await exportPublic({ workspace, date: DATE, approve: true, out, now: NOW });
  const copied = JSON.parse(await readFile(out, "utf8"));
  assert.equal(copied.schema, "afi.public_day.v1");
});

test("a context_ref of explicit-N is the Nth explicit position, not a new inference", async () => {
  const { toPublicDay } = await import("../src/export-public.mjs");
  const day = toPublicDay(
    {
      date: "2026-09-07",
      mode: "deep",
      capture: { positions: ["Agents may draft. They never send.", "Show the practice."], authored_by: "human", human_seed: "x" },
      developments: [],
      sources: [],
      places: [
        {
          title: "t",
          kind: "learn",
          why_it_fits: "f",
          what_to_add: "a",
          human_time: "0",
          source_item_ids: [],
          context_refs: ["explicit-2", "explicit-9", "avoids launch days"],
          fit_requires_confirmation: true,
        },
      ],
      return_tomorrow: { watch: [], open_question: null },
      honest_note: "",
    },
    { now: () => new Date("2026-09-07T00:00:00Z") },
  );
  assert.deepEqual(day.context_used, [
    { basis: "explicit", label: "Agents may draft. They never send." },
    { basis: "explicit", label: "Show the practice." },
    { basis: "inferred", label: "explicit-9" },
    { basis: "inferred", label: "avoids launch days" },
  ]);
});
