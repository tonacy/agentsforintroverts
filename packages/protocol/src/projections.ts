import {
  type ActionProposal,
  type ApprovalDecision,
  type EventEnvelope,
  type ExecutionReceipt,
  type JsonObject,
  type Run,
  type RunCompletedData,
  type RunFailedData,
  type RunPartialData,
} from "./types.js";
import {
  assertValid,
  validateActionProposal,
  validateApprovalForProposal,
  validateEventEnvelope,
  validateExecutionReceipt,
  validateRun,
} from "./validation.js";

export class ProtocolInvariantError extends Error {
  readonly code: string;
  readonly context: JsonObject;

  constructor(code: string, message: string, context: JsonObject = {}) {
    super(message);
    this.name = "ProtocolInvariantError";
    this.code = code;
    this.context = context;
  }
}

function fail(code: string, message: string, context: JsonObject = {}): never {
  throw new ProtocolInvariantError(code, message, context);
}

export interface NormalizedEventStream {
  events: EventEnvelope[];
  received_out_of_order: boolean;
}

/**
 * Validates an event set, rejects every ambiguous duplicate, then orders by
 * sequence for deterministic replay. Sequence gaps are checked by the run
 * projector because an existing projection may begin after sequence zero.
 */
export function normalizeEventsForReplay(
  inputEvents: readonly EventEnvelope[],
): NormalizedEventStream {
  const events = inputEvents.map((event, index) =>
    assertValid(validateEventEnvelope(event), `Event at index ${index}`),
  );
  const eventIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  const sequences = new Set<number>();

  for (const event of events) {
    if (eventIds.has(event.event_id)) {
      fail("DUPLICATE_EVENT_ID", `Duplicate event_id ${event.event_id}`, {
        event_id: event.event_id,
      });
    }
    if (idempotencyKeys.has(event.idempotency_key)) {
      fail(
        "DUPLICATE_IDEMPOTENCY_KEY",
        `Duplicate idempotency_key ${event.idempotency_key}`,
        { idempotency_key: event.idempotency_key },
      );
    }
    if (sequences.has(event.sequence)) {
      fail("DUPLICATE_SEQUENCE", `Duplicate event sequence ${event.sequence}`, {
        sequence: event.sequence,
      });
    }
    eventIds.add(event.event_id);
    idempotencyKeys.add(event.idempotency_key);
    sequences.add(event.sequence);
  }

  const sorted = [...events].sort(
    (left, right) => left.sequence - right.sequence || left.event_id.localeCompare(right.event_id),
  );
  const receivedOutOfOrder = sorted.some((event, index) => event !== events[index]);
  return { events: sorted, received_out_of_order: receivedOutOfOrder };
}

export interface RunProjectionResult {
  run: Run;
  applied_event_ids: string[];
  received_out_of_order: boolean;
}

function assertEventTargetsRun(event: EventEnvelope, run: Run): void {
  const bindings = [
    ["run.external_id", event.run.external_id, run.run_id],
    ["run.agent_key", event.run.agent_key, run.agent_id],
    ["producer.connection_id", event.producer.connection_id, run.provider_connection_id],
  ] as const;
  for (const [field, actual, expected] of bindings) {
    if (actual !== expected) {
      fail("RUN_REFERENCE_MISMATCH", `Event ${event.event_id} has mismatched ${field}`, {
        event_id: event.event_id,
        field,
        expected,
        actual,
      });
    }
  }
}

function isTerminal(status: Run["status"]): boolean {
  return status === "completed" || status === "partial" || status === "failed";
}

/**
 * Projects one run from its immutable event log. Terminal state is reachable
 * only through run.completed, run.partial, or run.failed.
 */
