import { hashCanonicalValue } from "./canonical.js";
import type {
  ActorRef,
  EventProducer,
  IsoTimestamp,
} from "./types.js";
import type {
  ContextPack,
  LedgerAuthority,
  LedgerEntity,
  LedgerEvent,
  LedgerEntityType,
  LedgerOperation,
  LedgerTombstone,
} from "./context-types.js";

function withoutKey<T extends Record<string, unknown>>(
  value: T,
  key: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey !== key) result[entryKey] = entryValue;
  }
  return result;
}

export function ledgerEntityKey(
  entity: Pick<LedgerEntity, "entity_type" | "entity_id">,
): string {
  return `${entity.entity_type}:${entity.entity_id}`;
}

export function makeLedgerEventKind(
  entityType: LedgerEntityType,
  operation: LedgerOperation,
): `${LedgerEntityType}.${LedgerOperation}` {
  return `${entityType}.${operation}`;
}

/** Hashes the full immutable entity snapshot except its self-referential hash. */
export function hashEntityRecord(entity: LedgerEntity | Record<string, unknown>): string {
  return hashCanonicalValue(withoutKey(entity as Record<string, unknown>, "record_hash"));
}

/** Returns a copy whose record_hash binds the exact canonical snapshot. */
export function sealEntity<T extends LedgerEntity>(
  entity: Omit<T, "record_hash"> & { record_hash?: string },
): T {
  const record = withoutKey(entity as unknown as Record<string, unknown>, "record_hash");
  return {
    ...record,
    record_hash: hashCanonicalValue(record),
  } as unknown as T;
}

/** Context Packs are derived but independently hashable for cross-harness parity. */
export function hashContextPack(pack: ContextPack | Record<string, unknown>): string {
  const withoutHash = withoutKey(pack as Record<string, unknown>, "pack_hash");
  return hashCanonicalValue(withoutKey(withoutHash, "pack_id"));
}

export function sealContextPack(
  pack: Omit<ContextPack, "pack_id" | "pack_hash"> & { pack_id?: string; pack_hash?: string },
): ContextPack {
  const withoutHash = withoutKey(pack as unknown as Record<string, unknown>, "pack_hash");
  const record = withoutKey(withoutHash, "pack_id");
  const packHash = hashCanonicalValue(record);
  return {
    ...record,
    pack_id: `pack_${packHash.slice("sha256:".length)}`,
    pack_hash: packHash,
  } as unknown as ContextPack;
}

/** Hashes the complete ledger event except its self-referential event_hash. */
export function hashLedgerEvent(event: LedgerEvent | Record<string, unknown>): string {
  return hashCanonicalValue(withoutKey(event as Record<string, unknown>, "event_hash"));
}

export function sealLedgerEvent<T extends LedgerEvent>(
  event: Omit<T, "event_hash"> & { event_hash?: string },
): T {
  const record = withoutKey(event as unknown as Record<string, unknown>, "event_hash");
  return {
    ...record,
    event_hash: hashCanonicalValue(record),
  } as unknown as T;
}

interface LedgerBuildCommon {
  ledger_id: string;
  event_id: string;
  idempotency_key: string;
  sequence: number;
  owner_id: string;
  occurred_at: IsoTimestamp;
  recorded_at: IsoTimestamp;
  actor: ActorRef;
  producer?: EventProducer;
  authority: LedgerAuthority;
  previous_event_hash?: string;
  run_id?: string;
  correlation_id?: string;
  causation_event_id?: string;
  reason?: string;
}

export interface BuildLedgerMutationEventInput<T extends LedgerEntity>
  extends LedgerBuildCommon {
  operation: "created" | "revised" | "corrected";
  entity: Omit<T, "record_hash"> & { record_hash?: string };
  previous_entity?: LedgerEntity;
  supersedes_event_id?: string;
}

/**
 * Builds and seals an exact rich ledger mutation. Runtime writers still call
 * validateLedgerTransition before append; this helper only removes the risk of
 * mismatched target, revision, kind, or hashes during construction.
 */
