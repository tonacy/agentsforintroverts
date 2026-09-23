import { reviewedRecall } from "./check-in.mjs";
/**
 * One daily conversation, locally.
 *
 * This is the smallest honest version of the loop in `docs/DAILY_CONVERSATION.md`:
 * outside context (verified public sources) + Tony's explicit capture → one
 * bounded model run → zero to three Places, all held. No hub, no MCP transport,
 * no external action of any kind. The gates below are the ones the role prompt
 * describes; they fail closed and record why.
 */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleAgent } from "../../../agents/assemble.mjs";
import { renderTemplate } from "./context-render.mjs";
import { conversationSchema, validateConversation } from "./schema.mjs";
import { fixtureProvider } from "./providers/fixture.mjs";
import { readPreference } from "./preferences.mjs";
import {
  loadCapture,
  loadSources,
  makeRunId,
  readJsonIfExists,
  readTextIfExists,
  sha256,
  slugify,
  weekdayOf,
  writeJson,
  writeText,
} from "./workspace.mjs";

export const CONVERSATION_SCHEMA = "afi.local_daily_conversation.v1";
export const RUN_SCHEMA = "afi.local_run.v1";
export const ROLE = "afi.daily-conversation";
export const MIN_SOURCES = 2;
export const MODES = ["short", "deep", "no_new_input"];

const EXIT = { completed: 0, failed: 2, partial: 3 };

export const runnerRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function resolveProvider({ provider, model, workspace }) {
  if (provider && typeof provider === "object") return provider;
  if (!provider) {
    // No flag: the workspace preference the app wrote decides; failing that, the sample.
    const preference = await readPreference(workspace);
    provider = preference?.provider ?? "fixture";
    model = model ?? preference?.model ?? null;
  }
  if (provider === "fixture") return fixtureProvider();
  if (provider === "anthropic") {
    // Loaded lazily so the tests never need the SDK or a credential.
    const { anthropicProvider } = await import("./providers/anthropic.mjs");
    return model ? anthropicProvider({ model }) : anthropicProvider();
  }
  if (provider === "claude" || provider === "codex") {
    const { claudeProvider, codexProvider } = await import("./providers/harness.mjs");
    const { detectProviders } = await import("./providers/detect.mjs");
    const catalog = await detectProviders();
    const entry = catalog.providers.find((p) => p.id === provider);
    const bin = entry?.path ?? provider;
    return provider === "claude" ? claudeProvider({ bin, model }) : codexProvider({ bin, model });
  }
  throw new Error(`Unknown provider ${JSON.stringify(provider)}. Expected claude, codex, anthropic, or fixture.`);
}

