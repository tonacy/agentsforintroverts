import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { assertSortableId, canonicalJson, compareStrings, newId, safeSegment, sha256 } from "./canonical.js";
import { ContextKernelError, isErrno } from "./errors.js";
import { withFileLock } from "./file-lock.js";
import { readJson, writeJsonCreateOnly } from "./io.js";
import {
  deletePrivateBody,
  deletePrivateBodyFile,
  listPrivateBodyFiles,
  storePrivateBody,
} from "./private-objects.js";
import { assertCanonicalProtocolEntityBody } from "./protocol-adapter.js";
import {
  KERNEL_EVENT_SCHEMA,
  type ChangeInput,
  type ChangeResult,
  type ContextEvent,
  type DeleteInput,
  type JsonValue,
  type WorkspaceManifest,
} from "./types.js";
import type { WorkspacePaths } from "./workspace.js";

interface IdempotencyMarker {
  idempotency_key: string;
  request_hash: string;
  event_id: string;
  event_path: string;
}

const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 30_000;

const GENERIC_LIFECYCLE_KINDS = new Set([
  "context.created",
  "context.revised",
  "context.corrected",
  "context.deleted",
  "context.expired",
]);

const CLOSED_ENTITY_KINDS: Readonly<Record<string, ReadonlySet<string>>> = {
  evidence_item: new Set(["evidence.observed", "evidence.recorded"]),
  context_statement: new Set([
    "context.statement.created",
    "context.statement.revised",
    "context.statement.proposed",
    "context.statement.user_recorded",
    "context.statement.confirmed",
    "context.statement.corrected",
    "context.statement.deleted",
    "context.statement.expired",
  ]),
  conversation: new Set(["conversation.outcome.proposed", "conversation.recorded"]),
  decision: new Set(["decision.proposed", "decision.recorded", "decision.confirmed"]),
  thread: new Set(["thread.proposed"]),
  selection_run: new Set(["selection.proposed"]),
  place: new Set(["place.proposed"]),
  draft: new Set(["draft.prepared"]),
  feedback_signal: new Set(["feedback.observed", "feedback.recorded"]),
};

interface AppendOptions {
  allow_tombstone?: boolean;
  allow_explicit_system_expiry?: boolean;
}

