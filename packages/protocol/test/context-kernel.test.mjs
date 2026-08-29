import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  APPROVAL_DECISION_SCHEMA,
  CONTEXT_PACK_SCHEMA,
  CONTEXT_PACK_RECEIPT_SCHEMA,
  CONTEXT_STATEMENT_SCHEMA,
  CONVERSATION_SCHEMA,
  ContextLedgerInvariantError,
  DECISION_SCHEMA,
  DRAFT_SCHEMA,
  EVIDENCE_ITEM_SCHEMA,
  EXECUTION_RECEIPT_SCHEMA,
  FEEDBACK_SIGNAL_SCHEMA,
  PLACE_SCHEMA,
  SCRATCH_CUE_SCHEMA,
  SELECTION_RUN_SCHEMA,
  THREAD_SCHEMA,
  buildLedgerMutationEvent,
  buildLedgerTombstoneEvent,
  evaluateContextStatementAuthority,
  projectLedgerEvents,
  sealContextPack,
  sealEntity,
  validateApprovalDecisionAuthority,
  validateContextPack,
  validateContextPackReceipt,
  validateContextStatement,
  validateContextStatementAuthority,
  validateConversation,
  validateDecision,
  validateDraft,
  validateEvidenceItem,
  validateExecutionReceiptAuthority,
  validateFeedbackSignal,
  validateLedgerEntity,
  validateLedgerEvent,
  validateLedgerTransition,
  validatePlace,
  validateScratchCue,
  validateSelectionRun,
  validateThread,
} from "../dist/index.js";

const owner = {
  actor_id: "user_tony",
  actor_type: "user",
  display_name: "Tony",
};
const agent = {
  actor_id: "agent_daily",
  actor_type: "agent",
  display_name: "Daily Conversation Agent",
};
const provider = {
  actor_id: "provider_x",
  actor_type: "provider",
};

const privateRetention = {
  classification: "private",
  mode: "durable",
  replication: "local_only",
  body_storage: "inline",
};

function provenance(basis, overrides = {}) {
  return {
    basis,
    evidence_refs: [],
    human_seed_refs: [],
    derived_from_refs: [],
    external_refs: [],
    recorded_at: "2026-08-23T12:00:00.000Z",
    ...overrides,
  };
}

function base(schema, entityType, entityId, revision = 1, overrides = {}) {
  return {
    schema,
    entity_type: entityType,
    entity_id: entityId,
    owner_id: owner.actor_id,
    revision,
    created_at: "2026-08-23T12:00:00.000Z",
    updated_at: `2026-08-23T12:0${revision - 1}:00.000Z`,
    created_by: owner,
    last_modified_by: revision === 1 ? owner : agent,
    provenance: provenance("explicit"),
    retention: privateRetention,
    ...overrides,
  };
}

const eventIds = [
  "evt_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "evt_01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "evt_01ARZ3NDEKTSV4RRFFQ69G5FAX",
  "evt_01ARZ3NDEKTSV4RRFFQ69G5FAY",
  "evt_01ARZ3NDEKTSV4RRFFQ69G5FAZ",
];

const humanEvidence = sealEntity({
  ...base(EVIDENCE_ITEM_SCHEMA, "evidence_item", "evidence_human_001"),
  evidence_kind: "human_capture",
  title: "Daily conversation seed",
  summary: "Tony explicitly described the publishing/discovery boundary.",
  captured_at: "2026-08-23T12:00:00.000Z",
  content: "I want publishing to be separate from discovery.",
  metadata: {},
});

function explicitStatement(overrides = {}) {
  return sealEntity({
    ...base(CONTEXT_STATEMENT_SCHEMA, "context_statement", "context_001", 1, {
      provenance: provenance("explicit", {
        human_seed_refs: [{ entity_type: "evidence_item", entity_id: humanEvidence.entity_id }],
      }),
    }),
    basis: "explicit",
    status: "active",
    subject: "user_tony",
    predicate: "publishing_requires_feed_entry",
    value: false,
    scope: { kind: "global" },
    ...overrides,
  });
}

function confirmationAuthority() {
  return {
    mode: "user_confirmation",
    granted_by: owner,
    confirmation_ref: {
      entity_type: "decision",
      entity_id: "decision_confirmation_001",
      revision: 1,
      record_hash: `sha256:${"c".repeat(64)}`,
    },
  };
}

