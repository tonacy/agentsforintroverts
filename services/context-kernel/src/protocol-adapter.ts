import { canonicalJson, sha256 } from "./canonical.js";
import { ContextKernelError } from "./errors.js";
import type { ContextEvent, JsonValue, WorkspaceManifest } from "./types.js";

const protocolUrl = import.meta.url.includes("/dist/")
  ? new URL("../../../../packages/protocol/dist/index.js", import.meta.url)
  : new URL("../../../packages/protocol/dist/index.js", import.meta.url);
const protocol = await import(protocolUrl.href) as {
  validateLedgerEvent(input: unknown): {
    ok: boolean;
    issues?: Array<{ path: string; message: string }>;
  };
  validateLedgerEntity(input: unknown): {
    ok: boolean;
    issues?: Array<{ path: string; message: string }>;
  };
  validateLedgerEntityAuthority(
    entity: unknown,
    actor: unknown,
    authority: unknown,
    producer?: unknown,
  ): {
    ok: boolean;
    issues?: Array<{ path: string; message: string }>;
  };
  projectLedgerEvents(inputs: readonly unknown[]): unknown;
};

export const CLOSED_PROTOCOL_ENTITY_TYPES = [
  "evidence_item",
  "context_statement",
  "conversation",
  "decision",
  "thread",
  "selection_run",
  "place",
  "draft",
  "feedback_signal",
] as const;

type ProtocolEntityType = (typeof CLOSED_PROTOCOL_ENTITY_TYPES)[number];
type ProtocolOperation = "created" | "revised" | "corrected" | "tombstoned";
type ProtocolObject = Record<string, JsonValue>;

export interface ProtocolAdapterInput {
  manifest: WorkspaceManifest;
  events: ContextEvent[];
  /** Supplies a complete protocol entity snapshot. Private text should remain an encrypted object reference. */
  resolve_entity: (event: ContextEvent) => ProtocolObject;
}

export function assertCanonicalProtocolEntityBody(input: {
  entity_type: string;
  entity_id: string | undefined;
  revision: number;
  owner_id: string;
  actor: ContextEvent["actor"];
  basis: ContextEvent["basis"];
  body: string | undefined;
  tombstone: boolean;
}): void {
  if (!(CLOSED_PROTOCOL_ENTITY_TYPES as readonly string[]).includes(input.entity_type) || input.tombstone) return;
  if (!input.entity_id) {
    throw new ContextKernelError(
      "PROTOCOL_ENTITY_ID_REQUIRED",
      "Closed protocol entities require a caller-supplied sortable entity_id",
    );
  }
  if (!input.body) {
    throw new ContextKernelError(
      "PROTOCOL_ENTITY_BODY_REQUIRED",
      `Closed protocol entity ${input.entity_type} requires an encrypted canonical snapshot body`,
    );
  }
  let entity: Record<string, unknown>;
  try {
    entity = JSON.parse(input.body) as Record<string, unknown>;
  } catch {
    throw new ContextKernelError("PROTOCOL_ENTITY_INVALID", "Protocol entity body must be valid JSON");
  }
  if (canonicalJson(entity) !== input.body) {
    throw new ContextKernelError(
      "PROTOCOL_ENTITY_NOT_CANONICAL",
      "Protocol entity body must use canonical JSON encoding",
    );
  }
  const validation = protocol.validateLedgerEntity(entity);
  if (!validation.ok) {
    throw new ContextKernelError(
      "PROTOCOL_ENTITY_INVALID",
      (validation.issues ?? []).map((issue) => `${issue.path}: ${issue.message}`).join("; "),
    );
  }
  const authorityValidation = protocol.validateLedgerEntityAuthority(
    entity,
    input.actor,
    protocolAuthorityFor(input.actor),
  );
  if (!authorityValidation.ok) {
    throw new ContextKernelError(
      "PROTOCOL_ENTITY_AUTHORITY_DENIED",
      (authorityValidation.issues ?? []).map((issue) => `${issue.path}: ${issue.message}`).join("; "),
    );
  }
  const expectedBasis = input.basis === "system" ? "derived" : input.basis;
  const provenance = entity.provenance as Record<string, unknown> | undefined;
  const modifiedBy = entity.last_modified_by as Record<string, unknown> | undefined;
  const createdBy = entity.created_by as Record<string, unknown> | undefined;
  const bindings = [
    ["entity_type", entity.entity_type, input.entity_type],
    ["entity_id", entity.entity_id, input.entity_id],
    ["revision", entity.revision, input.revision],
    ["owner_id", entity.owner_id, input.owner_id],
    ["provenance.basis", provenance?.basis, expectedBasis],
    ["last_modified_by.actor_id", modifiedBy?.actor_id, input.actor.actor_id],
    ["last_modified_by.actor_type", modifiedBy?.actor_type, input.actor.actor_type],
    ...(input.revision === 1 ? [
      ["created_by.actor_id", createdBy?.actor_id, input.actor.actor_id],
      ["created_by.actor_type", createdBy?.actor_type, input.actor.actor_type],
    ] : []),
  ] as Array<[string, unknown, unknown]>;
  const mismatch = bindings.find(([, actual, expected]) => actual !== expected);
  if (mismatch) {
    throw new ContextKernelError(
      "PROTOCOL_ENTITY_BINDING_MISMATCH",
      `${mismatch[0]} does not match the local change`,
      { actual: mismatch[1], expected: mismatch[2] },
    );
  }
  if (entity.entity_type === "context_statement" && entity.basis !== expectedBasis) {
    throw new ContextKernelError(
      "PROTOCOL_ENTITY_BINDING_MISMATCH",
      "context_statement.basis does not match the local change",
      { actual: entity.basis, expected: expectedBasis },
    );
  }
}

