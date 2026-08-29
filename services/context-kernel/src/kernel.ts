import { newId, safeSegment } from "./canonical.js";
import { assembleContextPack } from "./context-pack.js";
import { ContextKernelError } from "./errors.js";
import {
  appendChange,
  appendCorrection,
  appendDeletion,
  appendExpiry,
  readEvents,
  reconcilePrivateBodies,
} from "./ledger.js";
import { readPrivateBody } from "./private-objects.js";
import { signContextPackPayload, verifyContextPackPayload } from "./receipt-auth.js";
import { getProjectedRecord, invalidateProjections, replayLedger } from "./projector.js";
import { checkpointRun, completeRun } from "./runs.js";
import { addScratchCue, listScratchCues, pruneScratchCues } from "./scratch.js";
import {
  ensureSqliteAvailable,
  invalidateSqliteIndex,
  rebuildAndSearchSqlite,
  rebuildSqliteIndex,
} from "./sqlite-index.js";
import type {
  ChangeInput,
  ChangeResult,
  ContextEvent,
  ContextPack,
  ContextPackInput,
  DeleteInput,
  ExpiryPruneResult,
  ProjectedRecord,
  ReplayResult,
  RunCheckpointInput,
  RunCompletionInput,
  ScratchCue,
  ScratchCueInput,
  SearchHit,
  SearchInput,
  WorkspaceInitInput,
  WorkspaceManifest,
} from "./types.js";
import { initializeWorkspace, openWorkspace, type WorkspacePaths } from "./workspace.js";

export class ContextKernel {
  readonly root: string;
  readonly manifest: WorkspaceManifest;
  readonly paths: WorkspacePaths;

  private constructor(manifest: WorkspaceManifest, paths: WorkspacePaths) {
    this.root = paths.root;
    this.manifest = manifest;
    this.paths = paths;
  }

  static async open(root: string): Promise<ContextKernel> {
    const { manifest, paths } = await openWorkspace(root);
    const reconciliation = await reconcilePrivateBodies(paths);
    if (reconciliation.tombstoned_entities.length > 0) {
      // A process may have died after committing a tombstone but before
      // clearing plaintext derived state. Opening never exposes that state.
      await Promise.all([
        invalidateSqliteIndex(paths),
        invalidateProjections(paths),
      ]);
    }
    // Repair a process death after event commit but before a complete derived
    // write. Projection mutation is locked from ledger read through final file.
    await replayLedger(paths, { writeProjections: true });
    return new ContextKernel(manifest, paths);
  }

  static newEntityId(): string {
    return newId("ent");
  }

  static newRunId(): string {
    return newId("run");
  }

  async describe(): Promise<{
    root: string;
    manifest: WorkspaceManifest;
    watermark: ReplayResult["watermark"];
    active_records: number;
    deleted_records: number;
    scratch_cues: number;
  }> {
    const replay = await replayLedger(this.paths, { writeProjections: false });
    const scratch = await listScratchCues(this.paths);
    return {
      root: this.root,
      manifest: this.manifest,
      watermark: replay.watermark,
      active_records: replay.records.filter((record) => record.status === "active").length,
      deleted_records: replay.records.filter((record) => record.status === "deleted").length,
      scratch_cues: scratch.length,
    };
  }

  async change(input: ChangeInput): Promise<ChangeResult> {
    const result = await appendChange(this.paths, input);
    await replayLedger(this.paths, { writeProjections: true });
    return result;
  }

  async correct(input: ChangeInput): Promise<ChangeResult> {
    const result = await appendCorrection(this.paths, input);
    await replayLedger(this.paths, { writeProjections: true });
    return result;
  }

  async delete(input: DeleteInput): Promise<ChangeResult> {
    let result: ChangeResult;
    try {
      result = await appendDeletion(this.paths, input);
    } finally {
      // A stale derived index must never outlive a canonical deletion, even if
      // projection or SQLite rebuilding fails after the tombstone commits.
      await Promise.all([
        invalidateSqliteIndex(this.paths),
        invalidateProjections(this.paths),
      ]);
    }
    await replayLedger(this.paths, { writeProjections: true });
    await rebuildSqliteIndex(this.paths);
    return result;
  }

  async readEventBody(event: ContextEvent): Promise<string | null> {
    return event.private_body ? readPrivateBody(this.paths, event.private_body) : null;
  }

