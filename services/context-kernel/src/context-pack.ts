import { canonicalJson, compareStrings, sha256 } from "./canonical.js";
import { replayLedger } from "./projector.js";
import { listScratchCues } from "./scratch.js";
import {
  PACK_SCHEMA,
  type Basis,
  type ContextPack,
  type ContextPackInput,
  type ContextPackItem,
  type PackOmission,
  type PackTraceItem,
  type ProjectedRecord,
} from "./types.js";
import type { WorkspacePaths } from "./workspace.js";

const ALL_BASES: Basis[] = ["explicit", "observed", "inferred", "system"];
const MAX_OMISSION_DETAILS = 256;

export async function assembleContextPack(
  paths: WorkspacePaths,
  input: ContextPackInput = {},
): Promise<ContextPack> {
  const maxItems = boundedInteger(input.max_items ?? 20, 0, 200, "max_items");
  const maxChars = boundedInteger(input.max_chars ?? 24_000, 0, 500_000, "max_chars");
  const query = input.query?.trim() ?? "";
  const entityTypes = [...new Set(input.entity_types ?? [])].sort(compareStrings);
  const bases = [...new Set(input.bases ?? ALL_BASES)].sort(compareStrings) as Basis[];
  const replay = await replayLedger(paths, { writeProjections: false });
  const candidates = [...replay.records].sort(compareCandidates);
  const context = {
    explicit: [] as ContextPackItem[],
    observed: [] as ContextPackItem[],
    inferred: [] as ContextPackItem[],
    system: [] as ContextPackItem[],
    scratch: [] as ContextPack["context"]["scratch"],
  };
  const trace: PackTraceItem[] = [];
  const omissions: PackOmission[] = [];
  let selectedItems = 0;
  let selectedChars = 0;

  for (const record of candidates) {
    const base = { entity_type: record.entity_type, entity_id: record.entity_id };
    if (record.status === "deleted") {
      omissions.push({ ...base, reason: "deleted" });
      continue;
    }
    if (entityTypes.length > 0 && !entityTypes.includes(record.entity_type)) {
      omissions.push({ ...base, reason: "entity_type_filter" });
      continue;
    }
    if (!bases.includes(record.basis)) {
      omissions.push({ ...base, reason: "basis_filter" });
      continue;
    }
    if (record.body_state === "erased") {
      omissions.push({ ...base, reason: "missing_private_body" });
      continue;
    }
    if (query && !matchesQuery(record, query)) {
      omissions.push({ ...base, reason: "query_mismatch" });
      continue;
    }
    const item = toPackItem(record);
    const chars = canonicalJson(item).length;
    if (selectedItems >= maxItems) {
      omissions.push({ ...base, reason: "item_limit" });
      continue;
    }
    if (selectedChars + chars > maxChars) {
      omissions.push({ ...base, reason: "character_limit" });
      continue;
    }
    context[record.basis].push(item);
    trace.push({
      ...base,
      revision: record.revision,
      event_id: record.event_id,
      event_hash: record.event_hash,
      basis: record.basis,
      source_refs: record.source_refs,
    });
    selectedItems += 1;
    selectedChars += chars;
  }

  if (input.include_scratch) {
    const scratch = await listScratchCues(paths, { now: input.now });
    for (const cue of scratch) {
      const chars = canonicalJson(cue).length;
      if (selectedItems >= maxItems) {
        omissions.push({ entity_type: "scratch", entity_id: cue.id, reason: "item_limit" });
      } else if (selectedChars + chars > maxChars) {
        omissions.push({ entity_type: "scratch", entity_id: cue.id, reason: "character_limit" });
      } else if (query && !cue.cue.toLocaleLowerCase("en-US").includes(query.toLocaleLowerCase("en-US"))) {
        omissions.push({ entity_type: "scratch", entity_id: cue.id, reason: "query_mismatch" });
      } else if (!bases.includes(cue.basis)) {
        omissions.push({ entity_type: "scratch", entity_id: cue.id, reason: "basis_filter" });
      } else {
        context.scratch.push(cue);
        selectedItems += 1;
        selectedChars += chars;
      }
    }
  }

  const omissionDetails = omissions.slice(0, MAX_OMISSION_DETAILS);
  const omissionCounts = Object.fromEntries([
    "query_mismatch",
    "entity_type_filter",
    "basis_filter",
    "deleted",
    "missing_private_body",
    "item_limit",
    "character_limit",
    "scratch_expired",
  ].map((reason) => [reason, omissions.filter((entry) => entry.reason === reason).length])) as ContextPack["omission_summary"]["by_reason"];
  const withoutHash: Omit<ContextPack, "pack_hash"> = {
    schema: PACK_SCHEMA,
    watermark: replay.watermark,
    constraints: {
      query: query || null,
      entity_types: entityTypes,
      bases,
      max_items: maxItems,
      max_chars: maxChars,
      include_scratch: input.include_scratch ?? false,
    },
    context,
    trace,
    omissions: omissionDetails,
    omission_summary: {
      total: omissions.length,
      shown: omissionDetails.length,
      by_reason: omissionCounts,
    },
    selected_items: selectedItems,
    selected_chars: selectedChars,
  };
  return { ...withoutHash, pack_hash: sha256(canonicalJson(withoutHash)) };
}

function toPackItem(record: ProjectedRecord): ContextPackItem {
  return {
    entity_type: record.entity_type,
    entity_id: record.entity_id,
    revision: record.revision,
    basis: record.basis,
    kind: record.kind,
    payload: record.payload,
    body: record.body,
    occurred_at: record.occurred_at,
  };
}

function matchesQuery(record: ProjectedRecord, query: string): boolean {
  const haystack = `${record.entity_type}\n${record.entity_id}\n${record.body ?? ""}\n${canonicalJson(record.payload)}`
    .toLocaleLowerCase("en-US");
  const tokens = query.normalize("NFKC").toLocaleLowerCase("en-US").split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

function compareCandidates(a: ProjectedRecord, b: ProjectedRecord): number {
  return compareStrings(b.occurred_at, a.occurred_at)
    || compareStrings(a.entity_type, b.entity_type)
    || compareStrings(a.entity_id, b.entity_id);
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
