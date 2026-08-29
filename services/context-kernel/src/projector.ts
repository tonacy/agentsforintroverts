import { join } from "node:path";
import { rm } from "node:fs/promises";
import { canonicalJson, compareStrings, safeSegment, sha256 } from "./canonical.js";
import { ContextKernelError } from "./errors.js";
import { withFileLock } from "./file-lock.js";
import { syncDirectory, writeDerivedAtomic, writeJsonDerived } from "./io.js";
import { compareEntityEvents, readEvents } from "./ledger.js";
import { readPrivateBody } from "./private-objects.js";
import type {
  ContextEvent,
  LedgerWatermark,
  ProjectedRecord,
  ReplayResult,
} from "./types.js";
import type { WorkspacePaths } from "./workspace.js";

const PROJECTION_LOCK_TIMEOUT_MS = 30_000;
const PROJECTION_LOCK_STALE_MS = 120_000;

export async function replayLedger(
  paths: WorkspacePaths,
  options: { writeProjections?: boolean } = {},
): Promise<ReplayResult> {
  if (options.writeProjections ?? true) {
    return withProjectionMutationLock(paths, () => replayLedgerUnlocked(paths, true));
  }
  return replayLedgerUnlocked(paths, false);
}

async function replayLedgerUnlocked(paths: WorkspacePaths, shouldWriteProjections: boolean): Promise<ReplayResult> {
  const events = await readEvents(paths);
  validateRevisionChains(events);
  const grouped = new Map<string, ContextEvent[]>();
  for (const event of events) {
    const key = entityKey(event.entity.type, event.entity.id);
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }

  const records: ProjectedRecord[] = [];
  for (const group of grouped.values()) {
    group.sort(compareEntityEvents);
    const latest = group.at(-1)!;
    const deleted = latest.tombstone === true;
    let body: string | undefined;
    let bodyState: ProjectedRecord["body_state"] = deleted ? "deleted" : "none";
    if (!deleted && latest.private_body) {
      const decrypted = await readPrivateBody(paths, latest.private_body);
      if (decrypted === null) bodyState = "erased";
      else {
        body = decrypted;
        bodyState = "present";
      }
    }
    records.push({
      entity_type: latest.entity.type,
      entity_id: latest.entity.id,
      revision: latest.entity.revision,
      status: deleted ? "deleted" : "active",
      basis: latest.basis,
      kind: latest.kind,
      payload: latest.payload,
      body,
      body_state: bodyState,
      source_refs: latest.source_refs,
      event_id: latest.event_id,
      event_hash: latest.event_hash,
      occurred_at: latest.occurred_at,
      recorded_at: latest.recorded_at,
    });
  }
  records.sort(compareRecords);
  const result = { watermark: ledgerWatermark(events), records };
  if (shouldWriteProjections) await writeProjections(paths, result);
  return result;
}

export async function getProjectedRecord(
  paths: WorkspacePaths,
  entityType: string,
  entityId: string,
): Promise<ProjectedRecord | null> {
  safeSegment(entityType, "entity_type");
  safeSegment(entityId, "entity_id");
  const replay = await replayLedger(paths, { writeProjections: false });
  return replay.records.find(
    (record) => record.entity_type === entityType && record.entity_id === entityId,
  ) ?? null;
}

export async function invalidateProjections(paths: WorkspacePaths): Promise<void> {
  await withProjectionMutationLock(paths, async () => {
    await rm(paths.projections, { recursive: true, force: true });
    await syncDirectory(paths.root);
  });
}

export async function withProjectionMutationLock<T>(
  paths: WorkspacePaths,
  work: () => Promise<T>,
): Promise<T> {
  return withFileLock(join(paths.locks, "projections.lock"), {
    timeout_ms: PROJECTION_LOCK_TIMEOUT_MS,
    stale_ms: PROJECTION_LOCK_STALE_MS,
    busy_code: "PROJECTION_BUSY",
    busy_message: "Timed out waiting for projection mutation lock",
  }, work);
}

