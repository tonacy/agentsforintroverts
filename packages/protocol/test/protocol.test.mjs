import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  APPROVAL_DECISION_SCHEMA,
  EVENT_SCHEMA,
  EXECUTION_RECEIPT_SCHEMA,
  RUN_SCHEMA,
  ProtocolInvariantError,
  canonicalJson,
  hashActionPayload,
  projectActionProof,
  projectRunEvents,
  sha256Hex,
  syntheticActionProposals,
  syntheticAgentDefinitions,
  syntheticAgentFixtures,
  syntheticEmbeddedSourceInputs,
  syntheticFeedItems,
  syntheticProviderConnections,
  syntheticRuns,
  syntheticSourceItems,
  validateActionProposal,
  validateAgentDefinition,
  validateApprovalDecision,
  validateApprovalForProposal,
  validateEventEnvelope,
  validateEmbeddedSourceInput,
  validateFeedItem,
  validateFeedItemWithSourceItems,
  validateProviderConnection,
  validateRun,
  validateSourceItem,
} from "../dist/index.js";

function baseRun() {
  return {
    schema: RUN_SCHEMA,
    run_id: "run_test_001",
    user_id: "user_test_001",
    agent_id: "agent_test_001",
    agent_version: 1,
    provider_connection_id: "provider_test_001",
    goal: "Process clearly synthetic protocol test inputs.",
    input_source_item_ids: [],
    status: "queued",
    requested_at: "2026-08-19T10:00:00.000Z",
    last_sequence: 0,
  };
}

function eventFor(run, sequence, kind, data, overrides = {}) {
  return {
    schema: EVENT_SCHEMA,
    event_id: `event_test_${sequence}`,
    idempotency_key: `idem_test_${sequence}`,
    occurred_at: `2026-08-19T10:00:0${sequence}.000Z`,
    producer: {
      connection_id: run.provider_connection_id,
      provider: "synthetic-provider",
      external_agent_id: run.agent_id,
    },
    run: {
      external_id: run.run_id,
      agent_key: run.agent_id,
      trigger: "synthetic-test",
    },
    sequence,
    kind,
    data,
    sources: [],
    ...overrides,
  };
}

function approvalFor(proposal, overrides = {}) {
  return {
    schema: APPROVAL_DECISION_SCHEMA,
    decision_id: "decision_test_001",
    action_id: proposal.action_id,
    action_revision: proposal.revision,
    payload_hash: proposal.payload_hash,
    decision: "approved",
    decided_by: {
      actor_id: proposal.user_id,
      actor_type: "user",
      display_name: "Synthetic Owner",
    },
    decided_at: "2026-08-19T13:04:00.000Z",
    valid_until: "2026-08-20T12:00:00.000Z",
    ...overrides,
  };
}

function receiptFor(proposal, status, minute) {
  return {
    schema: EXECUTION_RECEIPT_SCHEMA,
    receipt_id: `receipt_test_${status}`,
    action_id: proposal.action_id,
    action_revision: proposal.revision,
    payload_hash: proposal.payload_hash,
    provider_connection_id: proposal.provider_connection_id,
    status,
    occurred_at: `2026-08-19T13:${minute}:00.000Z`,
    evidence: {
      source: status === "provider_acknowledged" ? "provider_api" : "provider_webhook",
      external_id: `synthetic_${status}_001`,
    },
  };
}