function contextVariables({ workspace, date, runId, mode, sources, capture, provider, now, windowDays }) {
  const nowIso = now.toISOString();
  return {
    workspace_id: workspace,
    local_time: nowIso,
    quiet_hours: "none",
    read_only_mode: "true",
    agent_key: ROLE,
    connection_id: "local-runner",
    provider: provider.name,
    run_id: runId,
    trigger: "manual",
    max_iterations: 1,
    context_budget_tokens: 80000,
    context_built_at: nowIso,
    capabilities_checked_at: nowIso,
    source_capabilities: sources.length
      ? [...new Set(sources.map((s) => s.kind))].map((kind) => ({ kind, operations: "read", scope: "public only", last_synced_at: nowIso }))
      : [],
    // Authenticated surfaces are never touched by this runner.
    x_surface: "not_requested",
    x_expected_account_handle: "not_checked",
    x_visibly_verified_account_handle: "not_checked",
    x_account_identity_match: "not_checked",
    x_account_identity_verified_at: "not_checked",
    x_following_verified: "not_checked",
    x_following_verified_at: "not_checked",
    linkedin_scope: "not_requested",
    denied_surfaces_encountered: "none",
    authenticated_feed_cues: [],
    current_day_recall_cues: [],
    daily_conversation_mode: mode,
    fragmentation_hypothesis: "none",
    fragmentation_human_calibration: "none",
    daily_conversation_mode_confirmed_at: nowIso,
    active_lane_recommendation: "none",
    outside_context_status: "ready",
    outside_window_start: new Date(Date.parse(`${date}T00:00:00Z`) - windowDays * 86_400_000).toISOString(),
    outside_window_end: `${date}T23:59:59Z`,
    outside_corpus_scope: "verified public source records in the local workspace",
    outside_source_limit: sources.length,
    outside_coverage_notes:
      "Local collector: configured RSS/pages and individually verified public pages discovered through the public-topics research step. No authenticated surfaces. Recurrence across pockets is not established by this corpus.",
    outside_source_observations: sources.map((s) => ({
      source_item_id: s.source_item_id,
      kind: s.kind,
      captured_at: s.captured_at,
      content_hash: s.content_hash,
      source_url: s.url,
      // No hub receipt exists for a local run; say so rather than invent one.
      observation_event_id: "local-only",
    })),
    daily_capture_status: capture ? "captured" : "missing",
    daily_capture_id: capture?.frontmatter?.id ?? "none",
    daily_capture_authored_by_user: capture ? String(capture.authoredBy === "human") : "false",
    daily_capture_at: capture?.frontmatter?.created_at ?? "none",
    daily_capture_context_authorized: capture ? "true" : "false",
    daily_capture_verbatim: capture ? capture.raw : "none",
    recent_feed_items: [],
    context_revision: "local",
    context_updated_at: capture?.frontmatter?.created_at ?? "none",
    context_statements: (capture?.positions ?? []).map((statement, index) => ({
      id: `explicit-${index + 1}`,
      kind: "position",
      basis: "explicit",
      confidence: "stated",
      statement,
      source_refs: [capture.relativePath],
    })),
    recurring_threads: [],
    open_places: [],
    returned_place_signals: [],
    pilot_evaluations: [],
    open_proposals: [],
    checkpoints: [],
  };
}

function sourceSheet(sources) {
  return sources
    .map(
      (s) =>
        `- ${s.source_item_id} · ${s.kind} · ${s.title ?? "untitled"} · ${s.url}\n  captured ${s.captured_at} · published ${s.metadata?.published_at ?? "unknown"} · hash ${s.content_hash}\n  excerpt: ${s.excerpt ?? ""}`,
    )
    .join("\n");
}

function userMessage({ context, capture, sources, mode, recall }) {
  return [
    context,
    "",
    "## Source records available to this run",
    "",
    "These are the only sources you may cite. Cite them by source_item_id. Retrieval is not publication: if publication time is unknown or old, never describe the item as a new development without dated evidence.",
    "",
    sourceSheet(sources),
    "",
    ...(recall ? ["## Agent-observed recap, reviewed by Tony", JSON.stringify(recall), "The recap remains agent-authored and uncertain. Human corrections below take precedence. Do not attribute the recap wording to Tony."] : []),
    "## Today's capture, verbatim, authored by Tony",
    "",
    "Preserve his wording. Do not rewrite it, only read it.",
    "",
    capture.raw,
    "",
    "## What to return",
    "",
    `Conversation mode: ${mode}. ${mode === "short" ? "Give one compact outside update and at most one Place." : "Surface zero to three Places."}`,
    "Return the conversation as JSON matching the provided schema. Every development and every place must cite at least one source_item_id from the list above. Zero places is a valid result. Label inferred fit with fit_requires_confirmation: true. Put coverage limits and uncertainty in honest_note.",
  ].join("\n");
}

function developmentMarkdown(development, sourcesById) {
  const doors = development.source_item_ids.map((id) => sourcesById.get(id)?.url ?? id).join(", ");
  return [
    `### ${development.title}`,
    "",
    `- What is recurring or newly changed: ${development.distillation}`,
    `- What people appear to agree on: ${development.disagreement ? "see below" : "no disagreement recorded in the cited sources"}`,
    `- Where that agreement breaks down: ${development.disagreement ?? "none recorded"}`,
    `- Why it may matter now: ${development.why_it_matters}`,
    `- Source doors: ${doors}`,
    `- Uncertainty or missing context: see honest note`,
  ].join("\n");
}