/**
 * Canonical seam between the kernel's intentionally generic storage envelope
 * and packages/protocol's rich, closed LedgerEntity union. The returned values
 * use the exact afi.ledger_event.v1 envelope and hash rules.
 */
export function toProtocolLedgerEvents(input: ProtocolAdapterInput): ProtocolObject[] {
  const ordered = [...input.events].sort((a, b) => a.sequence - b.sequence);
  ordered.forEach((event, index) => {
    if (event.sequence !== index + 1) {
      throw new ContextKernelError("PROTOCOL_ADAPTER_SEQUENCE", "Kernel event sequence is not contiguous");
    }
  });
  // Harness-local records are intentionally outside the closed protocol
  // union. They remain in the canonical local ledger but are not projected as
  // a different entity type or an incompatible afi.ledger_event.v1 shape.
  // A deleted entity's encrypted snapshots are intentionally erased. Omit its
  // entire portable history instead of retaining or reconstructing private
  // semantics. The local structural ledger remains the deletion audit source.
  const deletedEntityKeys = new Set(ordered
    .filter((event) => event.tombstone)
    .map((event) => `${event.entity.type}\u0000${event.entity.id}`));
  const protocolEvents = ordered.filter((event) => (
    (CLOSED_PROTOCOL_ENTITY_TYPES as readonly string[]).includes(event.entity.type)
    && !deletedEntityKeys.has(`${event.entity.type}\u0000${event.entity.id}`)
  ));
  const entityHashes = new Map<string, string>();
  let previousEventHash: string | undefined;
  const adaptedEvents = protocolEvents.map((event, index) => {
    const entityType = protocolEntityType(event.entity.type);
    const operation: ProtocolOperation = event.tombstone
      ? "tombstoned"
      : event.entity.revision === 1
        ? "created"
        : event.supersedes_event_id
          ? "corrected"
          : "revised";
    const key = `${entityType}:${event.entity.id}`;
    const previousEntityHash = entityHashes.get(key);
    const base: ProtocolObject = {
      schema: "afi.ledger_event.v1",
      ledger_id: input.manifest.workspace_id,
      event_id: event.event_id,
      idempotency_key: event.idempotency_key,
      sequence: index + 1,
      owner_id: input.manifest.owner_id,
      occurred_at: event.occurred_at,
      recorded_at: event.recorded_at,
      kind: `${entityType}.${operation}`,
      operation,
      target: { entity_type: entityType, entity_id: event.entity.id },
      revision: event.entity.revision,
      actor: actorObject(event),
      authority: protocolAuthority(event),
      ...(typeof event.payload.run_id === "string" ? { run_id: event.payload.run_id } : {}),
      ...(previousEventHash ? { previous_event_hash: previousEventHash } : {}),
      ...(event.entity.revision > 1 ? {
        previous_revision: event.entity.revision - 1,
        previous_entity_hash: requirePreviousEntityHash(previousEntityHash, event),
      } : {}),
      ...(operation === "corrected" ? {
        supersedes_event_id: event.supersedes_event_id!,
        reason: String(event.payload.reason_code ?? "corrected"),
      } : {}),
    };
    let withoutEventHash: ProtocolObject;
    if (operation === "tombstoned") {
      withoutEventHash = {
        ...base,
        tombstone: {
          reason: String(event.payload.reason_code ?? "deleted"),
          erased_object_ids: ordered
            .filter((candidate) => candidate.entity.type === event.entity.type && candidate.entity.id === event.entity.id)
            .flatMap((candidate) => candidate.private_body ? [candidate.private_body.object_id] : []),
        },
      };
      entityHashes.delete(key);
    } else {
      const entity = sealAndBindEntity(input.resolve_entity(event), event, input.manifest.owner_id, entityType);
      const entityHash = String(entity.record_hash);
      withoutEventHash = { ...base, entity_hash: entityHash, entity };
      entityHashes.set(key, entityHash);
    }
    const adapted = { ...withoutEventHash, event_hash: protocolHash(withoutEventHash) };
    const validation = protocol.validateLedgerEvent(adapted);
    if (!validation.ok) {
      throw new ContextKernelError(
        "PROTOCOL_ADAPTER_INVALID_EVENT",
        (validation.issues ?? []).map((issue) => `${issue.path}: ${issue.message}`).join("; "),
        { event_id: event.event_id },
      );
    }
    previousEventHash = String(adapted.event_hash);
    return adapted;
  });
  protocol.projectLedgerEvents(adaptedEvents);
  return adaptedEvents;
}