test("synthetic five-agent fixtures satisfy every v1 entity validator", () => {
  assert.deepEqual(
    syntheticAgentDefinitions.map((agent) => agent.name),
    ["Inbox Agent", "Follow-up Agent", "Scheduling Agent", "Group Chat Agent", "Meetup Agent"],
  );
  assert.equal(syntheticAgentFixtures.length, 5);

  for (const value of syntheticAgentDefinitions) assert.equal(validateAgentDefinition(value).ok, true);
  for (const value of syntheticProviderConnections) assert.equal(validateProviderConnection(value).ok, true);
  for (const value of syntheticRuns) assert.equal(validateRun(value).ok, true);
  for (const value of syntheticSourceItems) assert.equal(validateSourceItem(value).ok, true);
  for (const value of syntheticEmbeddedSourceInputs) {
    assert.equal(validateEmbeddedSourceInput(value).ok, true);
  }
  syntheticEmbeddedSourceInputs.forEach((embedded, index) => {
    assert.equal(embedded.source_item_id, syntheticSourceItems[index].source_item_id);
    assert.equal(embedded.external_id, syntheticSourceItems[index].external_id);
    assert.equal(embedded.kind, syntheticSourceItems[index].source_kind);
  });
  for (const value of syntheticFeedItems) {
    assert.equal(validateFeedItem(value).ok, true);
    assert.match(value.why_it_matters, /.+/);
    assert.ok(["needs_you", "handled", "watching", "digest"].includes(value.lane));
    assert.ok(value.confidence >= 0 && value.confidence <= 1);
  }
  for (const value of syntheticActionProposals) assert.equal(validateActionProposal(value).ok, true);
});

test("canonical payload SHA-256 is stable and matches Node crypto", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  const payload = {
    z: [3, { b: true, a: "synthetic" }],
    a: "first",
  };
  assert.equal(canonicalJson(payload), '{"a":"first","z":[3,{"a":"synthetic","b":true}]}');
  const expected = `sha256:${createHash("sha256").update(canonicalJson(payload)).digest("hex")}`;
  assert.equal(hashActionPayload(payload), expected);
});

test("schema artifact exposes the event envelope and product feed fields", async () => {
  const raw = await readFile(new URL("../schema/afi-protocol-v1.schema.json", import.meta.url), "utf8");
  const schema = JSON.parse(raw);
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$defs.eventEnvelope.properties.schema.const, "afi.event.v1");
  assert.deepEqual(schema.$defs.eventProducer.required, ["connection_id", "provider"]);
  assert.deepEqual(schema.$defs.eventRunRef.required, ["external_id", "agent_key"]);
  assert.equal(
    schema.$defs.eventEnvelope.properties.sources.items.$ref,
    "#/$defs/embeddedSourceInput",
  );
  assert.equal(schema.$defs.eventEnvelope.properties.kind.type, undefined);
  assert.ok(schema.$defs.feedItem.required.includes("lane"));
  assert.ok(schema.$defs.feedItem.required.includes("why_it_matters"));
  assert.equal(schema.$defs.feedItem.properties.confidence.maximum, 1);
});

test("event envelope accepts the established hub ingress identity shape", () => {
  const run = baseRun();
  const event = eventFor(run, 1, "run.started", { status: "running" });
  assert.deepEqual(Object.keys(event.producer).sort(), [
    "connection_id",
    "external_agent_id",
    "provider",
  ]);
  assert.deepEqual(Object.keys(event.run).sort(), ["agent_key", "external_id", "trigger"]);
  assert.equal(validateEventEnvelope(event).ok, true);

  const legacyProducer = structuredClone(event);
  legacyProducer.producer = {
    producer_id: run.agent_id,
    producer_type: "agent",
  };
  const result = validateEventEnvelope(legacyProducer);
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some(
      (entry) =>
        entry.path === "$.producer.connection_id" || entry.path === "$.producer.provider",
    ),
  );
});

test("feed validation rejects missing and unlisted claim-level provenance", () => {
  const unlisted = structuredClone(syntheticFeedItems[0]);
  unlisted.claims[0].source_refs[0] = {
    source_item_id: "source_not_in_feed",
    locator: "https://example.test/unlisted",
  };
  const unlistedResult = validateFeedItem(unlisted);
  assert.equal(unlistedResult.ok, false);
  assert.ok(unlistedResult.issues.some((entry) => entry.code === "claim_source_not_listed"));

  const missing = structuredClone(syntheticFeedItems[0]);
  missing.claims[0].source_refs = [];
  const missingResult = validateFeedItem(missing);
  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.issues.some((entry) => entry.code === "too_few_items"));

  const dangling = structuredClone(syntheticFeedItems[0]);
  const danglingReference = {
    source_item_id: "source_missing_from_store",
    excerpt: "[SYNTHETIC] Missing source excerpt.",
  };
  dangling.sources = [danglingReference];
  dangling.claims[0].source_refs = [danglingReference];
  assert.equal(validateFeedItem(dangling).ok, true);
  const danglingResult = validateFeedItemWithSourceItems(dangling, syntheticSourceItems);
  assert.equal(danglingResult.ok, false);
  assert.ok(danglingResult.issues.some((entry) => entry.code === "source_item_not_found"));
});

