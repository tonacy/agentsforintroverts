import { ledgerEntityKey } from "./context-canonical.js";
import type {
  LedgerEntity,
  LedgerEvent,
  LedgerProjection,
  LedgerTombstone,
} from "./context-types.js";
import {
  validateLedgerEvent,
  validateLedgerTransition,
  validateUserConfirmationForEvent,
} from "./context-validation.js";
import type { JsonObject, ValidationIssue } from "./types.js";

export class ContextLedgerInvariantError extends Error {
  readonly code: string;
  readonly context: JsonObject;
  readonly issues?: ValidationIssue[];

  constructor(
    code: string,
    message: string,
    context: JsonObject = {},
    issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = "ContextLedgerInvariantError";
    this.code = code;
    this.context = context;
    this.issues = issues;
  }
}

function fail(code: string, message: string, context: JsonObject = {}): never {
  throw new ContextLedgerInvariantError(code, message, context);
}

function validatedEvent(input: unknown, index: number): LedgerEvent {
  const result = validateLedgerEvent(input);
  if (!result.ok) {
    throw new ContextLedgerInvariantError(
      "INVALID_LEDGER_EVENT",
      `Ledger event at index ${index} failed validation`,
      { index },
      result.issues,
    );
  }
  return result.value;
}

/**
 * Deterministically replays the complete local ledger. The supplied order is
 * authoritative append order; unlike provider run events, context events are
 * never sorted or repaired during replay.
 */
export function projectLedgerEvents(
  eventInputs: readonly unknown[],
): LedgerProjection {
  const entities = new Map<string, LedgerEntity>();
  const tombstones = new Map<string, LedgerTombstone>();
  const lastEventIdByEntity = new Map<string, string>();
  const eventIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  const appliedEventIds: string[] = [];

  let ledgerId: string | undefined;
  let ownerId: string | undefined;
  let previousEvent: LedgerEvent | undefined;

  eventInputs.forEach((input, index) => {
    const event = validatedEvent(input, index);
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      fail("SEQUENCE_GAP", `Expected sequence ${expectedSequence}, received ${event.sequence}`, {
        expected_sequence: expectedSequence,
        received_sequence: event.sequence,
        event_id: event.event_id,
      });
    }
    if (ledgerId === undefined) {
      ledgerId = event.ledger_id;
      ownerId = event.owner_id;
    } else if (event.ledger_id !== ledgerId || event.owner_id !== ownerId) {
      fail("LEDGER_BINDING_MISMATCH", "Every event must bind the same ledger and owner", {
        event_id: event.event_id,
        expected_ledger_id: ledgerId,
        actual_ledger_id: event.ledger_id,
      });
    }
    if (eventIds.has(event.event_id)) {
      fail("DUPLICATE_EVENT_ID", `Duplicate event_id ${event.event_id}`, {
        event_id: event.event_id,
      });
    }
    if (idempotencyKeys.has(event.idempotency_key)) {
      fail("DUPLICATE_IDEMPOTENCY_KEY", `Duplicate idempotency_key ${event.idempotency_key}`, {
        idempotency_key: event.idempotency_key,
      });
    }
    if (previousEvent === undefined) {
      if (event.previous_event_hash !== undefined) {
        fail("INITIAL_EVENT_HAS_PREDECESSOR", "First event cannot bind a predecessor", {
          event_id: event.event_id,
        });
      }
    } else if (event.previous_event_hash !== previousEvent.event_hash) {
      fail("EVENT_HASH_CHAIN_BROKEN", "Event does not bind the immediately preceding event hash", {
        event_id: event.event_id,
        expected_previous_event_hash: previousEvent.event_hash,
        actual_previous_event_hash: event.previous_event_hash ?? null,
      });
    }
    if (
      event.causation_event_id !== undefined &&
      !eventIds.has(event.causation_event_id)
    ) {
      fail("UNKNOWN_CAUSATION_EVENT", "causation_event_id must reference an earlier event in this ledger", {
        event_id: event.event_id,
        causation_event_id: event.causation_event_id,
      });
    }

    const key = `${event.target.entity_type}:${event.target.entity_id}`;
    if (event.authority.mode === "user_confirmation") {
      const confirmationRef = event.authority.confirmation_ref;
      const confirmation = confirmationRef
        ? entities.get(`decision:${confirmationRef.entity_id}`)
        : undefined;
      if (confirmation?.entity_type !== "decision") {
        fail("CONFIRMATION_NOT_FOUND", "User-confirmed authority must resolve to an earlier Decision", {
          event_id: event.event_id,
          confirmation_entity_id: confirmationRef?.entity_id ?? null,
        });
      }
      const confirmationResult = validateUserConfirmationForEvent(event, confirmation);
      if (!confirmationResult.ok) {
        throw new ContextLedgerInvariantError(
          "INVALID_USER_CONFIRMATION",
          "User confirmation does not authorize this event",
          { event_id: event.event_id },
          confirmationResult.issues,
        );
      }
    }
    if (tombstones.has(key)) {
      fail("EVENT_AFTER_TOMBSTONE", "A tombstoned entity cannot be recreated or revised", {
        event_id: event.event_id,
        entity_key: key,
      });
    }
    const previousEntity = entities.get(key);
    const transition = validateLedgerTransition(previousEntity, event);
    if (!transition.ok) {
      throw new ContextLedgerInvariantError(
        "INVALID_ENTITY_TRANSITION",
        `Invalid transition for ${key}`,
        { event_id: event.event_id, entity_key: key },
        transition.issues,
      );
    }
    if (event.operation === "corrected") {
      const expectedSupersededEvent = lastEventIdByEntity.get(key);
      if (event.supersedes_event_id !== expectedSupersededEvent) {
        fail("CORRECTION_TARGET_MISMATCH", "Correction must supersede the current entity event", {
          event_id: event.event_id,
          expected_supersedes_event_id: expectedSupersededEvent ?? null,
          actual_supersedes_event_id: event.supersedes_event_id ?? null,
        });
      }
    }

    if (event.operation === "tombstoned") {
      entities.delete(key);
      tombstones.set(key, event.tombstone);
    } else {
      const entityKey = ledgerEntityKey(event.entity);
      if (entityKey !== key) {
        fail("ENTITY_KEY_MISMATCH", "Sealed entity key does not match event target", {
          event_id: event.event_id,
        });
      }
      entities.set(key, event.entity);
    }
    lastEventIdByEntity.set(key, event.event_id);
    eventIds.add(event.event_id);
    idempotencyKeys.add(event.idempotency_key);
    appliedEventIds.push(event.event_id);
    previousEvent = event;
  });

  return {
    ...(ledgerId === undefined ? {} : { ledger_id: ledgerId }),
    ...(previousEvent === undefined
      ? {}
      : {
          watermark: {
            ledger_id: previousEvent.ledger_id,
            sequence: previousEvent.sequence,
            event_id: previousEvent.event_id,
            event_hash: previousEvent.event_hash,
          },
        }),
    entities,
    tombstones,
    applied_event_ids: appliedEventIds,
  };
}