export async function appendChange(
  paths: WorkspacePaths,
  input: ChangeInput,
  options: AppendOptions = {},
): Promise<ChangeResult> {
  validateChangeInput(input);
  const ownerId = await enforceWorkspaceAuthority(paths, input);
  if (input.tombstone && !options.allow_tombstone) {
    throw new ContextKernelError("AUTHORITY_DENIED", "Tombstones must use the dedicated deletion or expiry API");
  }
  assertCanonicalProtocolEntityBody({
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    revision: input.expected_revision + 1,
    owner_id: ownerId,
    actor: input.actor,
    basis: input.basis,
    body: input.body,
    tombstone: input.tombstone === true,
  });
  return withAppendLock(paths, async () => {
    const requestHash = changeRequestHash(input);
    const markerPath = idempotencyMarkerPath(paths, input.idempotency_key);
    const prior = await readExistingMarker(markerPath);
    if (prior) return resolveIdempotentReplay(paths, prior, requestHash);

    const existingByKey = (await readEvents(paths)).find(
      (event) => event.idempotency_key === input.idempotency_key,
    );
    if (existingByKey) {
      if (existingByKey.request_hash !== requestHash) {
        throw new ContextKernelError("IDEMPOTENCY_CONFLICT", "Event id or idempotency key was reused with different input", {
          event_id: existingByKey.event_id,
        });
      }
      const eventPath = relativeEventPath(existingByKey);
      await writeIdempotencyMarker(
        markerPath,
        input.idempotency_key,
        requestHash,
        existingByKey.event_id,
        eventPath,
      );
      return { event: existingByKey, created: false };
    }
    const eventId = input.event_id
      ? assertSortableId(input.event_id, "event_id")
      : newId("evt");

    const events = await readEvents(paths);
    if (events.some((event) => event.event_id === eventId)) {
      throw new ContextKernelError("EVENT_ID_CONFLICT", `Event id ${eventId} already exists`);
    }
    const entityEvents = events
      .filter((event) => event.entity.type === input.entity_type && event.entity.id === input.entity_id)
      .sort(compareEntityEvents);
    const currentEntityEvent = entityEvents.at(-1);
    if (currentEntityEvent?.tombstone) {
      throw new ContextKernelError(
        "ENTITY_TOMBSTONED",
        "A tombstoned entity cannot be revised, corrected, or recreated",
        { entity_type: input.entity_type, entity_id: input.entity_id },
      );
    }
    if (
      input.entity_type === "run"
      && currentEntityEvent
      && isTerminalRunEvent(currentEntityEvent)
      && input.tombstone !== true
    ) {
      throw new ContextKernelError(
        "RUN_TERMINAL",
        `Completed run cannot accept another event: ${currentEntityEvent.entity.id}`,
        { run_id: currentEntityEvent.entity.id, terminal_event_id: currentEntityEvent.event_id },
      );
    }
    if (
      input.expected_revision === 0 &&
      input.entity_id &&
      events.some((event) => event.entity.id === input.entity_id)
    ) {
      throw new ContextKernelError("ENTITY_ID_CONFLICT", `Entity id ${input.entity_id} already exists`);
    }
    const ownerUserWrite = input.actor.actor_type === "user" && input.actor.actor_id === ownerId;
    const systemExpiry = options.allow_explicit_system_expiry
      && input.actor.actor_type === "system"
      && input.tombstone === true;
    if (currentEntityEvent?.basis === "explicit" && !ownerUserWrite && !systemExpiry) {
      throw new ContextKernelError(
        "AUTHORITY_DENIED",
        "Only the workspace owner can revise, correct, or delete explicit user context",
        { entity_type: input.entity_type, entity_id: input.entity_id },
      );
    }
    const currentRevision = currentEntityEvent?.entity.revision ?? 0;
    if (currentRevision !== input.expected_revision) {
      throw new ContextKernelError("REVISION_CONFLICT", "Expected revision does not match current revision", {
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        expected_revision: input.expected_revision,
        current_revision: currentRevision,
      });
    }
    if (input.supersedes_event_id !== undefined) {
      if (!currentEntityEvent || input.supersedes_event_id !== currentEntityEvent.event_id) {
        throw new ContextKernelError(
          "SUPERSESSION_CONFLICT",
          "supersedes_event_id must identify the entity's current event",
          {
            supplied_event_id: input.supersedes_event_id,
            current_event_id: currentEntityEvent?.event_id ?? null,
          },
        );
      }
    }

    const recordedAt = normalizeTimestamp(input.recorded_at ?? new Date().toISOString(), "recorded_at");
    const occurredAt = normalizeTimestamp(input.occurred_at ?? recordedAt, "occurred_at");
    if (Date.parse(recordedAt) < Date.parse(occurredAt)) {
      throw new ContextKernelError(
        "INVALID_TIMESTAMP_ORDER",
        "recorded_at cannot predate occurred_at",
        { occurred_at: occurredAt, recorded_at: recordedAt },
      );
    }
    let privateBody: ContextEvent["private_body"];
    let eventCommitted = false;
    try {
      if (input.body !== undefined) privateBody = await storePrivateBody(paths, input.body);
      const withoutHash: Omit<ContextEvent, "event_hash"> = {
        schema: KERNEL_EVENT_SCHEMA,
        event_id: eventId,
        idempotency_key: input.idempotency_key,
        request_hash: requestHash,
        sequence: events.length + 1,
        previous_event_hash: events.at(-1)?.event_hash,
        occurred_at: occurredAt,
        recorded_at: recordedAt,
        actor: input.actor,
        kind: input.kind,
        basis: input.basis,
        entity: {
          type: input.entity_type,
          id: input.entity_id ?? newId("ent"),
          revision: currentRevision + 1,
        },
        payload: input.payload ?? {},
        private_body: privateBody,
        source_refs: [...(input.source_refs ?? [])].sort(compareSourceRefs),
        supersedes_event_id: input.supersedes_event_id,
        tombstone: input.tombstone || undefined,
      };
      const event: ContextEvent = {
        ...withoutHash,
        event_hash: sha256(canonicalJson(withoutHash)),
      };
      const eventPath = relativeEventPath(event);
      await writeJsonCreateOnly(join(paths.ledger, eventPath), event);
      eventCommitted = true;
      await writeIdempotencyMarker(markerPath, input.idempotency_key, requestHash, eventId, eventPath);
      return { event, created: true };
    } catch (error) {
      if (privateBody && !eventCommitted) {
        await deletePrivateBody(paths, privateBody.object_id).catch(() => undefined);
      }
      throw error;
    }
  });
}