function buildCreateEvent(entity, sequence, overrides = {}) {
  return buildLedgerMutationEvent({
    ledger_id: "ledger_tony",
    event_id: eventIds[sequence - 1],
    idempotency_key: `test-create-${sequence}`,
    sequence,
    owner_id: owner.actor_id,
    occurred_at: `2026-08-23T13:0${sequence}:00.000Z`,
    recorded_at: `2026-08-23T13:0${sequence}:01.000Z`,
    operation: "created",
    entity,
    actor: owner,
    authority: { mode: "user_originated" },
    ...overrides,
  });
}

test("all Context Kernel canonical entities satisfy their dedicated validators", () => {
  const statement = explicitStatement();
  const conversation = sealEntity({
    ...base(CONVERSATION_SCHEMA, "conversation", "conversation_001"),
    purpose: "Choose whether anything deserves attention today.",
    mode: "short",
    started_at: "2026-08-23T12:00:00.000Z",
    ended_at: "2026-08-23T12:05:00.000Z",
    participants: [owner, agent],
    transcript_retention: "summary_only",
    human_seed_refs: [{ entity_type: "evidence_item", entity_id: humanEvidence.entity_id }],
    outcome: {
      disposition: "understanding_only",
      summary: "No new active lane was added.",
      learned: [],
      uncertainties: [],
      proposed_context_refs: [],
      decision_refs: [],
      thread_refs: [],
      place_refs: [],
      draft_refs: [],
      action_refs: [],
      carry_forward: ["Keep the pilot narrow."],
      no_action_reason: "Nothing was urgent enough to justify another lane.",
    },
  });
  const decision = sealEntity({
    ...base(DECISION_SCHEMA, "decision", "decision_001"),
    decision_kind: "priority",
    statement: "Do not add another active lane today.",
    status: "active",
    decided_by: owner,
    decided_at: "2026-08-23T12:05:00.000Z",
    target_refs: [],
  });
  const thread = sealEntity({
    ...base(THREAD_SCHEMA, "thread", "thread_001", 1, {
      provenance: provenance("observed", {
        evidence_refs: [{ entity_type: "evidence_item", entity_id: humanEvidence.entity_id }],
      }),
    }),
    title: "Publishing without entering the feed",
    summary: "People want to publish without paying the discovery cost.",
    status: "watching",
    claims: [{
      claim_id: "claim_001",
      text: "Publishing and discovery should be separate.",
      evidence_refs: [{ entity_type: "evidence_item", entity_id: humanEvidence.entity_id }],
      first_seen_at: "2026-08-23T12:00:00.000Z",
      last_seen_at: "2026-08-23T12:00:00.000Z",
      occurrence_count: 1,
    }],
    context_refs: [{ entity_type: "context_statement", entity_id: statement.entity_id }],
    participant_refs: [],
    first_seen_at: "2026-08-23T12:00:00.000Z",
    last_seen_at: "2026-08-23T12:00:00.000Z",
  });
  const selection = sealEntity({
    ...base(SELECTION_RUN_SCHEMA, "selection_run", "selection_001", 1, {
      provenance: provenance("derived", {
        derived_from_refs: [{ entity_type: "thread", entity_id: thread.entity_id }],
      }),
    }),
    evaluation_kind: "place_selection",
    question: "Is there a defensible place to participate?",
    method: "Bounded read-only comparison of two candidate threads.",
    candidates: [
      {
        candidate_id: "candidate_001",
        label: "Generic AI trend post",
        disposition: "rejected",
        rationale: "No specific contribution beyond what was already said.",
        evidence_refs: [{ entity_type: "evidence_item", entity_id: humanEvidence.entity_id }],
      },
      {
        candidate_id: "candidate_002",
        label: "Unrelated growth thread",
        disposition: "rejected",
        rationale: "Outside current priorities.",
        evidence_refs: [],
      },
    ],
    evaluated_count: 2,
    rejected_count: 2,
    result: "none_worth_recommending",
    recommended_candidate_ids: [],
    limitations: ["Following feed only."],
    completed_at: "2026-08-23T12:06:00.000Z",
  });
  const place = sealEntity({
    ...base(PLACE_SCHEMA, "place", "place_001", 1, {
      provenance: provenance("derived", {
        derived_from_refs: [{ entity_type: "thread", entity_id: thread.entity_id }],
      }),
    }),
    thread_ref: { entity_type: "thread", entity_id: thread.entity_id },
    selection_run_ref: { entity_type: "selection_run", entity_id: selection.entity_id },
    title: "Reply to a concrete publishing workflow question",
    source_door: { provider: "x", kind: "post", external_id: "x_post_001" },
    opportunity: "A person asked how to post without opening the feed.",
    contribution: "Share the separation-of-publishing principle.",
    people_refs: [{ provider: "x", kind: "profile", external_id: "person_001" }],
    next_move: "Prepare one reply draft.",
    human_cost: "low",
    status: "proposed",
    expires_at: "2026-08-24T12:00:00.000Z",
  });
  const draft = sealEntity({
    ...base(DRAFT_SCHEMA, "draft", "draft_001"),
    draft_kind: "post",
    body: "Publishing should not require stepping into the feed.",
    status: "working",
    source_refs: [],
    human_seed_refs: [{ entity_type: "evidence_item", entity_id: humanEvidence.entity_id }],
    place_ref: { entity_type: "place", entity_id: place.entity_id },
  });
  const feedback = sealEntity({
    ...base(FEEDBACK_SIGNAL_SCHEMA, "feedback_signal", "feedback_001"),
    target_ref: { entity_type: "draft", entity_id: draft.entity_id },
    signal_kind: "useful",
    value: true,
    recorded_by: owner,
    recorded_at: "2026-08-23T12:07:00.000Z",
  });

  const values = [humanEvidence, statement, conversation, decision, thread, selection, place, draft, feedback];
  const validators = [validateEvidenceItem, validateContextStatement, validateConversation, validateDecision, validateThread, validateSelectionRun, validatePlace, validateDraft, validateFeedbackSignal];
  values.forEach((value, index) => {
    assert.equal(validators[index](value).ok, true);
    assert.equal(validateLedgerEntity(value).ok, true);
  });
});