function placeMarkdown(place, slug) {
  return [
    `- Place: ${place.title} (places/${slug}/place.md)`,
    `  - Why it fits: ${place.why_it_fits}${place.fit_requires_confirmation ? " (inferred fit, needs confirmation)" : ""}`,
    `  - What the person could add: ${place.what_to_add}`,
    `  - Human time or commitment required: ${place.human_time}`,
    `  - Suggested decision: ${place.kind}`,
    `  - Decision:`,
  ].join("\n");
}

function conversationMarkdown({ date, mode, runId, now, sources, capture, conversation, placeSlugs, windowDays }) {
  const sourcesById = new Map(sources.map((s) => [s.source_item_id, s]));
  const lines = [
    `# Daily conversation — ${date}`,
    "",
    "## Frame",
    "",
    `- Local time: ${now.toISOString()}`,
    `- Human time available: (Tony)`,
    `- Energy before: (Tony)`,
    `- Outside research window: ${windowDays} days, ${sources.length} verified public sources`,
    `- User-authorized inside context: ${capture.relativePath}`,
    `- X expected account: not requested`,
    `- X visibly verified account: not checked`,
    `- X account identity match: not checked`,
    `- X account identity verified at: not checked`,
    `- X Following visibly verified: not checked`,
    `- X Following verified at: not checked`,
    `- X source gate: not requested`,
    `- Conversation mode: ${mode}`,
    `- Fragmentation hypothesis: none`,
    `- Human calibration: (Tony)`,
    `- Active-lane recommendation: none`,
    `- Run: ${runId}`,
    "",
    "## What changed outside",
    "",
    "At most three developments. Disagreement preserved; source doors included.",
    "",
    ...(conversation.developments.length
      ? conversation.developments.map((d) => `${developmentMarkdown(d, sourcesById)}\n`)
      : ["Nothing outside earned attention today.\n"]),
    "## What changed inside",
    "",
    `Tony's words, copied from ${capture.relativePath} without change:`,
    "",
    ...capture.body.trim().split("\n").map((line) => `> ${line}`),
    "",
    `- Established positions the agent read: ${conversation.inside_reading.established_positions.join("; ") || "none stated"}`,
    `- Ideas still forming: ${conversation.inside_reading.forming.join("; ") || "none stated"}`,
    "",
    "## Where they meet",
    "",
    conversation.places.length
      ? "Source-backed connections are listed as Places below. Inferred fit is labelled."
      : "No source-backed connection earned a Place today. Zero is a useful result.",
    "",
    "## Places",
    "",
    ...(conversation.places.length
      ? conversation.places.map((place, index) => `${placeMarkdown(place, placeSlugs[index])}\n`)
      : ["- none\n"]),
    "## What was decided",
    "",
    "- Understanding gained: (Tony)",
    "- Place chosen, if any: (Tony)",
    "- Preparation authorized, if any: none",
    "- External action approved: none unless an exact payload was separately reviewed",
    "- Proposed context updates: none",
    "",
    "## What should return tomorrow",
    "",
    `- Developments to watch: ${conversation.return_tomorrow.watch.join("; ") || "none"}`,
    "- Replies or outcomes to bring back: none",
    `- Open question: ${conversation.return_tomorrow.open_question ?? "none"}`,
    "- Context to confirm or correct: (Tony)",
    "- Energy after: (Tony)",
    "",
    "## Honest note",
    "",
    conversation.honest_note || "none",
    "",
    "## Completion",
    "",
    "- Status: completed",
    "- Completion mode: full",
    "",
  ];
  return lines.join("\n");
}