export function buildLedgerMutationEvent<T extends LedgerEntity>(
  input: BuildLedgerMutationEventInput<T>,
): LedgerEvent<T> {
  const entity = sealEntity<T>(input.entity);
  const previous = input.previous_entity;
  if (input.operation === "created") {
    if (previous !== undefined || entity.revision !== 1) {
      throw new TypeError("Created ledger entities require revision 1 and no previous_entity");
    }
  } else if (
    previous === undefined ||
    entity.revision !== previous.revision + 1 ||
    entity.entity_id !== previous.entity_id ||
    entity.entity_type !== previous.entity_type
  ) {
    throw new TypeError("Revisions and corrections require the immediately previous entity snapshot");
  }
  if (entity.owner_id !== input.owner_id) {
    throw new TypeError("Entity owner_id must match ledger event owner_id");
  }
  if (
    input.operation === "corrected" &&
    (input.reason === undefined || input.supersedes_event_id === undefined)
  ) {
    throw new TypeError("Corrections require reason and supersedes_event_id");
  }
  const event = {
    schema: "afi.ledger_event.v1" as const,
    ledger_id: input.ledger_id,
    event_id: input.event_id,
    idempotency_key: input.idempotency_key,
    sequence: input.sequence,
    owner_id: input.owner_id,
    occurred_at: input.occurred_at,
    recorded_at: input.recorded_at,
    kind: makeLedgerEventKind(entity.entity_type, input.operation),
    operation: input.operation,
    target: { entity_type: entity.entity_type, entity_id: entity.entity_id },
    revision: entity.revision,
    entity_hash: entity.record_hash,
    entity,
    actor: input.actor,
    authority: input.authority,
    ...(input.previous_event_hash === undefined ? {} : { previous_event_hash: input.previous_event_hash }),
    ...(previous === undefined
      ? {}
      : {
          previous_revision: previous.revision,
          previous_entity_hash: previous.record_hash,
        }),
    ...(input.producer === undefined ? {} : { producer: input.producer }),
    ...(input.run_id === undefined ? {} : { run_id: input.run_id }),
    ...(input.correlation_id === undefined ? {} : { correlation_id: input.correlation_id }),
    ...(input.causation_event_id === undefined ? {} : { causation_event_id: input.causation_event_id }),
    ...(input.supersedes_event_id === undefined ? {} : { supersedes_event_id: input.supersedes_event_id }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
  return sealLedgerEvent(event as Omit<LedgerEvent<T>, "event_hash">) as LedgerEvent<T>;
}

export interface BuildLedgerTombstoneEventInput extends LedgerBuildCommon {
  previous_entity: LedgerEntity;
  tombstone: LedgerTombstone;
}

export function buildLedgerTombstoneEvent(
  input: BuildLedgerTombstoneEventInput,
): LedgerEvent {
  const previous = input.previous_entity;
  if (previous.owner_id !== input.owner_id) {
    throw new TypeError("Entity owner_id must match ledger event owner_id");
  }
  const event = {
    schema: "afi.ledger_event.v1" as const,
    ledger_id: input.ledger_id,
    event_id: input.event_id,
    idempotency_key: input.idempotency_key,
    sequence: input.sequence,
    owner_id: input.owner_id,
    occurred_at: input.occurred_at,
    recorded_at: input.recorded_at,
    kind: makeLedgerEventKind(previous.entity_type, "tombstoned"),
    operation: "tombstoned" as const,
    target: { entity_type: previous.entity_type, entity_id: previous.entity_id },
    revision: previous.revision + 1,
    previous_revision: previous.revision,
    previous_entity_hash: previous.record_hash,
    tombstone: input.tombstone,
    actor: input.actor,
    authority: input.authority,
    ...(input.previous_event_hash === undefined ? {} : { previous_event_hash: input.previous_event_hash }),
    ...(input.producer === undefined ? {} : { producer: input.producer }),
    ...(input.run_id === undefined ? {} : { run_id: input.run_id }),
    ...(input.correlation_id === undefined ? {} : { correlation_id: input.correlation_id }),
    ...(input.causation_event_id === undefined ? {} : { causation_event_id: input.causation_event_id }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
  return sealLedgerEvent(event as Omit<LedgerEvent, "event_hash">);
}