test("context scopes are unambiguous", () => {
  const statement = explicitStatement();
  assert.equal(validateContextStatement(statement).ok, true);
  assert.equal(
    validateContextStatement({
      ...statement,
      scope: { kind: "project" },
    }).ok,
    false,
  );
  assert.equal(
    validateContextStatement({
      ...statement,
      scope: { kind: "global", id: "project_ambiguous" },
    }).ok,
    false,
  );
});

test("ordinary agents cannot silently create explicit or active personal context", () => {
  const explicit = explicitStatement();
  const denied = evaluateContextStatementAuthority(
    explicit,
    agent,
    { mode: "agent_proposal" },
  );
  assert.equal(denied.allowed, false);
  assert.equal(denied.required_authority, "user_confirmation");

  const event = buildCreateEvent(explicit, 1, {
    actor: agent,
    authority: { mode: "agent_proposal" },
  });
  const result = validateLedgerEvent(event);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "entity_authority_denied"));

  const confirmed = buildCreateEvent(explicit, 1, {
    actor: agent,
    authority: confirmationAuthority(),
  });
  assert.equal(validateLedgerEvent(confirmed).ok, true);

  const inferredActive = sealEntity({
    ...base(CONTEXT_STATEMENT_SCHEMA, "context_statement", "context_inferred_active", 1, {
      created_by: agent,
      last_modified_by: agent,
      provenance: provenance("inferred", {
        confidence: 0.6,
        derived_from_refs: [{ entity_type: "evidence_item", entity_id: humanEvidence.entity_id }],
      }),
    }),
    basis: "inferred",
    status: "active",
    subject: owner.actor_id,
    predicate: "had_a_fragmented_day",
    value: true,
    scope: { kind: "person", id: owner.actor_id },
  });
  const inferenceResult = validateContextStatementAuthority(
    inferredActive,
    agent,
    { mode: "agent_proposal" },
  );
  assert.equal(inferenceResult.ok, false);
  assert.ok(inferenceResult.issues.some((entry) => entry.code === "context_authority_denied"));

  const inferredProposal = sealEntity({ ...inferredActive, status: "proposed" });
  assert.equal(
    validateContextStatementAuthority(inferredProposal, agent, { mode: "agent_proposal" }).ok,
    true,
  );
});