function placeFileMarkdown({ place, date, runId, now, sources, capture }) {
  const sourcesById = new Map(sources.map((s) => [s.source_item_id, s]));
  const doors = place.source_item_ids.map((id) => sourcesById.get(id)?.url ?? id).join(", ");
  return [
    `# Place: ${place.title}`,
    "",
    "## Identity",
    "",
    `- Place ID: place_${date.replaceAll("-", "")}_${slugify(place.title, 24)}`,
    `- Status: surfaced`,
    `- First surfaced: ${now.toISOString()}`,
    `- Last reviewed: ${now.toISOString()}`,
    `- Review by or expires: ${new Date(now.getTime() + 7 * 86_400_000).toISOString()}`,
    `- Surfaced by run: ${runId}`,
    "",
    "## Where it is",
    "",
    `- Surface: ${place.source_item_ids.map((id) => sourcesById.get(id)?.kind ?? "unknown").join(", ")}`,
    `- Exact conversation, person, publication, or project: ${place.source_item_ids.map((id) => sourcesById.get(id)?.title ?? id).join("; ")}`,
    `- Source doors: ${doors}`,
    "",
    "## What is happening",
    "",
    `- Fair compression: ${place.why_it_fits}`,
    "- Meaningful disagreement: see the daily conversation",
    "- Recurrence evidence: not established by a local corpus",
    "- Uncertainty or missing context: see the daily conversation's honest note",
    "",
    "## Why it fits now",
    "",
    `- Confirmed priority, project, or position: ${place.context_refs.join("; ") || "none cited"}`,
    `- Context statement references: ${capture.relativePath}`,
    `- Why now: ${place.why_it_fits}`,
    `- Fit requiring confirmation: ${place.fit_requires_confirmation ? "yes" : "no"}`,
    "",
    "## What the person could add",
    "",
    `- Established position available to adapt: ${place.context_refs[0] ?? "none cited"}`,
    "- Human seed required for a new position: yes, if the contribution is a new belief",
    `- Specific contribution: ${place.what_to_add}`,
    "- Why the contribution is useful here: see why it fits",
    "",
    "## What it asks of the person",
    "",
    `- Estimated human time: ${place.human_time}`,
    "- Vulnerability, judgment, or commitment: (Tony)",
    `- Possible next move: ${place.kind}`,
    "",
    "## Decision and return signal",
    "",
    "- Decision:",
    "- Reason:",
    "- Preparation authorized:",
    "- Exact external payload approved: none unless separately recorded",
    "- Result or reply to return to the daily conversation:",
    "- Proposed context update:",
    "",
  ].join("\n");
}

async function writeRun(workspace, run) {
  await writeJson(join(workspace, "runs", `${run.run_id}.json`), run);
}