function sealAndBindEntity(
  candidate: ProtocolObject,
  event: ContextEvent,
  ownerId: string,
  entityType: ProtocolEntityType,
): ProtocolObject {
  const cleanCandidate = JSON.parse(canonicalJson(candidate)) as ProtocolObject;
  const entity: ProtocolObject = {
    ...cleanCandidate,
    entity_type: entityType,
    entity_id: event.entity.id,
    owner_id: ownerId,
    revision: event.entity.revision,
  };
  const withoutHash = { ...entity };
  delete withoutHash.record_hash;
  return { ...withoutHash, record_hash: protocolHash(withoutHash) };
}

function protocolAuthority(event: ContextEvent): ProtocolObject {
  return protocolAuthorityFor(event.actor);
}

function protocolAuthorityFor(actor: ContextEvent["actor"]): ProtocolObject {
  if (actor.actor_type === "user") {
    return {
      mode: "user_originated",
      granted_by: {
        actor_id: actor.actor_id,
        actor_type: actor.actor_type,
        ...(actor.display_name ? { display_name: actor.display_name } : {}),
      },
    };
  }
  if (actor.actor_type === "agent") return { mode: "agent_proposal" };
  if (actor.actor_type === "provider") return { mode: "connector_observation" };
  return { mode: "system_derived" };
}

function actorObject(event: ContextEvent): ProtocolObject {
  return {
    actor_id: event.actor.actor_id,
    actor_type: event.actor.actor_type,
    ...(event.actor.display_name ? { display_name: event.actor.display_name } : {}),
  };
}

function protocolEntityType(value: string): ProtocolEntityType {
  if (!(CLOSED_PROTOCOL_ENTITY_TYPES as readonly string[]).includes(value)) {
    throw new ContextKernelError(
      "PROTOCOL_ADAPTER_UNSUPPORTED_ENTITY",
      `No afi.ledger_event.v1 entity adapter exists for ${value}`,
    );
  }
  return value as ProtocolEntityType;
}

function requirePreviousEntityHash(value: string | undefined, event: ContextEvent): string {
  if (!value) {
    throw new ContextKernelError(
      "PROTOCOL_ADAPTER_MISSING_PREDECESSOR",
      `No prior protocol entity snapshot exists for ${event.entity.type}:${event.entity.id}`,
    );
  }
  return value;
}

function protocolHash(value: unknown): string {
  return `sha256:${sha256(canonicalJson(value))}`;
}