test("agents may record confirmed decisions but cannot manufacture them or approve drafts", () => {
  const decision = sealEntity({
    ...base(DECISION_SCHEMA, "decision", "decision_authority_001"),
    decision_kind: "product",
    statement: "Build the local Context Kernel first.",
    status: "active",
    decided_by: owner,
    decided_at: "2026-08-23T12:10:00.000Z",
    target_refs: [],
  });
  const forged = buildCreateEvent(decision, 1, {
    actor: agent,
    authority: { mode: "agent_proposal" },
  });
  const forgedResult = validateLedgerEvent(forged);
  assert.equal(forgedResult.ok, false);
  assert.ok(forgedResult.issues.some((entry) => entry.code === "entity_authority_denied"));

  const confirmed = buildCreateEvent(decision, 1, {
    actor: agent,
    authority: confirmationAuthority(),
  });
  assert.equal(validateLedgerEvent(confirmed).ok, true);

  const approvedDraft = sealEntity({
    ...base(DRAFT_SCHEMA, "draft", "draft_approved_001"),
    draft_kind: "post",
    body: "A human-seeded draft.",
    status: "approved",
    source_refs: [],
    human_seed_refs: [{ entity_type: "evidence_item", entity_id: humanEvidence.entity_id }],
  });
  const draftEvent = buildCreateEvent(approvedDraft, 1, {
    actor: agent,
    authority: { mode: "agent_proposal" },
  });
  const draftResult = validateLedgerEvent(draftEvent);
  assert.equal(draftResult.ok, false);
  assert.ok(draftResult.issues.some((entry) => entry.code === "entity_authority_denied"));
});

test("user-confirmation authority must resolve to an earlier Decision bound to the target", () => {
  const statement = explicitStatement();
  const confirmation = sealEntity({
    ...base(DECISION_SCHEMA, "decision", "decision_confirmation_real_001"),
    decision_kind: "context_confirmation",
    statement: "Confirm that publishing should not require entering a feed.",
    status: "active",
    decided_by: owner,
    decided_at: "2026-08-23T12:30:00.000Z",
    target_refs: [{
      entity_type: "context_statement",
      entity_id: statement.entity_id,
      revision: statement.revision,
    }],
  });
  const confirmationEvent = buildCreateEvent(confirmation, 1);
  const confirmedStatementEvent = buildCreateEvent(statement, 2, {
    previous_event_hash: confirmationEvent.event_hash,
    actor: agent,
    authority: {
      mode: "user_confirmation",
      granted_by: owner,
      confirmation_ref: {
        entity_type: "decision",
        entity_id: confirmation.entity_id,
        revision: confirmation.revision,
        record_hash: confirmation.record_hash,
      },
    },
  });
  const projection = projectLedgerEvents([confirmationEvent, confirmedStatementEvent]);
  assert.equal(projection.entities.get(`context_statement:${statement.entity_id}`).basis, "explicit");

  const fabricated = buildCreateEvent(statement, 2, {
    previous_event_hash: confirmationEvent.event_hash,
    actor: agent,
    authority: confirmationAuthority(),
  });
  assert.equal(validateLedgerEvent(fabricated).ok, true, "structural validation cannot resolve the ledger reference");
  assert.throws(
    () => projectLedgerEvents([confirmationEvent, fabricated]),
    (error) => error instanceof ContextLedgerInvariantError && error.code === "CONFIRMATION_NOT_FOUND",
  );
});

