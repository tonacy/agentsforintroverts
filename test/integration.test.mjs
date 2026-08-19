import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createHubApp } from "../services/hub/.test-dist/src/app.js";
import { hashActionPayload } from "../services/hub/.test-dist/src/canonical.js";
import { MemoryEventStore } from "../services/hub/.test-dist/src/memory-store.js";
import {
  canonicalSha256,
  HubClient,
  signatureInput,
} from "../services/mcp/dist/hub-client.js";

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

  const feedInput = {
    run_id: RUN_ID,
    agent_key: AGENT_KEY,
    sequence: 1,
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
  assert.equal((await store.listEvents()).length, 1);

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
    sequence: 2,
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
    sequence: 3,
    status: "completed",
    summary: "Published one sourced feed item and prepared one approval-gated draft.",
    completed_steps: ["Read source", "Publish feed item", "Prepare draft"],
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
  assert.equal(run.event_count, 3);
  assert.equal(run.feed_item_count, 1);
  assert.deepEqual(run.events.map((event) => [event.sequence, event.kind]), [
    [1, "feed.item.published"],
    [2, "action.proposed"],
    [3, "run.completed"],
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

  assert.equal((await store.listEvents()).length, 3);
  assert.equal("approveAction" in client, false);
  assert.equal("executeAction" in client, false);
});
