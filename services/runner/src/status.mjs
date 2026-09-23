/**
 * One day, as facts the app can show before and after a run: is there a
 * capture, are there enough sources, what did the last run say, does a
 * conversation exist, was it approved for the site.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readPreference } from "./preferences.mjs";
import { capturePath, loadCapture, loadSources, readJsonIfExists, readTextIfExists, weekdayOf } from "./workspace.mjs";

export const STATUS_SCHEMA = "afi.day_status.v1";

async function latestRun(workspace, date) {
  let names;
  try {
    names = await readdir(join(workspace, "runs"));
  } catch {
    return null;
  }
  const runs = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const run = await readJsonIfExists(join(workspace, "runs", name));
    if (run && run.date === date) runs.push(run);
  }
  runs.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  const run = runs[0];
  if (!run) return null;
  return {
    run_id: run.run_id,
    status: run.status,
    provider: run.provider ?? null,
    model: run.model ?? null,
    started_at: run.started_at ?? null,
    finished_at: run.finished_at ?? null,
    blockers: run.blockers ?? [],
    notes: run.notes ?? [],
    usage: run.usage ?? null,
  };
}

export async function dayStatus({ workspace, date, windowDays = 7, now = () => new Date() }) {
  const capture = await loadCapture(workspace, date);
  const sources = await loadSources(workspace, { date, windowDays });
  const lastCollected = sources.map((s) => s.captured_at).filter(Boolean).sort().at(-1) ?? null;

  const conversationMd = join(workspace, "daily", date, "daily-conversation.md");
  const conversation = await readJsonIfExists(join(workspace, "daily", date, "conversation.json"));
  const publicPath = join(workspace, "daily", date, "public.json");
  const publicExported = (await readTextIfExists(publicPath)) !== null;

  return {
    schema: STATUS_SCHEMA,
    date,
    weekday: weekdayOf(date),
    checked_at: now().toISOString(),
    capture: {
      exists: capture !== null,
      path: capturePath(workspace, date),
      author_human: capture?.authoredBy === "human",
    },
    sources: {
      verified_in_window: sources.length,
      window_days: windowDays,
      last_collected_at: lastCollected,
    },
    latest_run: await latestRun(workspace, date),
    conversation: {
      exists: conversation !== null,
      path: conversation?.mode === "no_new_input" ? null : conversation?.markdown_path ?? conversationMd,
      places: conversation?.places?.length ?? 0,
      developments: conversation?.developments?.length ?? 0,
      public_exported: publicExported,
      public_path: publicExported ? publicPath : null,
    },
    public_topics: (await readJsonIfExists(join(workspace, "preferences", "check-in.json")))?.public_topics ?? null,
    provider_preference: (await readPreference(workspace).then((p) => (p ? { provider: p.provider, model: p.model } : null))),
  };
}