test("approval and execution proof authority reject ordinary agent roleplay", () => {
  const approval = {
    schema: APPROVAL_DECISION_SCHEMA,
    decision_id: "approval_001",
    action_id: "action_001",
    action_revision: 1,
    payload_hash: `sha256:${"1".repeat(64)}`,
    decision: "approved",
    decided_by: owner,
    decided_at: "2026-08-23T12:20:00.000Z",
  };
  const forgedApproval = validateApprovalDecisionAuthority(approval, agent);
  assert.equal(forgedApproval.ok, false);
  assert.ok(forgedApproval.issues.some((entry) => entry.code === "approval_authority_denied"));
  assert.equal(validateApprovalDecisionAuthority(approval, owner).ok, true);

  const receipt = {
    schema: EXECUTION_RECEIPT_SCHEMA,
    receipt_id: "receipt_001",
    action_id: "action_001",
    action_revision: 1,
    payload_hash: approval.payload_hash,
    provider_connection_id: "connection_x_001",
    status: "provider_acknowledged",
    occurred_at: "2026-08-23T12:21:00.000Z",
    evidence: {
      source: "provider_api",
      external_id: "external_receipt_001",
    },
  };
  const producer = { connection_id: "connection_x_001", provider: "x" };
  const forgedReceipt = validateExecutionReceiptAuthority(receipt, agent, producer);
  assert.equal(forgedReceipt.ok, false);
  assert.ok(forgedReceipt.issues.some((entry) => entry.code === "execution_authority_denied"));
  assert.equal(validateExecutionReceiptAuthority(receipt, provider, producer).ok, true);
});

test("source-free human-seeded drafts are valid; ungrounded drafts are rejected", () => {
  const seeded = sealEntity({
    ...base(DRAFT_SCHEMA, "draft", "draft_seeded_001"),
    draft_kind: "article",
    title: "Why I've handed over all my social network keys to my agents",
    body: "This is an expression of a human-originated idea.",
    status: "working",
    source_refs: [],
    human_seed_refs: [{ entity_type: "evidence_item", entity_id: humanEvidence.entity_id }],
  });
  assert.equal(validateDraft(seeded).ok, true);

  const ungrounded = sealEntity({ ...seeded, human_seed_refs: [] });
  const result = validateDraft(ungrounded);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "draft_requires_source_or_human_seed"));
});

test("Context Packs are derived and Scratch Cues are ephemeral, never ledger entities", () => {
  const pack = sealContextPack({
    schema: CONTEXT_PACK_SCHEMA,
    owner_id: owner.actor_id,
    run_id: "run_daily_001",
    purpose: "daily_conversation",
    agent_role: "daily-conversation",
    derived: true,
    ledger_watermark: {
      ledger_id: "ledger_tony",
      sequence: 1,
      event_id: eventIds[0],
      event_hash: `sha256:${"a".repeat(64)}`,
    },
    token_budget: 4000,
    requested_refs: [{ entity_type: "context_statement", entity_id: "context_001", revision: 1 }],
    source_pack: {
      schema: "afi.context_kernel_pack.v1",
      pack_hash: `sha256:${"b".repeat(64)}`,
    },
    sections: [
      {
        key: "explicit_context",
        title: "Explicit context",
        authority: "explicit",
        record_refs: [{
          entity_type: "context_statement",
          entity_id: "context_001",
          revision: 1,
          record_hash: `sha256:${"c".repeat(64)}`,
        }],
      },
      {
        key: "inferences_for_calibration",
        title: "Uncertain inferences",
        authority: "inferred",
        record_refs: [],
      },
    ],
    trace: [{
      ref: {
        entity_type: "context_statement",
        entity_id: "context_001",
        revision: 1,
        record_hash: `sha256:${"c".repeat(64)}`,
      },
      basis: "explicit",
      event_id: eventIds[0],
      event_hash: `sha256:${"a".repeat(64)}`,
    }],
    capabilities: ["context.search", "context.propose_change"],
    omissions: ["Raw browser history was not retained."],
    assembled_at: "2026-08-23T13:30:00.000Z",
    expires_at: "2026-08-23T14:30:00.000Z",
  });
  assert.equal(validateContextPack(pack).ok, true);
  assert.equal(pack.pack_id, `pack_${pack.pack_hash.slice("sha256:".length)}`);
  for (const mutation of [
    { ...pack, run_id: "run_daily_002" },
    { ...pack, purpose: "different exact purpose" },
    { ...pack, requested_refs: [] },
    { ...pack, source_pack: { ...pack.source_pack, pack_hash: `sha256:${"d".repeat(64)}` } },
  ]) {
    const resealed = sealContextPack(mutation);
    assert.notEqual(resealed.pack_hash, pack.pack_hash);
    assert.notEqual(resealed.pack_id, pack.pack_id);
  }
  assert.equal(validateContextPack({ ...pack, pack_id: "pack_forged" }).ok, false);
  const receipt = {
    schema: CONTEXT_PACK_RECEIPT_SCHEMA,
    pack,
    mac: `hmac-sha256:${"e".repeat(64)}`,
  };
  assert.equal(validateContextPackReceipt(receipt).ok, true);
  assert.equal(validateContextPackReceipt({ ...receipt, mac: "hmac-sha256:short" }).ok, false);
  assert.equal(
    validateContextPackReceipt({ ...receipt, pack: { ...pack, purpose: "tampered" } }).ok,
    false,
  );
  assert.equal(validateLedgerEntity({ ...pack, entity_type: "context_pack" }).ok, false);

  const cue = {
    schema: SCRATCH_CUE_SCHEMA,
    cue_id: "cue_001",
    owner_id: owner.actor_id,
    channel: "computer_history",
    summary: "The day may have been fragmented.",
    observed_at: "2026-08-23T13:00:00.000Z",
    expires_at: "2026-08-24T13:00:00.000Z",
    uncertainty: "Browser activity is not evidence of intent or emotion.",
    retention: {
      classification: "ephemeral",
      persistence: "scratch",
      replication: "never",
    },
  };
  assert.equal(validateScratchCue(cue).ok, true);
  assert.equal(validateLedgerEntity({ ...cue, entity_type: "scratch_cue" }).ok, false);
});