export async function appendCorrection(paths: WorkspacePaths, input: ChangeInput): Promise<ChangeResult> {
  if (!input.entity_id) throw new TypeError("entity_id is required for correction");
  const current = await currentEvent(paths, input.entity_type, input.entity_id);
  if (!current) {
    throw new ContextKernelError("NOT_FOUND", "Cannot correct a missing context record");
  }
  return appendChange(paths, {
    ...input,
    kind: input.kind || "context.corrected",
    supersedes_event_id: input.supersedes_event_id ?? current.event_id,
  });
}

export async function appendDeletion(paths: WorkspacePaths, input: DeleteInput): Promise<ChangeResult> {
  if (input.reason_code) safeSegment(input.reason_code, "reason_code");
  const current = await currentEvent(paths, input.entity_type, input.entity_id);
  if (!current) throw new ContextKernelError("NOT_FOUND", "Cannot delete a missing context record");
  const result = await appendChange(paths, {
    idempotency_key: input.idempotency_key,
    occurred_at: input.occurred_at,
    actor: input.actor,
    kind: "context.deleted",
    basis: "explicit",
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    expected_revision: input.expected_revision,
    payload: input.reason_code ? { reason_code: input.reason_code } : {},
    supersedes_event_id: current.event_id,
    tombstone: true,
  }, { allow_tombstone: true });
  // Erasure is retried even for an idempotent replay, closing a crash window
  // between committing the tombstone and deleting its referenced ciphertext.
  await eraseEntityBodies(paths, input.entity_type, input.entity_id);
  return result;
}

export async function appendExpiry(
  paths: WorkspacePaths,
  input: {
    entity_type: string;
    entity_id: string;
    expected_revision: number;
    expires_at: string;
  },
): Promise<ChangeResult> {
  const current = await currentEvent(paths, input.entity_type, input.entity_id);
  if (!current) throw new ContextKernelError("NOT_FOUND", "Cannot expire a missing context record");
  const idempotencyKey = `expiry_${sha256(canonicalJson(input)).slice(0, 32)}`;
  const result = await appendChange(paths, {
    idempotency_key: idempotencyKey,
    occurred_at: input.expires_at,
    actor: { actor_id: "context-kernel", actor_type: "system" },
    kind: "context.expired",
    basis: "system",
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    expected_revision: input.expected_revision,
    payload: { reason_code: "retention_expired", expires_at: input.expires_at },
    supersedes_event_id: current.event_id,
    tombstone: true,
  }, { allow_tombstone: true, allow_explicit_system_expiry: true });
  await eraseEntityBodies(paths, input.entity_type, input.entity_id);
  return result;
}

export interface PrivateBodyReconciliationResult {
  tombstoned_entities: Array<{ entity_type: string; entity_id: string }>;
  removed_object_ids: string[];
  removed_temporary_files: string[];
}

