/**
 * Tony's public-approval gate. Nothing about a day leaves the workspace unless
 * this command is run with an explicit `--approve`, and even then the output is
 * minimized: source doors as label + url only, no hashes, no excerpts, and no
 * capture text unless `--include-inside` is also passed.
 */

import { join } from "node:path";
import { readJsonIfExists, weekdayOf, writeJson } from "./workspace.mjs";

export const PUBLIC_DAY_SCHEMA = "afi.public_day.v1";

const MODE_LABELS = { short: "short version", deep: "deeper look", no_new_input: "no new input" };
const KIND_LABELS = { rss: "feed", public_web: "web", newsletter: "newsletter", social_post: "post", human_daily_capture: "capture" };

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function surfaceLabel(development, sourcesById) {
  const kinds = [...new Set(development.source_item_ids.map((id) => KIND_LABELS[sourcesById.get(id)?.kind] ?? "source"))];
  const count = development.source_item_ids.length;
  return `${kinds.join(" + ")} · ${count} source${count === 1 ? "" : "s"}`;
}

function heldNote(day) {
  if (day.mode === "no_new_input") return "No new input today. Nothing was synthesized.";
  if (day.places.length === 0) return "No place earned attention today. Zero is a useful result.";
  return "Held until Tony decides. Nothing was sent.";
}

export function toPublicDay(conversation, { includeInside = false, now = () => new Date() } = {}) {
  const sourcesById = new Map((conversation.sources ?? []).map((s) => [s.source_item_id, s]));
  const explicit = (conversation.capture?.positions ?? []).map((label) => ({ basis: "explicit", label }));
  const seen = new Set(explicit.map((c) => c.label));
  const inferred = [];
  for (const place of conversation.places ?? []) {
    for (const ref of place.context_refs ?? []) {
      if (!seen.has(ref)) {
        seen.add(ref);
        inferred.push({ basis: "inferred", label: ref });
      }
    }
  }

  const day = {
    schema: PUBLIC_DAY_SCHEMA,
    date: conversation.date,
    weekday: conversation.weekday ?? weekdayOf(conversation.date),
    example: false,
    mode: conversation.mode,
    outside: (conversation.developments ?? []).map((development) => ({
      surface: surfaceLabel(development, sourcesById),
      distillation: development.distillation,
      sources: development.source_item_ids.map((id) => {
        const source = sourcesById.get(id);
        return { label: source?.title || hostLabel(source?.url ?? id), url: source?.url ?? "" };
      }),
      disagreement: development.disagreement ?? null,
    })),
    inside:
      includeInside && conversation.capture
        ? {
            text: (conversation.capture.human_seed || conversation.capture.verbatim || "").trim(),
            authored_by: conversation.capture.authored_by,
            mode_label: MODE_LABELS[conversation.mode] ?? conversation.mode,
          }
        : null,
    context_used: [...explicit, ...inferred],
    places: (conversation.places ?? []).map((place, index) => ({
      index: index + 1,
      kind: place.kind,
      title: place.title,
      fit: place.why_it_fits,
      status: place.kind === "hold" ? "held" : "surfaced",
    })),
    held_note: null,
    nothing_sent: true,
    generated_at: now().toISOString(),
    run_id: conversation.run_id,
  };
  day.held_note = heldNote(day);
  return day;
}

export async function exportPublic({ workspace, date, approve = false, includeInside = false, out, now = () => new Date() }) {
  if (!approve) {
    return { exitCode: 4, error: "Refusing to export without --approve. Public view is Tony's decision, not the runner's." };
  }
  const conversationPath = join(workspace, "daily", date, "conversation.json");
  const conversation = await readJsonIfExists(conversationPath);
  if (!conversation) {
    return { exitCode: 5, error: `No ${conversationPath}. Run run-day first.` };
  }
  const day = toPublicDay(conversation, { includeInside, now });
  const publicPath = join(workspace, "daily", date, "public.json");
  await writeJson(publicPath, day);
  const paths = { public: publicPath };
  if (out) {
    await writeJson(out, day);
    paths.out = out;
  }
  return { exitCode: 0, day, paths };
}
