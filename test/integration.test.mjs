import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createHubApp } from "../services/hub/.test-dist/src/app.js";
import { hashActionPayload } from "../services/hub/.test-dist/src/canonical.js";
import { MemoryEventStore } from "../services/hub/.test-dist/src/memory-store.js";
import {
  canonicalSha256,
  HubClient,
  signatureInput,
} from "../services/mcp/dist/hub-client.js";
import { LocalContextGateway } from "../services/mcp/dist/local-context-gateway.js";
import {
  ContextKernel,
  canonicalJson,
  initializeContextWorkspace,
  sha256,
} from "../services/context-kernel/dist/src/index.js";
import { sealEntity } from "../packages/protocol/dist/index.js";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const HUB_URL = "https://quiet-hub.integration.test";
const CONNECTION_ID = "connection-codex-integration";
const HUB_SECRET = "integration-secret-used-only-in-tests";
const READ_TOKEN = "integration-read-token";
const RUN_ID = "run-inbox-integration-1";
const AGENT_KEY = "afi.inbox";
const USER_ID = "user-integration-1";

const source = {
  source_item_id: "source-email-integration-1",
  external_id: "mail-thread-integration-1",
  kind: "email",
  url: "https://mail.example.test/thread/integration-1",
  captured_at: "2026-08-19T11:55:00.000Z",
  content_hash: `sha256:${"a".repeat(64)}`,
  title: "Dinner planning thread",
  author: "friend@example.test",
  excerpt: "Thursday or Friday evening both work for dinner.",
  metadata: { mailbox: "personal", labels: ["inbox"] },
};

function responsePayload(response) {
  return response.json();
}