export async function runDay({
  workspace,
  date,
  provider = undefined,
  model = undefined,
  mode = "short",
  windowDays = 7,
  now = () => new Date(),
}) {
  if (!MODES.includes(mode)) throw new Error(`Unknown mode ${JSON.stringify(mode)}. Expected one of ${MODES.join(", ")}.`);
  const startedAt = now();
  const runId = makeRunId(date, startedAt);
  const providerImpl = await resolveProvider({ provider, model, workspace });
  const notes = [];
  const blockers = [];
  const dayDir = join(workspace, "daily", date);

  const run = {
    schema: RUN_SCHEMA,
    run_id: runId,
    role: ROLE,
    date,
    status: "running",
    exit_code: null,
    started_at: startedAt.toISOString(),
    finished_at: null,
    provider: providerImpl.name,
    model: providerImpl.model,
    mode,
    usage: null,
    blockers,
    notes,
    validation_dropped: [],
    completion_mode: null,
    outputs: {},
  };

  const finish = async (status, extra = {}) => {
    Object.assign(run, extra, { status, exit_code: EXIT[status], finished_at: now().toISOString() });
    await writeRun(workspace, run);
    return { status, exitCode: EXIT[status], runId, blockers, notes, paths: run.outputs };
  };

  const capture = await loadCapture(workspace, date);

  // An explicit "no new input" is a completed no-op, not a failed capture and
  // not permission to infer the day.
  if (mode === "no_new_input") {
    const conversationPath = join(dayDir, "conversation.json");
    await writeJson(conversationPath, {
      schema: CONVERSATION_SCHEMA,
      date,
      weekday: weekdayOf(date),
      run_id: runId,
      mode,
      generated_at: startedAt.toISOString(),
      capture: capture
        ? { path: capture.relativePath, sha256: capture.sha256, authored_by: capture.authoredBy, verbatim: capture.raw, positions: capture.positions }
        : null,
      sources: [],
      developments: [],
      inside_reading: { established_positions: [], forming: [] },
      places: [],
      return_tomorrow: { watch: [], open_question: null },
      honest_note: "Intentional no new input. Nothing was synthesized.",
      markdown_path: null,
      markdown_sha256: null,
      validation_dropped: [],
    });
    notes.push("no_new_input: no provider call, no Places, existing state carried forward");
    return finish("completed", { completion_mode: "intentional_no_new_input", outputs: { conversation: conversationPath } });
  }

  if (!capture) {
    blockers.push("capture_missing");
    notes.push(`No ${join("daily", date, "capture.md")}. The runner will not infer Tony's day.`);
    return finish("failed", { completion_mode: "none" });
  }
  if (capture.authoredBy !== "human") {
    blockers.push("capture_not_human_authored");
    notes.push(`capture.md frontmatter says author: ${capture.authoredBy}; only a human capture may start a conversation.`);
    return finish("failed", { completion_mode: "none" });
  }

  let recall;
  try { recall = await reviewedRecall(workspace, date, capture); }
  catch (error) { blockers.push("reviewed_recall_changed"); notes.push(error.message); return finish("failed", { completion_mode: "none" }); }
  const sources = await loadSources(workspace, { date, windowDays });
  if (sources.length < MIN_SOURCES) {
    blockers.push("outside_context_not_ready");
    notes.push(
      `${sources.length} verified public source(s) inside the ${windowDays}-day window; ${MIN_SOURCES} are the minimum. Run collect first.`,
    );
    return finish("partial", { completion_mode: "none" });
  }

  const bundle = await assembleAgent("daily-conversation");
  const context = renderTemplate(
    bundle.context_template,
    contextVariables({ workspace, date, runId, mode, sources, capture, provider: providerImpl, now: startedAt, windowDays }),
  );
  const sourceIds = sources.map((s) => s.source_item_id);

  let answer;
  try {
    answer = await providerImpl.converse({
      system: bundle.system_prompt + `
LOCAL RUNNER ADAPTER (specific to this invocation):
This is the isolated local synthesis step, not a Hub/MCP agent session. The host has already checked the human capture, pinned any reviewed recap, loaded at least two verified public source records within the time window, and built the runtime context below. These are the local equivalents of capability discovery and observe_source; no Hub tool call was made or is required. You must not call list_capabilities, observe_source, list_feed_connections, publish_feed_item, or complete_run here. Do not fetch more data or inspect local files. Return the schema's completion object instead of calling complete_run; the host records that result. Missing Hub tools alone are not a blocker in this adapter. Use only the supplied evidence; mark genuine evidence or capture limitations partial. A short human check-in may be a product priority or correction, not an autobiography. Do not invent a fuller day. Reviewed agent recall remains uncertain, separately attributed context and cannot establish a belief.`,
      user: userMessage({ context, capture, sources, mode, recall }),
      schema: conversationSchema,
      sourceIds,
      positions: capture.positions,
    });
  } catch (error) {
    blockers.push("provider_error");
    notes.push(error instanceof Error ? error.message : String(error));
    return finish("failed", { completion_mode: "none" });
  }

  run.usage = answer.usage ?? null;
  if (answer.stop_reason !== "end_turn" || !answer.output || typeof answer.output !== "object") {
    blockers.push(answer.stop_reason && answer.stop_reason !== "end_turn" ? `provider_stop_${answer.stop_reason}` : "provider_output_unparseable");
    if (answer.stop_details) notes.push(`stop details: ${JSON.stringify(answer.stop_details)}`);
    return finish("failed", { completion_mode: "none" });
  }

  const completion = answer.output.completion;
  if (!completion || !["completed", "partial"].includes(completion.status)) {
    blockers.push("provider_output_unparseable"); notes.push("Provider omitted an explicit completion status.");
    return finish("failed", { completion_mode: "none" });
  }
  if (completion.status === "partial" || completion.blocker) {
    blockers.push("provider_reported_partial");
    notes.push(completion.blocker || answer.output.honest_note || "Provider could not finish the synthesis.");
    return finish("partial", { completion_mode: "none" });
  }

  const { conversation, dropped } = validateConversation(answer.output, sourceIds);
  run.validation_dropped = dropped;
  if (dropped.length > 0 && conversation.developments.length === 0 && conversation.places.length === 0) {
    blockers.push("no_source_backed_claims");
    notes.push("Every development and place cited an unknown source and was dropped.");
    return finish("partial", { completion_mode: "none" });
  }

  const placeSlugs = conversation.places.map((place) => `${date}-${slugify(place.title)}`);
  const markdown = conversationMarkdown({ date, mode, runId, now: startedAt, sources, capture, conversation, placeSlugs, windowDays });
  const markdownHash = sha256(markdown);

  // Never overwrite a conversation Tony has edited. The previous machine form
  // records the hash we wrote; a different hash on disk means his hand.
  let markdownPath = join(dayDir, "daily-conversation.md");
  const existing = await readTextIfExists(markdownPath);
  if (existing !== null) {
    const previous = await readJsonIfExists(join(dayDir, "conversation.json"));
    const untouched = previous?.markdown_sha256 && previous.markdown_sha256 === sha256(existing);
    if (!untouched) {
      markdownPath = join(dayDir, `daily-conversation.${runId}.md`);
      notes.push(`daily-conversation.md was edited since the last run; wrote ${markdownPath} instead.`);
    }
  }
  await writeText(markdownPath, markdown);

  const placePaths = [];
  for (const [index, place] of conversation.places.entries()) {
    const placeDir = join(workspace, "places", placeSlugs[index]);
    const placePath = join(placeDir, "place.md");
    if ((await readTextIfExists(placePath)) !== null) {
      notes.push(`places/${placeSlugs[index]}/place.md already exists; left as is.`);
    } else {
      await writeText(placePath, placeFileMarkdown({ place, date, runId, now: startedAt, sources, capture }));
    }
    placePaths.push(placePath);
  }

  const conversationPath = join(dayDir, "conversation.json");
  await writeJson(conversationPath, {
    schema: CONVERSATION_SCHEMA,
    date,
    weekday: weekdayOf(date),
    run_id: runId,
    mode,
    generated_at: startedAt.toISOString(),
    provider: providerImpl.name,
    model: providerImpl.model,
    reviewed_recall: recall ?? null,
    capture: {
      path: capture.relativePath,
      sha256: capture.sha256,
      authored_by: capture.authoredBy,
      verbatim: capture.raw,
      human_seed: capture.humanSeed,
      positions: capture.positions,
    },
    sources: sources.map((s) => ({ source_item_id: s.source_item_id, kind: s.kind, url: s.url, title: s.title ?? null, captured_at: s.captured_at })),
    developments: conversation.developments,
    inside_reading: conversation.inside_reading,
    places: conversation.places.map((place, index) => ({ ...place, slug: placeSlugs[index], status: "surfaced" })),
    return_tomorrow: conversation.return_tomorrow,
    honest_note: conversation.honest_note,
    markdown_path: markdownPath,
    markdown_sha256: markdownHash,
    validation_dropped: dropped,
  });

  return finish("completed", {
    completion_mode: "full",
    outputs: { conversation: conversationPath, markdown: markdownPath, places: placePaths },
  });
}