export function projectRunEvents(
  initialRunInput: Run,
  inputEvents: readonly EventEnvelope[],
): RunProjectionResult {
  const initialRun = assertValid(validateRun(initialRunInput), "Initial run");
  const normalized = normalizeEventsForReplay(inputEvents);
  let run: Run = {
    ...initialRun,
    input_source_item_ids: [...initialRun.input_source_item_ids],
    ...(initialRun.completion === undefined ? {} : { completion: initialRun.completion }),
  };
  const applied: string[] = [];
  let expectedSequence = run.last_sequence + 1;

  for (const event of normalized.events) {
    assertEventTargetsRun(event, run);
    if (event.sequence !== expectedSequence) {
      fail("SEQUENCE_GAP", `Expected sequence ${expectedSequence}, received ${event.sequence}`, {
        expected_sequence: expectedSequence,
        received_sequence: event.sequence,
        event_id: event.event_id,
      });
    }
    if (isTerminal(run.status)) {
      fail("EVENT_AFTER_TERMINAL", `Cannot apply ${event.kind} after ${run.status}`, {
        event_id: event.event_id,
        run_status: run.status,
      });
    }

    if (event.kind === "run.started") {
      if (run.status !== "queued") {
        fail("INVALID_RUN_TRANSITION", `run.started requires queued, received ${run.status}`, {
          event_id: event.event_id,
          run_status: run.status,
        });
      }
      const data = event.data as Record<string, unknown>;
      if (data.status !== "running") {
        fail("INVALID_RUN_STARTED_DATA", "run.started data.status must be running", {
          event_id: event.event_id,
        });
      }
      run = { ...run, status: "running", started_at: event.occurred_at };
    } else {
      if (run.status === "queued") {
        fail("RUN_NOT_STARTED", `Event ${event.kind} arrived before run.started`, {
          event_id: event.event_id,
        });
      }
      if (event.kind === "run.completed") {
        const completion = event.data as unknown as RunCompletedData;
        run = {
          ...run,
          status: "completed",
          ended_at: event.occurred_at,
          completion: {
            status: "completed",
            summary: completion.summary,
            output_ids: [...completion.output_ids],
          },
        };
      } else if (event.kind === "run.partial") {
        const completion = event.data as unknown as RunPartialData;
        run = {
          ...run,
          status: "partial",
          ended_at: event.occurred_at,
          completion: {
            status: "partial",
            summary: completion.summary,
            completed_steps: [...completion.completed_steps],
            remaining_steps: [...completion.remaining_steps],
            checkpoint: { ...completion.checkpoint },
          },
        };
      } else if (event.kind === "run.failed") {
        const completion = event.data as unknown as RunFailedData;
        run = {
          ...run,
          status: "failed",
          ended_at: event.occurred_at,
          completion: {
            status: "failed",
            error: { ...completion.error },
            ...(completion.checkpoint === undefined
              ? {}
              : { checkpoint: { ...completion.checkpoint } }),
          },
        };
      }
    }

    run = { ...run, last_sequence: event.sequence };
    applied.push(event.event_id);
    expectedSequence += 1;
  }

  return {
    run: assertValid(validateRun(run), "Projected run"),
    applied_event_ids: applied,
    received_out_of_order: normalized.received_out_of_order,
  };
}

export interface ReceiptProof {
  receipt_id: string;
  occurred_at: string;
  evidence: ExecutionReceipt["evidence"];
}

export type ApprovalProof =
  | { status: "pending" }
  | {
      status: "approved" | "rejected";
      decision_id: string;
      decided_at: string;
      decided_by: ApprovalDecision["decided_by"];
    };

/** No aggregate delivery status exists: each field is independent proof. */
export interface ActionProofProjection {
  action_id: string;
  revision: number;
  payload_hash: string;
  proposed: {
    proposed_at: string;
    proposed_by: ActionProposal["proposed_by"];
  };
  approval: ApprovalProof;
  provider_acknowledged?: ReceiptProof;
  delivered?: ReceiptProof;
  read?: ReceiptProof;
  failed?: ReceiptProof;
}

function receiptProof(receipt: ExecutionReceipt): ReceiptProof {
  return {
    receipt_id: receipt.receipt_id,
    occurred_at: receipt.occurred_at,
    evidence: receipt.evidence,
  };
}

