import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { assertSortableId, compareStrings, newId } from "./canonical.js";
import { ContextKernelError, isErrno } from "./errors.js";
import { readJson, removeIfExists, writeJsonCreateOnly } from "./io.js";
import type { ScratchCue, ScratchCueInput } from "./types.js";
import type { WorkspacePaths } from "./workspace.js";

const MAX_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export async function addScratchCue(paths: WorkspacePaths, input: ScratchCueInput): Promise<ScratchCue> {
  if (!input.cue.trim()) throw new TypeError("scratch cue must be non-empty");
  if (!Number.isSafeInteger(input.ttl_ms) || input.ttl_ms < 1 || input.ttl_ms > MAX_TTL_MS) {
    throw new TypeError("ttl_ms must be an integer from 1 ms through 24 hours");
  }
  if (input.basis && !(["explicit", "observed", "inferred"] as string[]).includes(input.basis)) {
    throw new TypeError("scratch basis must be explicit, observed, or inferred");
  }
  const recordedAtMs = Date.now();
  const recordedAt = new Date(recordedAtMs).toISOString();
  const createdAt = normalizeTimestamp(input.created_at ?? recordedAt, "created_at");
  const createdAtMs = Date.parse(createdAt);
  if (createdAtMs > recordedAtMs + MAX_FUTURE_SKEW_MS) {
    throw new ContextKernelError(
      "SCRATCH_FUTURE_TIMESTAMP",
      "scratch created_at cannot be more than five minutes after receipt",
      { created_at: createdAt, recorded_at: recordedAt },
    );
  }
  const expiresAtMs = Math.min(createdAtMs + input.ttl_ms, recordedAtMs + MAX_TTL_MS);
  if (expiresAtMs <= recordedAtMs) {
    throw new ContextKernelError("SCRATCH_ALREADY_EXPIRED", "scratch cue was already expired when received");
  }
  const cue: ScratchCue = {
    id: input.id ? assertSortableId(input.id, "scratch id") : newId("scratch"),
    cue: input.cue,
    basis: input.basis ?? "observed",
    created_at: createdAt,
    recorded_at: recordedAt,
    expires_at: new Date(expiresAtMs).toISOString(),
    metadata: input.metadata ?? {},
  };
  await writeJsonCreateOnly(scratchPath(paths, cue.id), cue);
  return cue;
}

export async function listScratchCues(
  paths: WorkspacePaths,
  options: { now?: string } = {},
): Promise<ScratchCue[]> {
  const now = effectiveNow(options.now);
  const all = await readAllScratchCues(paths);
  const cues: ScratchCue[] = [];
  for (const cue of all) {
    if (Date.parse(cue.expires_at) <= now) {
      await removeIfExists(scratchPath(paths, cue.id));
    } else if (Date.parse(cue.recorded_at) <= now) {
      cues.push(cue);
    }
  }
  return cues;
}

async function readAllScratchCues(paths: WorkspacePaths): Promise<ScratchCue[]> {
  let names: string[];
  try {
    names = await readdir(paths.scratch);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  }
  const cues: ScratchCue[] = [];
  for (const name of names.filter((item) => item.endsWith(".json")).sort(compareStrings)) {
    const cue = await readJson<ScratchCue>(join(paths.scratch, name));
    cues.push(cue);
  }
  return cues.sort((a, b) => compareStrings(a.created_at, b.created_at) || compareStrings(a.id, b.id));
}

export async function pruneScratchCues(
  paths: WorkspacePaths,
  options: { now?: string } = {},
): Promise<{ removed: string[]; remaining: number }> {
  const now = effectiveNow(options.now);
  const all = await readAllScratchCues(paths);
  const expired = all.filter((cue) => Date.parse(cue.expires_at) <= now);
  const removed: string[] = [];
  for (const cue of expired) {
    if (await removeIfExists(scratchPath(paths, cue.id))) removed.push(cue.id);
  }
  return { removed, remaining: all.length - removed.length };
}

function effectiveNow(requested: string | undefined): number {
  const actual = Date.now();
  if (!requested) return actual;
  return Math.max(actual, Date.parse(normalizeTimestamp(requested, "now")));
}

function scratchPath(paths: WorkspacePaths, id: string): string {
  return join(paths.scratch, `${id}.json`);
}

function normalizeTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new TypeError(`${label} must be an ISO timestamp`);
  return new Date(parsed).toISOString();
}