  async pruneExpiredEntities(): Promise<ExpiryPruneResult> {
    const checkedAt = new Date().toISOString();
    const checkedAtMs = Date.parse(checkedAt);
    const replay = await replayLedger(this.paths, { writeProjections: false });
    const expired = replay.records.filter((record) => (
      record.status === "active"
      && typeof record.payload.expires_at === "string"
      && Date.parse(record.payload.expires_at) <= checkedAtMs
    ));
    const pruned: ExpiryPruneResult["pruned"] = [];
    try {
      for (const record of expired) {
        const expiresAt = String(record.payload.expires_at);
        const result = await appendExpiry(this.paths, {
          entity_type: record.entity_type,
          entity_id: record.entity_id,
          expected_revision: record.revision,
          expires_at: expiresAt,
        });
        pruned.push({
          entity_type: record.entity_type,
          entity_id: record.entity_id,
          previous_revision: record.revision,
          event_id: result.event.event_id,
          expires_at: expiresAt,
        });
      }
    } finally {
      if (expired.length > 0) {
        await Promise.all([
          invalidateSqliteIndex(this.paths),
          invalidateProjections(this.paths),
        ]);
      }
    }
    if (expired.length > 0) {
      await replayLedger(this.paths, { writeProjections: true });
      await rebuildSqliteIndex(this.paths);
    }
    return { checked_at: checkedAt, pruned };
  }

  async get(entityType: string, entityId: string): Promise<ProjectedRecord | null> {
    return getProjectedRecord(this.paths, entityType, entityId);
  }

  async changes(options: { after_event_id?: string; limit?: number } = {}): Promise<ContextEvent[]> {
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new TypeError("change limit must be an integer between 1 and 1000");
    }
    const events = await readEvents(this.paths);
    if (!options.after_event_id) return events.slice(0, limit);
    safeSegment(options.after_event_id, "after_event_id");
    const index = events.findIndex((event) => event.event_id === options.after_event_id);
    if (index < 0) {
      throw new ContextKernelError("CURSOR_NOT_FOUND", `Ledger cursor does not exist: ${options.after_event_id}`);
    }
    return events.slice(index + 1, index + 1 + limit);
  }

  async replay(options: { writeProjections?: boolean } = {}): Promise<ReplayResult> {
    return replayLedger(this.paths, options);
  }

  async rebuildIndex(): Promise<{ indexed: number; database: string }> {
    return rebuildSqliteIndex(this.paths);
  }

  async search(input: SearchInput): Promise<SearchHit[]> {
    return rebuildAndSearchSqlite(this.paths, input);
  }

  async sqliteVersion(): Promise<string> {
    return ensureSqliteAvailable();
  }

  async assembleContextPack(input: ContextPackInput = {}): Promise<ContextPack> {
    return assembleContextPack(this.paths, input);
  }

  /** Trusted service primitive; ordinary agents receive only the resulting MAC. */
  async signContextPackReceipt(canonicalPayload: string): Promise<string> {
    return signContextPackPayload(this.paths, canonicalPayload);
  }

  /** Trusted service primitive used to authenticate stateless cross-harness refresh. */
  async verifyContextPackReceipt(canonicalPayload: string, mac: string): Promise<boolean> {
    return verifyContextPackPayload(this.paths, canonicalPayload, mac);
  }

  async addScratch(input: ScratchCueInput): Promise<ScratchCue> {
    return addScratchCue(this.paths, input);
  }

  async listScratch(options: { now?: string } = {}): Promise<ScratchCue[]> {
    return listScratchCues(this.paths, options);
  }

  async pruneScratch(options: { now?: string } = {}): Promise<{ removed: string[]; remaining: number }> {
    return pruneScratchCues(this.paths, options);
  }

  async checkpointRun(input: RunCheckpointInput): Promise<ChangeResult> {
    const result = await checkpointRun(this.paths, input);
    await replayLedger(this.paths, { writeProjections: true });
    return result;
  }

  async completeRun(input: RunCompletionInput): Promise<ChangeResult> {
    const result = await completeRun(this.paths, input);
    await replayLedger(this.paths, { writeProjections: true });
    return result;
  }
}

export async function initializeContextWorkspace(
  root: string,
  input: WorkspaceInitInput,
): Promise<{ kernel: ContextKernel; manifest: WorkspaceManifest; created: boolean }> {
  const initialized = await initializeWorkspace(root, input);
  const kernel = await ContextKernel.open(root);
  return { kernel, manifest: initialized.manifest, created: initialized.created };
}