test("known feed events require exact embedded-source ID coverage", () => {
  const run = baseRun();
  const feed = structuredClone(syntheticFeedItems[0]);
  feed.run_id = run.run_id;
  feed.agent_id = run.agent_id;
  feed.user_id = run.user_id;
  const valid = eventFor(run, 2, "feed.item.published", { feed_item: feed }, {
    sources: [syntheticEmbeddedSourceInputs[0]],
  });
  assert.equal(validateEventEnvelope(valid).ok, true);

  const invalid = { ...valid, sources: [] };
  const result = validateEventEnvelope(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === "event_source_mismatch"));

  const runMismatch = structuredClone(valid);
  runMismatch.data.feed_item.run_id = "different_external_run";
  const mismatchResult = validateEventEnvelope(runMismatch);
  assert.equal(mismatchResult.ok, false);
  assert.ok(
    mismatchResult.issues.some((entry) => entry.code === "event_run_binding_mismatch"),
  );
});

test("action events bind canonical proposal IDs to ingest producer and run IDs", () => {
  const proposal = syntheticActionProposals[0];
  const run = syntheticRuns[0];
  const valid = eventFor(run, 2, "action.proposed", { proposal }, {
    sources: [syntheticEmbeddedSourceInputs[0]],
  });
  assert.equal(validateEventEnvelope(valid).ok, true);

  const wrongConnection = structuredClone(valid);
  wrongConnection.producer.connection_id = "provider_wrong_connection";
  const result = validateEventEnvelope(wrongConnection);
  assert.equal(result.ok, false);
  assert.ok(
    result.issues.some((entry) => entry.code === "event_producer_binding_mismatch"),
  );
});

test("replay rejects duplicate IDs, idempotency keys, and sequence numbers", () => {
  const run = baseRun();
  const started = eventFor(run, 1, "run.started", { status: "running" });
  const duplicateIdempotency = eventFor(run, 2, "agent.observed", { synthetic: true }, {
    event_id: "event_test_unique",
    idempotency_key: started.idempotency_key,
  });
  assert.throws(
    () => projectRunEvents(run, [started, duplicateIdempotency]),
    (error) => error instanceof ProtocolInvariantError && error.code === "DUPLICATE_IDEMPOTENCY_KEY",
  );

  const duplicateSequence = eventFor(run, 1, "agent.observed", { synthetic: true }, {
    event_id: "event_test_other",
    idempotency_key: "idem_test_other",
  });
  assert.throws(
    () => projectRunEvents(run, [started, duplicateSequence]),
    (error) => error instanceof ProtocolInvariantError && error.code === "DUPLICATE_SEQUENCE",
  );
});

test("out-of-order replay is normalized deterministically and reported", () => {
  const run = baseRun();
  const events = [
    eventFor(run, 1, "run.started", { status: "running" }),
    eventFor(run, 2, "agent.observed", { synthetic: true }),
    eventFor(run, 3, "run.completed", {
      status: "completed",
      summary: "Synthetic replay completed.",
      output_ids: ["feed_synthetic_output_001"],
    }),
  ];
  const ordered = projectRunEvents(run, events);
  const shuffled = projectRunEvents(run, [events[2], events[0], events[1]]);

  assert.equal(shuffled.received_out_of_order, true);
  assert.deepEqual(shuffled.applied_event_ids, events.map((entry) => entry.event_id));
  assert.deepEqual(shuffled.run, ordered.run);
  assert.equal(shuffled.run.status, "completed");
});