test("append-only replay verifies monotonic revisions, correction, tombstone, and hash chain", () => {
  const v1 = humanEvidence;
  const created = buildCreateEvent(v1, 1);
  const v2 = sealEntity({
    ...v1,
    revision: 2,
    updated_at: "2026-08-23T12:01:00.000Z",
    summary: "Tony explicitly separated publishing from feed discovery.",
  });
  const revised = buildLedgerMutationEvent({
    ledger_id: "ledger_tony",
    event_id: eventIds[1],
    idempotency_key: "test-revise-2",
    sequence: 2,
    owner_id: owner.actor_id,
    occurred_at: "2026-08-23T13:02:00.000Z",
    recorded_at: "2026-08-23T13:02:01.000Z",
    operation: "revised",
    entity: v2,
    previous_entity: v1,
    previous_event_hash: created.event_hash,
    actor: agent,
    authority: { mode: "agent_proposal" },
  });
  const v3 = sealEntity({
    ...v2,
    revision: 3,
    updated_at: "2026-08-23T12:02:00.000Z",
    summary: "Corrected wording: publishing should not require entering a discovery feed.",
  });
  const corrected = buildLedgerMutationEvent({
    ledger_id: "ledger_tony",
    event_id: eventIds[2],
    idempotency_key: "test-correct-3",
    sequence: 3,
    owner_id: owner.actor_id,
    occurred_at: "2026-08-23T13:03:00.000Z",
    recorded_at: "2026-08-23T13:03:01.000Z",
    operation: "corrected",
    entity: v3,
    previous_entity: v2,
    previous_event_hash: revised.event_hash,
    supersedes_event_id: revised.event_id,
    reason: "Preserve the user's exact distinction.",
    actor: owner,
    authority: { mode: "user_originated" },
  });
  const tombstoned = buildLedgerTombstoneEvent({
    ledger_id: "ledger_tony",
    event_id: eventIds[3],
    idempotency_key: "test-tombstone-4",
    sequence: 4,
    owner_id: owner.actor_id,
    occurred_at: "2026-08-23T13:04:00.000Z",
    recorded_at: "2026-08-23T13:04:01.000Z",
    previous_event_hash: corrected.event_hash,
    previous_entity: v3,
    tombstone: {
      reason: "User requested deletion.",
      erased_object_ids: [],
    },
    actor: owner,
    authority: { mode: "user_originated" },
  });

  for (const event of [created, revised, corrected, tombstoned]) {
    assert.equal(validateLedgerEvent(event).ok, true);
  }
  const projection = projectLedgerEvents([created, revised, corrected, tombstoned]);
  assert.equal(projection.watermark.sequence, 4);
  assert.equal(projection.entities.size, 0);
  assert.equal(projection.tombstones.size, 1);
  assert.equal("entity" in tombstoned, false);

  const tampered = structuredClone(revised);
  tampered.entity.summary = "Silently changed historical bytes.";
  const tamperedResult = validateLedgerEvent(tampered);
  assert.equal(tamperedResult.ok, false);
  assert.ok(tamperedResult.issues.some((entry) => entry.code === "record_hash_mismatch"));
  assert.throws(
    () => projectLedgerEvents([created, tampered]),
    (error) => error instanceof ContextLedgerInvariantError && error.code === "INVALID_LEDGER_EVENT",
  );
});