function providerAuthorityRequest(kind, data, nonce, payloadHash) {
  const event = {
    schema: "afi.event.v1",
    event_id: `event-${kind}-${nonce}`,
    idempotency_key: `${CONNECTION_ID}/${RUN_ID}/${kind}`,
    occurred_at: NOW.toISOString(),
    producer: {
      connection_id: CONNECTION_ID,
      provider: "codex",
      external_agent_id: AGENT_KEY,
    },
    run: {
      external_id: RUN_ID,
      agent_key: AGENT_KEY,
      trigger: "manual",
    },
    sequence: kind === "action.approval_decided" ? 4 : 5,
    kind,
    data: data(payloadHash),
    sources: [],
  };
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(NOW.getTime() / 1_000));
  const signature = createHmac("sha256", HUB_SECRET)
    .update(signatureInput(timestamp, nonce, body))
    .digest("hex");
  return new Request(`${HUB_URL}/v1/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-afi-key-id": CONNECTION_ID,
      "x-afi-timestamp": timestamp,
      "x-afi-nonce": nonce,
      "x-afi-signature": signature,
    },
    body,
  });
}

test("HubClient and Quiet Hub preserve provenance, idempotency, proof boundaries, and completion", async () => {
  const store = new MemoryEventStore();
  const app = createHubApp({
    store,
    readToken: READ_TOKEN,
    resolveSecret: async (keyId) => keyId === CONNECTION_ID ? HUB_SECRET : null,
    now: () => NOW.getTime(),
  });

  const capturedWrites = [];
  const fetchThroughHub = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST") capturedWrites.push(request.clone());
    return app.fetch(request);
  };

  // A retry deliberately reuses the first event ID while rotating the nonce.
  // This proves hub idempotency without tripping the replay guard.
  const ids = [
    "event-source-integration-1",
    "nonce-source-integration-001",
    "event-feed-integration-1",
    "nonce-feed-integration-0001",
    "event-feed-integration-1",
    "nonce-feed-integration-0002",
    "event-action-integration-1",
    "nonce-action-integration-001",
    "event-complete-integration-1",
    "nonce-complete-integration-01",
  ];
  const nextId = () => {
    const value = ids.shift();
    assert.ok(value, "the integration test exhausted its deterministic IDs");
    return value;
  };

  const client = new HubClient({
    hubUrl: HUB_URL,
    connectionId: CONNECTION_ID,
    userId: USER_ID,
    provider: "codex",
    hubSecret: HUB_SECRET,
    hubReadToken: READ_TOKEN,
    mcpBearerToken: undefined,
    host: "127.0.0.1",
    port: 8788,
    allowedHosts: [],
  }, fetchThroughHub, () => NOW, nextId);

  assert.deepEqual(await client.health(), {
    status: "ok",
    schema: "afi.event.v1",
    storage: "memory",
  });

  const sourceReceipt = await client.observeSource({
    run_id: RUN_ID,
    agent_key: AGENT_KEY,
    sequence: 1,
    trigger: "source_event",
    ...source,
  });
  assert.equal(sourceReceipt.accepted, true);
  assert.equal(sourceReceipt.duplicate, false);
  assert.equal(sourceReceipt.event_id, "event-source-integration-1");

  const observedEvent = (await store.listEvents())
    .find((event) => event.kind === "source.observed");
  assert.ok(observedEvent, "source capture should be retained before interpretation");
  assert.deepEqual(observedEvent.data, { source_item_id: source.source_item_id });
  assert.deepEqual(observedEvent.sources, [source]);
  assert.equal("summary" in observedEvent.data, false);
  assert.equal("claims" in observedEvent.data, false);

  const observedSourceProjection = await client.listSources({ kind: "email", limit: 10 });
  assert.equal(observedSourceProjection.count, 1);
  assert.deepEqual(observedSourceProjection.items[0].feed_ids, []);
  assert.equal(observedSourceProjection.items[0].author, source.author);
  assert.equal(observedSourceProjection.items[0].excerpt, source.excerpt);
  assert.deepEqual(observedSourceProjection.items[0].metadata, source.metadata);

  const feedInput = {
    run_id: RUN_ID,
    agent_key: AGENT_KEY,
    sequence: 2,
    feed_item_id: "feed-integration-1",
    headline: "A dinner invitation needs a reply",
    summary: "A friend offered Thursday or Friday for dinner.",
    why_it_matters: "Replying now keeps both evenings available.",
    lane: "needs_you",
    confidence: 0.94,
    claims: [{
      claim_id: "claim-dates-integration-1",
      kind: "fact",
      text: "The invitation offers Thursday or Friday evening.",
      source_refs: [source.source_item_id],
      confidence: 0.94,
    }],
    sources: [source],
  };

  const firstPublication = await client.publishFeedItem(feedInput);
  assert.equal(firstPublication.accepted, true);
  assert.equal(firstPublication.duplicate, false);
  assert.equal(firstPublication.event_id, "event-feed-integration-1");

  const firstSignedWrite = capturedWrites[0];
  assert.ok(firstSignedWrite, "HubClient should issue a signed write request");
  const firstBody = await firstSignedWrite.text();
  const firstTimestamp = firstSignedWrite.headers.get("x-afi-timestamp");
  const firstNonce = firstSignedWrite.headers.get("x-afi-nonce");
  assert.ok(firstTimestamp);
  assert.ok(firstNonce);
  assert.equal(firstSignedWrite.headers.get("x-afi-key-id"), CONNECTION_ID);
  assert.equal(
    firstSignedWrite.headers.get("x-afi-signature"),
    createHmac("sha256", HUB_SECRET)
      .update(signatureInput(firstTimestamp, firstNonce, firstBody))
      .digest("hex"),
  );

  const duplicatePublication = await client.publishFeedItem(feedInput);
  assert.equal(duplicatePublication.accepted, true);
  assert.equal(duplicatePublication.duplicate, true);
  assert.equal(duplicatePublication.event_id, firstPublication.event_id);
  assert.equal((await store.listEvents()).length, 2);

  const feedProjection = await client.listFeed({ agent_key: AGENT_KEY, limit: 10 });
  assert.equal(feedProjection.count, 1);
  const projectedFeed = feedProjection.items[0];
  assert.equal(projectedFeed.schema, "afi.feed_item.v1");
  assert.equal(projectedFeed.feed_item_id, feedInput.feed_item_id);
  assert.equal(projectedFeed.run_id, RUN_ID);
  assert.equal(projectedFeed.agent_id, AGENT_KEY);
  assert.deepEqual(
    projectedFeed.claims[0].source_refs.map((reference) => reference.source_item_id),
    [source.source_item_id],
  );
  assert.deepEqual(
    projectedFeed.source_items.map((item) => item.source_item_id),
    [source.source_item_id],
  );

  const sourceProjection = await client.listSources({ kind: "email", limit: 10 });
  assert.equal(sourceProjection.count, 1);
  assert.equal(sourceProjection.items[0].source_item_id, source.source_item_id);
  assert.deepEqual(sourceProjection.items[0].run_ids, [RUN_ID]);
  assert.deepEqual(sourceProjection.items[0].feed_ids, [feedInput.feed_item_id]);

  const actionBody = {
    subject: "Dinner this week",
    text: "Thursday works for me. Does 7:00 sound good?",
  };
  const boundActionPayload = {
    operation: "email.draft",
    account: "personal-email",
    target: "friend@example.test",
    body: actionBody,
  };
  const actionResult = await client.proposeAction({
    run_id: RUN_ID,
    agent_key: AGENT_KEY,
    sequence: 3,
    action_id: "action-email-integration-1",
    revision: 1,
    operation: boundActionPayload.operation,
    account: boundActionPayload.account,
    target: boundActionPayload.target,
    payload: actionBody,
    expires_at: "2026-08-20T12:00:00.000Z",
    rationale: "The draft resolves the scheduling question without sending it.",
    sources: [source],
  });
  assert.equal(actionResult.accepted, true);
  assert.equal(actionResult.duplicate, false);

  const actionEvent = (await store.listEvents())
    .find((event) => event.kind === "action.proposed");
  assert.ok(actionEvent, "the accepted proposal should remain in the append-only log");
  const proposal = actionEvent.data.proposal;
  const bridgeHash = `sha256:${canonicalSha256(boundActionPayload)}`;
  const independentlyVerifiedHubHash = await hashActionPayload(boundActionPayload);
  assert.equal(bridgeHash, independentlyVerifiedHubHash);
  assert.equal(proposal.payload_hash, independentlyVerifiedHubHash);
  assert.deepEqual(proposal.payload, boundActionPayload);
  assert.equal(proposal.status, "proposed");
  assert.equal("approved" in proposal, false);
  assert.equal("executed" in proposal, false);

  const completion = await client.completeRun({
    run_id: RUN_ID,
    agent_key: AGENT_KEY,
    sequence: 4,
    status: "completed",
    summary: "Observed one source, published one sourced feed item, and prepared one approval-gated draft.",
    completed_steps: ["Observe source", "Read source", "Publish feed item", "Prepare draft"],
    remaining_steps: [],
    sources: [],
  });
  assert.equal(completion.accepted, true);

  const runResponse = await app.fetch(new Request(`${HUB_URL}/v1/runs/${RUN_ID}`, {
    headers: { authorization: `Bearer ${READ_TOKEN}` },
  }));
  assert.equal(runResponse.status, 200);
  const { run } = await responsePayload(runResponse);
  assert.equal(run.status, "completed");
  assert.equal(run.event_count, 4);
  assert.equal(run.feed_item_count, 1);
  assert.deepEqual(run.events.map((event) => [event.sequence, event.kind]), [
    [1, "source.observed"],
    [2, "feed.item.published"],
    [3, "action.proposed"],
    [4, "run.completed"],
  ]);

  const approvalRequest = providerAuthorityRequest(
    "action.approval_decided",
    (payloadHash) => ({
      decision: {
        schema: "afi.approval_decision.v1",
        decision_id: "decision-integration-1",
        action_id: "action-email-integration-1",
        action_revision: 1,
        payload_hash: payloadHash,
        decision: "approved",
        decided_by: { actor_type: "user", actor_id: USER_ID },
        decided_at: NOW.toISOString(),
      },
    }),
    "nonce-provider-approval-0001",
    bridgeHash,
  );
  const approvalResponse = await app.fetch(approvalRequest);
  assert.equal(approvalResponse.status, 403);
  assert.equal((await responsePayload(approvalResponse)).error.code, "forbidden_authority");

  const receiptRequest = providerAuthorityRequest(
    "action.execution_receipt.recorded",
    (payloadHash) => ({
      receipt: {
        schema: "afi.execution_receipt.v1",
        receipt_id: "receipt-integration-1",
        action_id: "action-email-integration-1",
        action_revision: 1,
        payload_hash: payloadHash,
        provider_connection_id: CONNECTION_ID,
        status: "provider_acknowledged",
        occurred_at: NOW.toISOString(),
        evidence: {
          source: "provider-api",
          external_id: "provider-message-integration-1",
        },
      },
    }),
    "nonce-provider-receipt-0001",
    bridgeHash,
  );
  const receiptResponse = await app.fetch(receiptRequest);
  assert.equal(receiptResponse.status, 403);
  assert.equal((await responsePayload(receiptResponse)).error.code, "forbidden_authority");

  assert.equal((await store.listEvents()).length, 4);
  assert.equal("approveAction" in client, false);
  assert.equal("executeAction" in client, false);
});

test("two provider harnesses share one corrected Context Pack without gaining user authority", async (context) => {
  const parent = await mkdtemp(join(tmpdir(), "afi-root-context-integration-"));
  context.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "workspace");
  const { kernel } = await initializeContextWorkspace(root, {
    owner_id: "integration-owner",
    created_at: NOW.toISOString(),
  });

  const explicitId = ContextKernel.newEntityId();
  const explicitEntity = sealEntity({
    schema: "afi.context_statement.v1",
    entity_type: "context_statement",
    entity_id: explicitId,
    owner_id: "integration-owner",
    revision: 1,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    created_by: { actor_type: "user", actor_id: "integration-owner" },
    last_modified_by: { actor_type: "user", actor_id: "integration-owner" },
    provenance: {
      basis: "explicit",
      evidence_refs: [],
      human_seed_refs: [],
      derived_from_refs: [],
      external_refs: [],
      recorded_at: NOW.toISOString(),
    },
    retention: {
      classification: "private",
      mode: "durable",
      replication: "local_only",
      body_storage: "encrypted_object",
    },
    basis: "explicit",
    status: "active",
    subject: "social participation",
    predicate: "publishing_discovery_boundary",
    value: "Publishing should remain separate from discovery.",
    scope: { kind: "project", id: "agents-for-introverts" },
  });
  const explicit = await kernel.change({
    idempotency_key: "integration-explicit-seed",
    occurred_at: NOW.toISOString(),
    actor: { actor_type: "user", actor_id: "integration-owner" },
    kind: "context.statement.created",
    basis: "explicit",
    entity_type: "context_statement",
    entity_id: explicitId,
    expected_revision: 0,
    payload: {
      protocol_entity_schema: explicitEntity.schema,
      protocol_record_hash: explicitEntity.record_hash,
    },
    body: canonicalJson(explicitEntity),
  });

  const firstHarness = await LocalContextGateway.open({
    root,
    actorId: "integration-agent-a",
    roles: ["afi.daily-conversation"],
  });
  const opened = await firstHarness.openRun({
    role: "afi.daily-conversation",
    goal: "Find one low-noise place to participate",
    idempotency_key: "integration/open",
    bounds: { max_iterations: 6, context_budget_tokens: 4_096, source_limit: 3 },
  });
  const runId = opened.run_id;

  const evidenceContent = {
    excerpt: "A recurring public discussion concerns publishing without opening a discovery feed.",
  };
  const evidence = await firstHarness.recordEvidence({
    run_id: runId,
    evidence_id: "integration-public-source",
    evidence_class: "public_source",
    occurred_at: NOW.toISOString(),
    captured_at: NOW.toISOString(),
    content_hash: `sha256:${sha256(canonicalJson(evidenceContent))}`,
    content: evidenceContent,
    retention_class: "hub_eligible",
    source_url: "https://example.test/context-integration",
    external_id: "context-integration",
    provenance: [],
  });
  const evidenceRef = {
    entity_type: "evidence_item",
    entity_id: evidence.entity.entity_id,
    revision: evidence.entity.revision,
  };
  const explicitRef = {
    entity_type: "context_statement",
    entity_id: explicit.event.entity.id,
    revision: explicit.event.entity.revision,
  };
  const thread = await firstHarness.appendContextEvent({
    run_id: runId,
    event_id: "integration-thread-proposal",
    idempotency_key: "integration/thread",
    kind: "thread.proposed",
    entity: { entity_type: "thread", entity_id: "external-thread", expected_revision: 0 },
    occurred_at: NOW.toISOString(),
    payload: {
      title: "Feedless social participation",
      summary: "People are discussing ways to publish without entering algorithmic discovery feeds.",
      status: "watching",
      claims: [{
        claim_id: "feedless-publishing",
        text: "A recurring public discussion concerns feedless publishing.",
        evidence_refs: [evidenceRef],
        first_seen_at: NOW.toISOString(),
        last_seen_at: NOW.toISOString(),
        occurrence_count: 1,
      }],
      context_refs: [explicitRef],
      participant_refs: [],
      first_seen_at: NOW.toISOString(),
      last_seen_at: NOW.toISOString(),
    },
    provenance: [
      { ref: evidenceRef, relation: "supported_by", observed_at: NOW.toISOString() },
      { ref: explicitRef, relation: "relevant_to" },
    ],
  });
  const threadRef = {
    entity_type: "thread",
    entity_id: thread.entity.entity_id,
    revision: thread.entity.revision,
  };
  const selection = await firstHarness.appendContextEvent({
    run_id: runId,
    event_id: "integration-selection-proposal",
    idempotency_key: "integration/selection",
    kind: "selection.proposed",
    entity: { entity_type: "selection_run", entity_id: "external-selection", expected_revision: 0 },
    occurred_at: NOW.toISOString(),
    payload: {
      evaluation_kind: "place_selection",
      question: "Is this a low-noise place to contribute the publishing/discovery principle?",
      method: "Evaluate relevance, evidence, human cost, and whether a concrete contribution is available.",
      candidates: [{
        candidate_id: "feedless-discussion",
        label: "Feedless publishing discussion",
        disposition: "recommended",
        rationale: "It directly matches the explicit design principle and requires only one bounded reply.",
        score: 0.9,
        evidence_refs: [evidenceRef],
      }],
      evaluated_count: 1,
      rejected_count: 0,
      result: "recommendation",
      recommended_candidate_ids: ["feedless-discussion"],
      limitations: ["Synthetic integration source; no live network verification."],
      completed_at: NOW.toISOString(),
    },
    provenance: [
      { ref: evidenceRef, relation: "evaluated_from", observed_at: NOW.toISOString() },
      { ref: threadRef, relation: "narrows" },
    ],
  });
  const selectionRef = {
    entity_type: "selection_run",
    entity_id: selection.entity.entity_id,
    revision: selection.entity.revision,
  };
  await firstHarness.appendContextEvent({
    run_id: runId,
    event_id: "integration-place-proposal",
    idempotency_key: "integration/place",
    kind: "place.proposed",
    entity: { entity_type: "place", entity_id: "external-place", expected_revision: 0 },
    occurred_at: NOW.toISOString(),
    payload: {
      thread_ref: threadRef,
      selection_run_ref: selectionRef,
      title: "Feedless publishing discussion",
      source_door: {
        provider: "web",
        kind: "discussion",
        external_id: "context-integration",
        uri: "https://example.test/context-integration",
        observed_at: NOW.toISOString(),
      },
      opportunity: "Contribute a concrete product principle to a recurring discussion.",
      contribution: "Share the publishing/discovery separation as an explicit design principle.",
      people_refs: [],
      next_move: "Prepare one exact reply for user review; do not publish it.",
      human_cost: "low",
      status: "proposed",
      // Keep this cross-process determinism fixture valid regardless of the
      // wall-clock date on which the suite runs. Expiry behavior has dedicated
      // clock-aware coverage in the Context Kernel tests.
      expires_at: "2099-08-26T12:00:00.000Z",
    },
    provenance: [
      { ref: threadRef, relation: "belongs_to" },
      { ref: selectionRef, relation: "selected_by" },
      { ref: evidenceRef, relation: "supported_by", observed_at: NOW.toISOString() },
    ],
  });

  const firstPack = await firstHarness.assembleContext({
    run_id: runId,
    role: "afi.daily-conversation",
    goal: "Find one low-noise place to participate",
    token_budget: 4_096,
  });
  const secondHarness = await LocalContextGateway.open({
    root,
    actorId: "integration-agent-b",
    roles: ["afi.daily-conversation"],
  });
  const secondPack = await secondHarness.assembleContext({
    run_id: runId,
    role: "afi.daily-conversation",
    goal: "Find one low-noise place to participate",
    token_budget: 4_096,
  });
  assert.equal(secondPack.context_pack_id, firstPack.context_pack_id);
  assert.equal(secondPack.watermark.last_event_hash, firstPack.watermark.last_event_hash);
  assert.equal(secondPack.context.explicit.length, 1);
  assert.equal(secondPack.context.observed.length, 1);
  assert.ok(secondPack.context.inferred.some((item) => item.entity_type === "place"));

  await assert.rejects(() => secondHarness.appendContextEvent({
    run_id: runId,
    event_id: "integration-explicit-overwrite",
    idempotency_key: "integration/overwrite",
    kind: "context.statement.proposed",
    entity: {
      entity_type: "context_statement",
      entity_id: explicit.event.entity.id,
      expected_revision: 1,
    },
    occurred_at: NOW.toISOString(),
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "social participation",
      predicate: "publishing_discovery_boundary",
      value: "An agent changed the explicit preference.",
      scope: { kind: "project", id: "agents-for-introverts" },
    },
    provenance: [],
  }), /explicit.*context/i);
});