/**
 * Repairs crash windows while no append can be between private-object creation
 * and event commit. Tombstoned entity bodies and objects that no event owns are
 * always erasable; active and historical non-tombstoned revisions remain.
 */
export async function reconcilePrivateBodies(paths: WorkspacePaths): Promise<PrivateBodyReconciliationResult> {
  return withAppendLock(paths, async () => {
    const events = await readEvents(paths);
    const latestByEntity = new Map<string, ContextEvent>();
    for (const event of events) latestByEntity.set(entityKey(event.entity.type, event.entity.id), event);
    const tombstonedKeys = new Set([...latestByEntity.entries()]
      .filter(([, event]) => event.tombstone === true)
      .map(([key]) => key));
    const retainedObjectIds = new Set(events
      .filter((event) => !tombstonedKeys.has(entityKey(event.entity.type, event.entity.id)))
      .flatMap((event) => event.private_body ? [event.private_body.object_id] : []));
    const retainedFiles = new Set([...retainedObjectIds].map((objectId) => `${objectId}.enc`));
    const existingFiles = await listPrivateBodyFiles(paths);
    const removedFiles = existingFiles.filter((fileName) => !retainedFiles.has(fileName));
    await Promise.all(removedFiles.map((fileName) => deletePrivateBodyFile(paths, fileName)));
    const removedObjectIds = removedFiles
      .filter((fileName) => fileName.endsWith(".enc"))
      .map((fileName) => fileName.slice(0, -4));
    const removedTemporaryFiles = removedFiles.filter((fileName) => !fileName.endsWith(".enc"));
    const tombstonedEntities = [...latestByEntity.values()]
      .filter((event) => event.tombstone === true)
      .map((event) => ({ entity_type: event.entity.type, entity_id: event.entity.id }))
      .sort((a, b) => compareStrings(a.entity_type, b.entity_type) || compareStrings(a.entity_id, b.entity_id));
    return {
      tombstoned_entities: tombstonedEntities,
      removed_object_ids: removedObjectIds,
      removed_temporary_files: removedTemporaryFiles,
    };
  });
}

export async function readEvents(paths: WorkspacePaths): Promise<ContextEvent[]> {
  const files = await listFilesRecursive(paths.events);
  const events: ContextEvent[] = [];
  const ids = new Set<string>();
  for (const path of files.filter((file) => file.endsWith(".json")).sort(compareStrings)) {
    const event = await readJson<ContextEvent>(path);
    validateStoredEvent(event, path);
    if (ids.has(event.event_id)) {
      throw new ContextKernelError("LEDGER_CORRUPT", `Duplicate event id ${event.event_id}`);
    }
    ids.add(event.event_id);
    events.push(event);
  }
  events.sort(compareLedgerEvents);
  events.forEach((event, index) => {
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      throw new ContextKernelError("LEDGER_CORRUPT", `Expected sequence ${expectedSequence}, found ${event.sequence}`);
    }
    const expectedPrevious = index === 0 ? undefined : events[index - 1].event_hash;
    if (event.previous_event_hash !== expectedPrevious) {
      throw new ContextKernelError("LEDGER_CORRUPT", `Hash chain is broken at sequence ${event.sequence}`);
    }
  });
  return events;
}

export async function currentEvent(
  paths: WorkspacePaths,
  entityType: string,
  entityId: string,
): Promise<ContextEvent | null> {
  const events = (await readEvents(paths))
    .filter((event) => event.entity.type === entityType && event.entity.id === entityId)
    .sort(compareEntityEvents);
  return events.at(-1) ?? null;
}

export function compareLedgerEvents(a: ContextEvent, b: ContextEvent): number {
  return a.sequence - b.sequence || compareStrings(a.event_id, b.event_id);
}

export function compareEntityEvents(a: ContextEvent, b: ContextEvent): number {
  return a.entity.revision - b.entity.revision || compareLedgerEvents(a, b);
}