test("partial completion is explicit, terminal, and preserves resume data", () => {
  const run = baseRun();
  const started = eventFor(run, 1, "run.started", { status: "running" });
  const partial = eventFor(run, 2, "run.partial", {
    status: "partial",
    summary: "Two synthetic sources processed; one remains.",
    completed_steps: ["source_one", "source_two"],
    remaining_steps: ["source_three"],
    checkpoint: { cursor: "synthetic_cursor_002" },
  });
  const projection = projectRunEvents(run, [partial, started]);
  assert.equal(projection.run.status, "partial");
  assert.deepEqual(projection.run.completion.remaining_steps, ["source_three"]);
  assert.deepEqual(projection.run.completion.checkpoint, { cursor: "synthetic_cursor_002" });

  const disguisedTerminal = eventFor(run, 2, "agent.finished", {
    status: "partial",
    summary: "Not a legal terminal event.",
    completed_steps: [],
    remaining_steps: ["still_open"],
    checkpoint: {},
  });
  const validation = validateEventEnvelope(disguisedTerminal);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((entry) => entry.code === "terminal_kind_required"));
});

test("approval fails closed when stale, revision/hash mismatched, or provider-authored", () => {
  const proposal = syntheticActionProposals[0];

  const stale = approvalFor(proposal, {
    valid_until: "2026-08-19T13:30:00.000Z",
  });
  const staleResult = validateApprovalForProposal(
    proposal,
    stale,
    "2026-08-19T14:00:00.000Z",
  );
  assert.equal(staleResult.ok, false);
  assert.ok(staleResult.issues.some((entry) => entry.code === "stale_approval"));

  const hashMismatch = approvalFor(proposal, {
    payload_hash: `sha256:${"0".repeat(64)}`,
  });
  const hashResult = validateApprovalForProposal(
    proposal,
    hashMismatch,
    "2026-08-19T13:05:00.000Z",
  );
  assert.equal(hashResult.ok, false);
  assert.ok(hashResult.issues.some((entry) => entry.code === "payload_hash_mismatch"));

  const providerApproval = approvalFor(proposal, {
    decided_by: {
      actor_id: proposal.provider_connection_id,
      actor_type: "provider",
    },
  });
  const providerResult = validateApprovalDecision(providerApproval);
  assert.equal(providerResult.ok, false);
  assert.ok(providerResult.issues.some((entry) => entry.code === "approval_actor_must_be_user"));
});

test("provider acknowledgement, delivery, and read remain separate proof", () => {
  const proposal = syntheticActionProposals[0];
  const approval = approvalFor(proposal);
  const now = "2026-08-19T13:04:30.000Z";
  const acknowledged = receiptFor(proposal, "provider_acknowledged", "05");
  const delivered = receiptFor(proposal, "delivered", "06");
  const read = receiptFor(proposal, "read", "07");

  const acceptedOnly = projectActionProof(proposal, approval, [acknowledged], now);
  assert.equal(acceptedOnly.approval.status, "approved");
  assert.ok(acceptedOnly.provider_acknowledged);
  assert.equal(acceptedOnly.delivered, undefined);
  assert.equal(acceptedOnly.read, undefined);
  assert.equal(proposal.status, "proposed");

  const deliveredProjection = projectActionProof(
    proposal,
    approval,
    [delivered, acknowledged],
    now,
  );
  assert.ok(deliveredProjection.provider_acknowledged);
  assert.ok(deliveredProjection.delivered);
  assert.equal(deliveredProjection.read, undefined);

  const readProjection = projectActionProof(
    proposal,
    approval,
    [read, acknowledged, delivered],
    now,
  );
  assert.ok(readProjection.provider_acknowledged);
  assert.ok(readProjection.delivered);
  assert.ok(readProjection.read);

  assert.throws(
    () => projectActionProof(proposal, approval, [delivered], now),
    (error) =>
      error instanceof ProtocolInvariantError &&
      error.code === "MISSING_PROVIDER_ACKNOWLEDGEMENT",
  );
});