test("replay rejects duplicate idempotency and correction against a stale event", () => {
  const created = buildCreateEvent(humanEvidence, 1);
  const v2 = sealEntity({
    ...humanEvidence,
    revision: 2,
    updated_at: "2026-08-23T12:01:00.000Z",
    summary: "Correction candidate.",
  });
  const corrected = buildLedgerMutationEvent({
    ledger_id: "ledger_tony",
    event_id: eventIds[1],
    idempotency_key: created.idempotency_key,
    sequence: 2,
    owner_id: owner.actor_id,
    occurred_at: "2026-08-23T13:02:00.000Z",
    recorded_at: "2026-08-23T13:02:01.000Z",
    operation: "corrected",
    entity: v2,
    previous_entity: humanEvidence,
    previous_event_hash: created.event_hash,
    supersedes_event_id: created.event_id,
    reason: "Correct wording.",
    actor: owner,
    authority: { mode: "user_originated" },
  });
  assert.throws(
    () => projectLedgerEvents([created, corrected]),
    (error) => error instanceof ContextLedgerInvariantError && error.code === "DUPLICATE_IDEMPOTENCY_KEY",
  );

  const staleRevision = structuredClone(corrected);
  staleRevision.previous_revision = 9;
  const transition = validateLedgerTransition(humanEvidence, staleRevision);
  assert.equal(transition.ok, false);
});

test("an agent cannot broaden private local retention without recorded confirmation", () => {
  const created = buildCreateEvent(humanEvidence, 1);
  const broadened = sealEntity({
    ...humanEvidence,
    revision: 2,
    updated_at: "2026-08-23T12:01:00.000Z",
    retention: {
      ...privateRetention,
      classification: "eligible_shared",
      replication: "eligible",
    },
  });
  const event = buildLedgerMutationEvent({
    ledger_id: "ledger_tony",
    event_id: eventIds[1],
    idempotency_key: "retention-broaden-2",
    sequence: 2,
    owner_id: owner.actor_id,
    occurred_at: "2026-08-23T13:02:00.000Z",
    recorded_at: "2026-08-23T13:02:01.000Z",
    operation: "revised",
    entity: broadened,
    previous_entity: humanEvidence,
    previous_event_hash: created.event_hash,
    actor: agent,
    authority: { mode: "agent_proposal" },
  });
  const denied = validateLedgerTransition(humanEvidence, event);
  assert.equal(denied.ok, false);
  assert.ok(denied.issues.some((entry) => entry.code === "retention_authority_denied"));

  const confirmed = buildLedgerMutationEvent({
    ...event,
    entity: broadened,
    previous_entity: humanEvidence,
    actor: agent,
    authority: confirmationAuthority(),
  });
  assert.equal(validateLedgerTransition(humanEvidence, confirmed).ok, true);
});

test("Context Kernel schema artifact exposes event lineage and derived boundaries", async () => {
  const raw = await readFile(
    new URL("../schema/afi-context-kernel-v1.schema.json", import.meta.url),
    "utf8",
  );
  const schema = JSON.parse(raw);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$defs.ledgerEvent.properties.schema.const, "afi.ledger_event.v1");
  for (const field of ["recorded_at", "idempotency_key", "previous_event_hash", "correlation_id", "causation_event_id", "supersedes_event_id", "producer"]) {
    assert.ok(schema.$defs.ledgerEvent.properties[field]);
  }
  assert.equal(schema.$defs.contextPack.properties.derived.const, true);
  assert.equal(schema.$defs.scratchCue.properties.retention.properties.replication.const, "never");
});