export function changeRequestHash(input: ChangeInput): string {
  return sha256(canonicalJson({
    actor: input.actor,
    basis: input.basis,
    body: input.body ?? null,
    entity_id: input.entity_id,
    entity_type: input.entity_type,
    event_id: input.event_id ?? null,
    expected_revision: input.expected_revision,
    idempotency_key: input.idempotency_key,
    kind: input.kind,
    occurred_at: input.occurred_at ?? null,
    recorded_at: input.recorded_at ?? null,
    payload: input.payload ?? {},
    source_refs: [...(input.source_refs ?? [])].sort(compareSourceRefs),
    supersedes_event_id: input.supersedes_event_id ?? null,
    tombstone: input.tombstone ?? false,
  }));
}

function validateChangeInput(input: ChangeInput): void {
  safeSegment(input.idempotency_key, "idempotency_key");
  if (input.event_id) assertSortableId(input.event_id, "event_id");
  safeSegment(input.actor.actor_id, "actor.actor_id");
  if (!( ["user", "agent", "provider", "system", "service"] as string[]).includes(input.actor.actor_type)) {
    throw new TypeError("actor.actor_type is unsupported");
  }
  if (input.actor.actor_type === "agent") {
    if (input.basis !== "observed" && input.basis !== "inferred") {
      throw new ContextKernelError(
        "AUTHORITY_DENIED",
        "Agents may record only observed or inferred context; explicit context requires the user",
      );
    }
    const forbidden = /(?:^|[._-])(confirmed|approved|executed)(?:$|[._-])/i;
    if (forbidden.test(input.kind) || containsForbiddenAuthorityValue(input.payload ?? {})) {
      throw new ContextKernelError(
        "AUTHORITY_DENIED",
        "Agents may propose an outcome but cannot record confirmed, approved, or executed state",
      );
    }
  }
  safeSegment(input.kind, "kind");
  safeSegment(input.entity_type, "entity_type");
  assertKindEntityBinding(input.kind, input.entity_type);
  if (input.entity_id) assertSortableId(input.entity_id, "entity_id");
  if (input.supersedes_event_id) assertSortableId(input.supersedes_event_id, "supersedes_event_id");
  if (input.expected_revision > 0 && !input.entity_id) {
    throw new TypeError("entity_id is required when expected_revision is greater than zero");
  }
  if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0) {
    throw new TypeError("expected_revision must be a non-negative integer");
  }
  if (!(["explicit", "observed", "inferred", "system"] as string[]).includes(input.basis)) {
    throw new TypeError("basis must be explicit, observed, inferred, or system");
  }
  if (input.occurred_at) normalizeTimestamp(input.occurred_at, "occurred_at");
  if (input.recorded_at) normalizeTimestamp(input.recorded_at, "recorded_at");
  if (input.payload?.expires_at !== undefined) {
    if (typeof input.payload.expires_at !== "string") throw new TypeError("payload.expires_at must be an ISO timestamp");
    normalizeTimestamp(input.payload.expires_at, "payload.expires_at");
  }
  assertStructuralPayload(input.payload ?? {});
  if (canonicalJson(input.payload ?? {}).length > 65_536) {
    throw new TypeError("payload metadata must be 65,536 characters or fewer");
  }
  if ((input.source_refs ?? []).length > 20) throw new TypeError("source_refs is limited to 20 entries");
  for (const source of input.source_refs ?? []) {
    if (!source.source.trim()) throw new TypeError("source_refs.source must be non-empty");
    if (source.source.length > 128) throw new TypeError("source_refs.source is too long");
    if (looksLikeLocator(source.source)) {
      throw new ContextKernelError("PRIVATE_TEXT_REQUIRED", "source_refs.source must be a provider key, not a URL");
    }
    if (source.external_id && (source.external_id.length > 512 || looksLikeLocator(source.external_id))) {
      throw new ContextKernelError("PRIVATE_TEXT_REQUIRED", "source_refs.external_id must be a bounded opaque identifier");
    }
    if (source.url) {
      throw new ContextKernelError(
        "PRIVATE_TEXT_REQUIRED",
        "Raw source URLs are deletable private text; store them in the encrypted body and retain only a hash",
      );
    }
    if (source.observed_at) normalizeTimestamp(source.observed_at, "source_refs.observed_at");
  }
}