export function ledgerWatermark(events: ContextEvent[]): LedgerWatermark {
  const last = events.at(-1) ?? null;
  return {
    sequence: events.length,
    event_count: events.length,
    last_event_id: last?.event_id ?? null,
    last_event_hash: last?.event_hash ?? null,
    ledger_hash: sha256(canonicalJson(events.map((event) => event.event_hash))),
  };
}

export function compareRecords(a: ProjectedRecord, b: ProjectedRecord): number {
  return compareStrings(a.entity_type, b.entity_type) || compareStrings(a.entity_id, b.entity_id);
}

async function writeProjections(paths: WorkspacePaths, replay: ReplayResult): Promise<void> {
  await writeJsonDerived(join(paths.projections, "context.json"), replay);
  await writeDerivedAtomic(join(paths.projections, "context.md"), renderCollectionMarkdown(replay));
  for (const record of replay.records) {
    const base = join(
      paths.projections,
      "entities",
      safeSegment(record.entity_type, "entity_type"),
      safeSegment(record.entity_id, "entity_id"),
    );
    await writeJsonDerived(`${base}.json`, record);
    await writeDerivedAtomic(`${base}.md`, renderRecordMarkdown(record));
  }
}

function validateRevisionChains(events: ContextEvent[]): void {
  const grouped = new Map<string, ContextEvent[]>();
  for (const event of events) {
    const key = entityKey(event.entity.type, event.entity.id);
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }
  for (const [key, group] of grouped) {
    group.sort(compareEntityEvents);
    let tombstoned = false;
    group.forEach((event, index) => {
      if (tombstoned) {
        throw new ContextKernelError("LEDGER_CORRUPT", `Entity ${key} has an event after its tombstone`, {
          event_id: event.event_id,
        });
      }
      const expected = index + 1;
      if (event.entity.revision !== expected) {
        throw new ContextKernelError("LEDGER_CORRUPT", `Revision chain for ${key} expected ${expected}`, {
          actual_revision: event.entity.revision,
          event_id: event.event_id,
        });
      }
      if (event.supersedes_event_id && index > 0 && event.supersedes_event_id !== group[index - 1].event_id) {
        throw new ContextKernelError("LEDGER_CORRUPT", `Supersession chain for ${key} is discontinuous`, {
          event_id: event.event_id,
        });
      }
      if (event.tombstone) tombstoned = true;
    });
  }
}

function entityKey(type: string, id: string): string {
  return `${type}\u0000${id}`;
}

function renderCollectionMarkdown(replay: ReplayResult): string {
  const lines = [
    "# Context projection",
    "",
    `Ledger events: ${replay.watermark.event_count}`,
    `Ledger hash: \`${replay.watermark.ledger_hash}\``,
    "",
  ];
  for (const record of replay.records) {
    lines.push(
      `## ${record.entity_type} / ${record.entity_id}`,
      "",
      `- Revision: ${record.revision}`,
      `- Status: ${record.status}`,
      `- Basis: ${record.basis}`,
      `- Event: \`${record.event_id}\``,
      "",
    );
    if (record.body !== undefined) lines.push(record.body, "");
    if (Object.keys(record.payload).length > 0) {
      lines.push("```json", JSON.stringify(record.payload, null, 2), "```", "");
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderRecordMarkdown(record: ProjectedRecord): string {
  const frontmatter = [
    "---",
    `entity_type: ${JSON.stringify(record.entity_type)}`,
    `entity_id: ${JSON.stringify(record.entity_id)}`,
    `revision: ${record.revision}`,
    `status: ${record.status}`,
    `basis: ${record.basis}`,
    `event_id: ${JSON.stringify(record.event_id)}`,
    "---",
    "",
    `# ${record.entity_type} / ${record.entity_id}`,
    "",
  ];
  if (record.body !== undefined) frontmatter.push(record.body, "");
  if (record.body_state === "erased") frontmatter.push("_Private body erased._", "");
  if (record.status === "deleted") frontmatter.push("_Deleted._", "");
  if (Object.keys(record.payload).length > 0) {
    frontmatter.push("## Metadata", "", "```json", JSON.stringify(record.payload, null, 2), "```", "");
  }
  return `${frontmatter.join("\n")}\n`;
}