/**
 * Combines immutable proposal, human decision, and provider receipts without
 * inferring one proof state from another.
 */
export function projectActionProof(
  proposalInput: ActionProposal,
  approvalInput: ApprovalDecision | undefined,
  receiptInputs: readonly ExecutionReceipt[],
  now: string,
): ActionProofProjection {
  const proposal = assertValid(validateActionProposal(proposalInput), "Action proposal");
  const projection: ActionProofProjection = {
    action_id: proposal.action_id,
    revision: proposal.revision,
    payload_hash: proposal.payload_hash,
    proposed: {
      proposed_at: proposal.proposed_at,
      proposed_by: proposal.proposed_by,
    },
    approval: { status: "pending" },
  };

  let approval: ApprovalDecision | undefined;
  if (approvalInput !== undefined) {
    approval = assertValid(
      validateApprovalForProposal(proposal, approvalInput, now),
      "Approval decision",
    );
    projection.approval = {
      status: approval.decision,
      decision_id: approval.decision_id,
      decided_at: approval.decided_at,
      decided_by: approval.decided_by,
    };
  }

  if (receiptInputs.length > 0 && approval?.decision !== "approved") {
    fail("EXECUTION_WITHOUT_APPROVAL", "Execution receipts require a current human approval", {
      action_id: proposal.action_id,
    });
  }

  const receiptIds = new Set<string>();
  const statuses = new Set<string>();
  const receipts = receiptInputs
    .map((receipt, index) =>
      assertValid(validateExecutionReceipt(receipt), `Execution receipt at index ${index}`),
    )
    .sort(
      (left, right) =>
        Date.parse(left.occurred_at) - Date.parse(right.occurred_at) ||
        left.receipt_id.localeCompare(right.receipt_id),
    );

  for (const receipt of receipts) {
    if (receiptIds.has(receipt.receipt_id)) {
      fail("DUPLICATE_RECEIPT_ID", `Duplicate receipt_id ${receipt.receipt_id}`, {
        receipt_id: receipt.receipt_id,
      });
    }
    if (statuses.has(receipt.status)) {
      fail("DUPLICATE_PROOF_STATUS", `Duplicate ${receipt.status} proof`, {
        status: receipt.status,
      });
    }
    receiptIds.add(receipt.receipt_id);
    statuses.add(receipt.status);

    if (
      receipt.action_id !== proposal.action_id ||
      receipt.action_revision !== proposal.revision ||
      receipt.payload_hash !== proposal.payload_hash ||
      receipt.provider_connection_id !== proposal.provider_connection_id
    ) {
      fail("RECEIPT_BINDING_MISMATCH", "Receipt does not bind the approved action revision and payload", {
        receipt_id: receipt.receipt_id,
      });
    }
    if (approval && Date.parse(receipt.occurred_at) < Date.parse(approval.decided_at)) {
      fail("RECEIPT_PREDATES_APPROVAL", "Execution proof cannot predate approval", {
        receipt_id: receipt.receipt_id,
      });
    }
    if (projection.failed !== undefined && receipt.status !== "failed") {
      fail("PROOF_AFTER_FAILURE", "Success proof cannot follow an explicit failure receipt", {
        receipt_id: receipt.receipt_id,
      });
    }

    if (receipt.status === "provider_acknowledged") {
      projection.provider_acknowledged = receiptProof(receipt);
    } else if (receipt.status === "delivered") {
      if (projection.provider_acknowledged === undefined) {
        fail("MISSING_PROVIDER_ACKNOWLEDGEMENT", "Delivery proof requires an explicit provider acknowledgement");
      }
      projection.delivered = receiptProof(receipt);
    } else if (receipt.status === "read") {
      if (projection.delivered === undefined) {
        fail("MISSING_DELIVERY_PROOF", "Read proof requires an explicit delivery receipt");
      }
      projection.read = receiptProof(receipt);
    } else {
      projection.failed = receiptProof(receipt);
    }
  }

  return projection;
}