function assertKindEntityBinding(kind: string, entityType: string): void {
  const entityKinds = CLOSED_ENTITY_KINDS[entityType];
  if (!entityKinds) return;
  const canonicalLifecycleKind = ["created", "revised", "corrected", "tombstoned"]
    .some((operation) => kind === `${entityType}.${operation}`);
  if (GENERIC_LIFECYCLE_KINDS.has(kind) || entityKinds.has(kind) || canonicalLifecycleKind) return;
  throw new ContextKernelError(
    "KIND_ENTITY_MISMATCH",
    `Event kind ${kind} cannot target closed entity type ${entityType}`,
    { kind, entity_type: entityType },
  );
}

function isTerminalRunEvent(event: ContextEvent): boolean {
  return event.kind === "run.completed" || event.payload.phase === "complete";
}

async function enforceWorkspaceAuthority(paths: WorkspacePaths, input: ChangeInput): Promise<string> {
  const manifest = await readJson<WorkspaceManifest>(paths.manifest);
  if (input.actor.actor_type === "user" && input.actor.actor_id !== manifest.owner_id) {
    throw new ContextKernelError(
      "OWNER_AUTHORITY_MISMATCH",
      "User actor does not own this context workspace",
      { owner_id: manifest.owner_id, actor_id: input.actor.actor_id },
    );
  }
  if (input.basis === "explicit" && input.actor.actor_type !== "user") {
    throw new ContextKernelError(
      "AUTHORITY_DENIED",
      "Explicit context can only be written by the workspace owner",
    );
  }
  return manifest.owner_id;
}

async function eraseEntityBodies(paths: WorkspacePaths, entityType: string, entityId: string): Promise<void> {
  const refs = (await readEvents(paths))
    .filter((event) => event.entity.type === entityType && event.entity.id === entityId)
    .flatMap((event) => (event.private_body ? [event.private_body.object_id] : []));
  await Promise.all(refs.map((objectId) => deletePrivateBody(paths, objectId)));
}

function entityKey(entityType: string, entityId: string): string {
  return `${entityType}\u0000${entityId}`;
}

function assertStructuralPayload(payload: Record<string, JsonValue>): void {
  const privateKeys = /(?:^|_)(body|content|draft|message|note|summary|text|transcript|excerpt|snippet|quote|caption|description|title|label|goal|objective|question|rationale|opportunity|contribution|next_move|locator|url|uri|href)$/i;
  const visit = (value: JsonValue, path: string): void => {
    if (typeof value === "string") {
      if (value.length > 512) {
        throw new ContextKernelError("PRIVATE_TEXT_REQUIRED", `${path} is long free-form text; pass it as body instead`);
      }
      if (looksLikeLocator(value)) {
        throw new ContextKernelError("PRIVATE_TEXT_REQUIRED", `${path} contains a raw locator; pass it as encrypted body instead`);
      }
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}[${index}]`));
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        const hashOnly = key.toLowerCase().endsWith("_hash")
          && typeof item === "string"
          && /^(?:sha256:)?[a-f0-9]{64}$/.test(item);
        if (!hashOnly && privateKeys.test(key) && typeof item === "string" && item.length > 0) {
          throw new ContextKernelError("PRIVATE_TEXT_REQUIRED", `${path}.${key} must be passed as encrypted body`);
        }
        visit(item, `${path}.${key}`);
      }
    }
  };
  visit(payload, "payload");
}

function looksLikeLocator(value: string): boolean {
  return /(?:https?|file|ftp):\/\/|\bwww\./i.test(value);
}

function validateStoredEvent(event: ContextEvent, path: string): void {
  if (event.schema !== KERNEL_EVENT_SCHEMA) {
    throw new ContextKernelError("LEDGER_CORRUPT", `Unsupported event schema in ${path}`);
  }
  const { event_hash: actual, ...withoutHash } = event;
  const expected = sha256(canonicalJson(withoutHash));
  if (actual !== expected) {
    throw new ContextKernelError("LEDGER_CORRUPT", `Event hash mismatch in ${path}`, { expected, actual });
  }
  if (!Number.isSafeInteger(event.entity.revision) || event.entity.revision < 1) {
    throw new ContextKernelError("LEDGER_CORRUPT", `Invalid revision in ${path}`);
  }
  assertSortableId(event.event_id, "event.event_id");
  assertSortableId(event.entity.id, "event.entity.id");
}

function containsForbiddenAuthorityValue(value: JsonValue): boolean {
  if (typeof value === "string") return ["confirmed", "approved", "executed"].includes(value.toLowerCase());
  if (Array.isArray(value)) return value.some(containsForbiddenAuthorityValue);
  if (value && typeof value === "object") return Object.values(value).some(containsForbiddenAuthorityValue);
  return false;
}

function normalizeTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new TypeError(`${label} must be an ISO timestamp`);
  return new Date(parsed).toISOString();
}

function compareSourceRefs(a: { source: string; external_id?: string }, b: { source: string; external_id?: string }): number {
  return compareStrings(a.source, b.source) || compareStrings(a.external_id ?? "", b.external_id ?? "");
}

function relativeEventPath(event: ContextEvent): string {
  const day = event.recorded_at.slice(0, 10).replaceAll("-", "/");
  return join("events", day, `${event.event_id}.${safeSegment(event.kind, "kind")}.json`);
}

function idempotencyMarkerPath(paths: WorkspacePaths, key: string): string {
  return join(paths.idempotency, `${sha256(key)}.json`);
}

async function readExistingMarker(path: string): Promise<IdempotencyMarker | null> {
  try {
    return await readJson<IdempotencyMarker>(path);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
}

async function resolveIdempotentReplay(
  paths: WorkspacePaths,
  marker: IdempotencyMarker,
  requestHash: string,
): Promise<ChangeResult> {
  if (marker.request_hash !== requestHash) {
    throw new ContextKernelError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused with different input", {
      event_id: marker.event_id,
    });
  }
  const event = await readJson<ContextEvent>(join(paths.ledger, marker.event_path));
  validateStoredEvent(event, marker.event_path);
  return { event, created: false };
}

async function writeIdempotencyMarker(
  path: string,
  key: string,
  requestHash: string,
  eventId: string,
  eventPath: string,
): Promise<void> {
  await writeJsonCreateOnly(path, {
    idempotency_key: key,
    request_hash: requestHash,
    event_id: eventId,
    event_path: eventPath,
  }).catch(async (error: unknown) => {
    if (!(error instanceof ContextKernelError) || error.code !== "ALREADY_EXISTS") throw error;
    const existing = await readJson<IdempotencyMarker>(path);
    if (existing.request_hash !== requestHash || existing.event_id !== eventId) {
      throw new ContextKernelError("IDEMPOTENCY_CONFLICT", "Idempotency marker conflicts with event");
    }
  });
}

async function listFilesRecursive(directory: string): Promise<string[]> {
  const output: string[] = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await listFilesRecursive(path)));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

async function withAppendLock<T>(paths: WorkspacePaths, work: () => Promise<T>): Promise<T> {
  const lockPath = join(paths.locks, "append.lock");
  return withFileLock(lockPath, {
    timeout_ms: LOCK_TIMEOUT_MS,
    stale_ms: LOCK_STALE_MS,
    busy_code: "LEDGER_BUSY",
    busy_message: "Timed out waiting for ledger append lock",
  }, work);
}
