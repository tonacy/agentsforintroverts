import assert from "node:assert/strict";
import test from "node:test";

import { createHubApp, type HubApp } from "../src/app.js";
import { hashActionPayload } from "../src/canonical.js";
import { MemoryEventStore } from "../src/memory-store.js";
import { createHmacSignature } from "../src/security.js";

const NOW_MS = Date.parse("2026-08-19T12:00:00.000Z");
const KEY_ID = "connection-codex";
const SECRET = "test-secret-that-is-not-used-outside-tests";
const READ_TOKEN = "test-read-token";
const BASE_URL = "https://hub.example.test";

interface TestHarness {
  app: HubApp;
  store: MemoryEventStore;
}

function harness(): TestHarness {
  const store = new MemoryEventStore();
  return {
    store,
    app: createHubApp({
      store,
      readToken: READ_TOKEN,
      resolveSecret: async (keyId) => keyId === KEY_ID ? SECRET : null,
      now: () => NOW_MS,
    }),
  };
}

function source(sourceItemId = "source-email-1"): Record<string, unknown> {
  return {
    source_item_id: sourceItemId,
    external_id: `external-${sourceItemId}`,
    kind: "email",
    url: `https://mail.example.test/${sourceItemId}`,
    title: "A useful email thread",
    captured_at: "2026-08-19T11:55:00.000Z",
    content_hash: `sha256:${sourceItemId}`,
  };
}

function envelope(options: {
  eventId?: string;
  idempotencyKey?: string;
  runId?: string;
  agentKey?: string;
  provider?: string;
  sequence?: number;
  occurredAt?: string;
  kind?: string;
  data?: Record<string, unknown>;
  sources?: Array<Record<string, unknown>>;
} = {}): Record<string, unknown> {
  const eventId = options.eventId ?? "event-1";
  return {
    schema: "afi.event.v1",
    event_id: eventId,
    idempotency_key: options.idempotencyKey ?? `idem-${eventId}`,
    occurred_at: options.occurredAt ?? "2026-08-19T12:00:00.000Z",
    producer: {
      connection_id: KEY_ID,
      provider: options.provider ?? "codex",
      external_agent_id: options.agentKey ?? "afi.inbox",
    },
    run: {
      external_id: options.runId ?? "run-1",
      agent_key: options.agentKey ?? "afi.inbox",
      trigger: "manual",
    },
    sequence: options.sequence ?? 1,
    kind: options.kind ?? "run.started",
    data: options.data ?? { status: "running" },
    sources: options.sources ?? [],
  };
}

function feedEnvelope(options: {
  eventId: string;
  feedItemId: string;
  sourceItemId: string;
  runId?: string;
  agentKey?: string;
  provider?: string;
  lane?: "needs_you" | "handled" | "watching" | "digest";
  occurredAt?: string;
  sequence?: number;
}): Record<string, unknown> {
  const itemSource = source(options.sourceItemId);
  const agentKey = options.agentKey ?? "afi.inbox";
  const runId = options.runId ?? "run-1";
  const occurredAt = options.occurredAt ?? "2026-08-19T12:01:00.000Z";
  return envelope({
    eventId: options.eventId,
    runId,
    agentKey,
    provider: options.provider,
    sequence: options.sequence ?? 2,
    occurredAt,
    kind: "feed.item.published",
    sources: [itemSource],
    data: {
      feed_item: {
        schema: "afi.feed_item.v1",
        feed_item_id: options.feedItemId,
        user_id: "user-1",
        run_id: runId,
        agent_id: agentKey,
        revision: 1,
        title: `Headline for ${options.feedItemId}`,
        summary: "A concise, source-grounded summary.",
        lane: options.lane ?? "needs_you",
        why_it_matters: "This needs a bounded decision.",
        confidence: 0.9,
        claims: [
          {
            claim_id: `claim-${options.feedItemId}`,
            kind: "fact",
            text: "The sender asked for a response.",
            source_refs: [{ source_item_id: options.sourceItemId }],
            confidence: 0.9,
          },
        ],
        sources: [
          {
            source_item_id: options.sourceItemId,
            locator: itemSource.url,
            observed_at: itemSource.captured_at,
          },
        ],
        status: "unread",
        created_at: occurredAt,
      },
    },
  });
}

async function actionEnvelope(options: {
  eventId?: string;
  runId?: string;
  agentKey?: string;
  payloadHash?: string;
  proposedBy?: Record<string, unknown>;
} = {}): Promise<Record<string, unknown>> {
  const sourceItem = source("source-action-1");
  const runId = options.runId ?? "run-action-1";
  const agentKey = options.agentKey ?? "afi.inbox";
  const payload = {
    account: "personal-email",
    target: "friend@example.test",
    body: { subject: "Checking in", text: "Want to catch up?" },
  };
  return envelope({
    eventId: options.eventId ?? "event-action-1",
    runId,
    agentKey,
    kind: "action.proposed",
    sources: [sourceItem],
    data: {
      proposal: {
        schema: "afi.action_proposal.v1",
        action_id: "action-1",
        revision: 1,
        user_id: "user-1",
        run_id: runId,
        agent_id: agentKey,
        provider_connection_id: KEY_ID,
        action_kind: "email.draft",
        rationale: "A draft is useful, but sending remains approval-gated.",
        payload,
        payload_hash: options.payloadHash ?? await hashActionPayload(payload),
        proposed_by: options.proposedBy ?? { actor_type: "agent", actor_id: agentKey },
        proposed_at: "2026-08-19T12:00:00.000Z",
        expires_at: "2026-08-20T12:00:00.000Z",
        sources: [{ source_item_id: "source-action-1" }],
        status: "proposed",
      },
    },
  });
}

async function signedRequest(
  event: unknown,
  options: {
    nonce?: string;
    timestamp?: string;
    signature?: string;
    omitSignature?: boolean;
  } = {},
): Promise<Request> {
  const body = JSON.stringify(event);
  const timestamp = options.timestamp ?? String(Math.floor(NOW_MS / 1_000));
  const nonce = options.nonce ?? "nonce-000000000001";
  const signature = options.signature ?? await createHmacSignature(SECRET, timestamp, nonce, body);
  const headers = new Headers({
    "content-type": "application/json",
    "x-afi-key-id": KEY_ID,
    "x-afi-timestamp": timestamp,
    "x-afi-nonce": nonce,
  });
  if (!options.omitSignature) headers.set("x-afi-signature", signature);
  return new Request(`${BASE_URL}/v1/events`, { method: "POST", headers, body });
}

function readRequest(path: string): Request {
  return new Request(`${BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${READ_TOKEN}` },
  });
}

async function responseJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

test("GET /health is public and reports the event schema", async () => {
  const { app } = harness();
  const response = await app.fetch(new Request(`${BASE_URL}/health`));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), {
    status: "ok",
    schema: "afi.event.v1",
    storage: "memory",
  });
});

test("POST /v1/events rejects a missing signature", async () => {
  const { app } = harness();
  const response = await app.fetch(await signedRequest(envelope(), { omitSignature: true }));
  assert.equal(response.status, 401);
  const body = await responseJson<{ error: { code: string } }>(response);
  assert.equal(body.error.code, "missing_signature");
});

test("POST /v1/events rejects an invalid signature", async () => {
  const { app } = harness();
  const response = await app.fetch(await signedRequest(envelope(), { signature: "0".repeat(64) }));
  assert.equal(response.status, 401);
  const body = await responseJson<{ error: { code: string } }>(response);
  assert.equal(body.error.code, "invalid_signature");
});

test("POST /v1/events enforces the bounded timestamp window", async () => {
  const { app } = harness();
  const staleTimestamp = String(Math.floor((NOW_MS - 301_000) / 1_000));
  const response = await app.fetch(await signedRequest(envelope(), {
    timestamp: staleTimestamp,
    nonce: "nonce-stale-00000001",
  }));
  assert.equal(response.status, 401);
  const body = await responseJson<{ error: { code: string } }>(response);
  assert.equal(body.error.code, "stale_timestamp");
});

test("afi.event.v1 requires a positive sequence and timezone-qualified timestamp", async () => {
  const { app } = harness();
  const zeroSequence = envelope({ eventId: "event-zero-sequence", sequence: 0 });
  const zeroResponse = await app.fetch(await signedRequest(zeroSequence, {
    nonce: "nonce-zero-sequence01",
  }));
  assert.equal(zeroResponse.status, 422);

  const dateOnly = envelope({ eventId: "event-date-only", occurredAt: "2026-08-19" });
  const dateResponse = await app.fetch(await signedRequest(dateOnly, {
    nonce: "nonce-date-only-00001",
  }));
  assert.equal(dateResponse.status, 422);
});

test("afi.event.v1 rejects JSON numbers that cannot be stored losslessly", async () => {
  const { app } = harness();
  const body = JSON.stringify(envelope()).replace(
    '"data":{"status":"running"}',
    '"data":{"score":1e400}',
  );
  const timestamp = String(Math.floor(NOW_MS / 1_000));
  const nonce = "nonce-nonfinite-json01";
  const signature = await createHmacSignature(SECRET, timestamp, nonce, body);
  const response = await app.fetch(new Request(`${BASE_URL}/v1/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-afi-key-id": KEY_ID,
      "x-afi-timestamp": timestamp,
      "x-afi-nonce": nonce,
      "x-afi-signature": signature,
    },
    body,
  }));
  assert.equal(response.status, 422);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(response)).error.code,
    "invalid_json_value",
  );
});

test("POST /v1/events rejects nonce replay", async () => {
  const { app } = harness();
  const event = envelope();
  const nonce = "nonce-replay-000001";
  const first = await app.fetch(await signedRequest(event, { nonce }));
  assert.equal(first.status, 202);
  const replay = await app.fetch(await signedRequest(event, { nonce }));
  assert.equal(replay.status, 409);
  const body = await responseJson<{ error: { code: string } }>(replay);
  assert.equal(body.error.code, "nonce_replay");
});

test("POST /v1/events returns the original canonical IDs for duplicate idempotency", async () => {
  const { app, store } = harness();
  const event = envelope({ eventId: "event-idempotent", runId: "run-idempotent" });
  const first = await app.fetch(await signedRequest(event, { nonce: "nonce-idempotent-01" }));
  const duplicate = await app.fetch(await signedRequest(event, { nonce: "nonce-idempotent-02" }));
  assert.equal(first.status, 202);
  assert.equal(duplicate.status, 202);

  const firstBody = await responseJson<{ event_id: string; run_id: string; duplicate: boolean }>(first);
  const duplicateBody = await responseJson<{ event_id: string; run_id: string; duplicate: boolean }>(duplicate);
  assert.equal(firstBody.event_id, "event-idempotent");
  assert.equal(firstBody.run_id, "run-idempotent");
  assert.equal(firstBody.duplicate, false);
  assert.equal(duplicateBody.event_id, "event-idempotent");
  assert.equal(duplicateBody.run_id, "run-idempotent");
  assert.equal(duplicateBody.duplicate, true);
  assert.equal((await store.listEvents()).length, 1);
});

test("POST /v1/events rejects changed content under an existing idempotency key", async () => {
  const { app, store } = harness();
  const original = envelope({ eventId: "event-idempotency-conflict" });
  const changed = structuredClone(original);
  changed.data = { status: "running", injected: "changed signed content" };

  assert.equal((await app.fetch(await signedRequest(original, {
    nonce: "nonce-conflict-first01",
  }))).status, 202);
  const response = await app.fetch(await signedRequest(changed, {
    nonce: "nonce-conflict-next001",
  }));
  assert.equal(response.status, 409);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(response)).error.code,
    "idempotency_conflict",
  );
  assert.equal((await store.listEvents()).length, 1);
});

test("run projection is deterministic when events arrive out of order", async () => {
  const { app } = harness();
  const completed = envelope({
    eventId: "event-completed",
    idempotencyKey: "idem-completed",
    runId: "run-out-of-order",
    sequence: 3,
    occurredAt: "2026-08-19T12:03:00.000Z",
    kind: "run.completed",
    data: { status: "completed", summary: "Done", output_ids: [] },
  });
  const started = envelope({
    eventId: "event-started",
    idempotencyKey: "idem-started",
    runId: "run-out-of-order",
    sequence: 1,
    occurredAt: "2026-08-19T12:01:00.000Z",
  });

  assert.equal((await app.fetch(await signedRequest(completed, { nonce: "nonce-completed-0001" }))).status, 202);
  assert.equal((await app.fetch(await signedRequest(started, { nonce: "nonce-started-000001" }))).status, 202);

  const response = await app.fetch(readRequest("/v1/runs/run-out-of-order"));
  assert.equal(response.status, 200);
  const body = await responseJson<{
    run: { status: string; events: Array<{ sequence: number; kind: string }> };
  }>(response);
  assert.equal(body.run.status, "completed");
  assert.deepEqual(body.run.events.map((event) => [event.sequence, event.kind]), [
    [1, "run.started"],
    [3, "run.completed"],
  ]);
});

test("feed publication is rejected when claims lack event source provenance", async () => {
  const { app } = harness();
  const event = feedEnvelope({
    eventId: "event-no-provenance",
    feedItemId: "feed-no-provenance",
    sourceItemId: "source-missing",
  });
  event.sources = [];
  const response = await app.fetch(await signedRequest(event, { nonce: "nonce-no-provenance1" }));
  assert.equal(response.status, 422);
  const body = await responseJson<{ error: { code: string } }>(response);
  assert.equal(body.error.code, "provenance_required");
});

test("provider keys cannot emit approval or execution authority", async () => {
  const { app } = harness();
  const event = envelope({
    eventId: "event-self-approval",
    kind: "action.approval_decided",
    data: { decision: { decision: "approved" } },
  });
  const response = await app.fetch(await signedRequest(event, { nonce: "nonce-self-approval01" }));
  assert.equal(response.status, 403);
  const body = await responseJson<{ error: { code: string } }>(response);
  assert.equal(body.error.code, "forbidden_authority");
});

test("action proposals bind the canonical payload and envelope identities", async () => {
  const { app } = harness();
  const valid = await app.fetch(await signedRequest(await actionEnvelope(), {
    nonce: "nonce-action-valid001",
  }));
  assert.equal(valid.status, 202);

  const badHash = await app.fetch(await signedRequest(await actionEnvelope({
    eventId: "event-action-bad-hash",
    payloadHash: `sha256:${"0".repeat(64)}`,
  }), { nonce: "nonce-action-badhash1" }));
  assert.equal(badHash.status, 422);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(badHash)).error.code,
    "payload_hash_mismatch",
  );

  const wrongActor = await app.fetch(await signedRequest(await actionEnvelope({
    eventId: "event-action-wrong-actor",
    proposedBy: { actor_type: "user", actor_id: "user-1" },
  }), { nonce: "nonce-action-wrongact1" }));
  assert.equal(wrongActor.status, 403);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(wrongActor)).error.code,
    "forbidden_authority",
  );
});

test("canonical feed identity must match the event run envelope", async () => {
  const { app } = harness();
  const event = feedEnvelope({
    eventId: "event-feed-binding",
    feedItemId: "feed-binding",
    sourceItemId: "source-binding",
  });
  const feedItem = (event.data as Record<string, unknown>).feed_item as Record<string, unknown>;
  feedItem.agent_id = "afi.someone-else";
  const response = await app.fetch(await signedRequest(event, { nonce: "nonce-feed-binding001" }));
  assert.equal(response.status, 422);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(response)).error.code,
    "event_run_binding_mismatch",
  );
});

test("feed revisions project deterministically when update arrives before publication", async () => {
  const { app } = harness();
  const published = feedEnvelope({
    eventId: "event-feed-publish-late",
    feedItemId: "feed-revised",
    sourceItemId: "source-revised",
    runId: "run-revised",
    sequence: 2,
    occurredAt: "2026-08-19T12:02:00.000Z",
  });
  const updated = structuredClone(published);
  updated.event_id = "event-feed-update-first";
  updated.idempotency_key = "idem-event-feed-update-first";
  updated.sequence = 3;
  updated.occurred_at = "2026-08-19T12:03:00.000Z";
  updated.kind = "feed.item.updated";
  const updateData = updated.data as Record<string, unknown>;
  updateData.previous_revision = 1;
  const updateItem = updateData.feed_item as Record<string, unknown>;
  updateItem.revision = 2;
  updateItem.title = "Updated after deterministic replay";

  assert.equal((await app.fetch(await signedRequest(updated, { nonce: "nonce-feed-update001" }))).status, 202);
  assert.equal((await app.fetch(await signedRequest(published, { nonce: "nonce-feed-publish01" }))).status, 202);

  const response = await app.fetch(readRequest("/v1/feed/feed-revised"));
  assert.equal(response.status, 200);
  const body = await responseJson<{ item: { revision: number; title: string } }>(response);
  assert.equal(body.item.revision, 2);
  assert.equal(body.item.title, "Updated after deterministic replay");
});

test("unknown event kinds remain append-only records and are ignored by feed projection", async () => {
  const { app, store } = harness();
  const event = envelope({
    eventId: "event-provider-extension",
    kind: "provider.custom_observation",
    data: { note: "Provider-specific, non-authoritative telemetry." },
  });
  const response = await app.fetch(await signedRequest(event, { nonce: "nonce-unknown-kind001" }));
  assert.equal(response.status, 202);
  assert.equal((await store.listEvents())[0]?.kind, "provider.custom_observation");
  const feed = await responseJson<{ count: number }>(await app.fetch(readRequest("/v1/feed")));
  assert.equal(feed.count, 0);
});

test("legacy feed.proposed is retained but cannot bypass canonical feed validation", async () => {
  const { app, store } = harness();
  const legacy = envelope({
    eventId: "event-legacy-feed",
    kind: "feed.proposed",
    data: {
      headline: "Legacy synthetic feed item",
      summary: "This event is audit-only in v1.",
      kind: "needs_you",
    },
  });
  assert.equal((await app.fetch(await signedRequest(legacy, {
    nonce: "nonce-legacy-feed0001",
  }))).status, 202);
  assert.equal((await store.listEvents()).length, 1);
  const feed = await responseJson<{ count: number }>(await app.fetch(readRequest("/v1/feed")));
  assert.equal(feed.count, 0);
});

test("source URL is optional, but a supplied URL must be HTTP(S)", async () => {
  const { app } = harness();
  const withoutUrl = envelope({
    eventId: "event-source-without-url",
    kind: "source.observed",
    sources: [{ ...source("source-without-url"), url: undefined }],
  });
  // JSON serialization omits the undefined property, matching a provider body.
  assert.equal((await app.fetch(await signedRequest(withoutUrl, {
    nonce: "nonce-source-nourl001",
  }))).status, 202);

  const unsafeUrl = envelope({
    eventId: "event-source-unsafe-url",
    kind: "source.observed",
    sources: [{ ...source("source-unsafe-url"), url: "file:///private/data" }],
  });
  const rejected = await app.fetch(await signedRequest(unsafeUrl, {
    nonce: "nonce-source-badurl001",
  }));
  assert.equal(rejected.status, 422);
});

test("ingest enforces the configured payload-size limit", async () => {
  const { store } = harness();
  const app = createHubApp({
    store,
    readToken: READ_TOKEN,
    resolveSecret: async () => SECRET,
    now: () => NOW_MS,
    maxBodyBytes: 128,
  });
  const response = await app.fetch(await signedRequest(envelope(), {
    nonce: "nonce-payload-limit01",
  }));
  assert.equal(response.status, 413);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(response)).error.code,
    "payload_too_large",
  );
});

test("read endpoints require the configured bearer token", async () => {
  const { app } = harness();
  const missing = await app.fetch(new Request(`${BASE_URL}/v1/feed`));
  assert.equal(missing.status, 401);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(missing)).error.code,
    "missing_bearer",
  );
});

test("feed and source projections expose canonical IDs and apply filters", async () => {
  const { app } = harness();
  const needsYou = feedEnvelope({
    eventId: "event-feed-needs-you",
    feedItemId: "feed-needs-you",
    sourceItemId: "source-needs-you",
    runId: "run-feed",
    agentKey: "afi.inbox",
    provider: "codex",
    lane: "needs_you",
    occurredAt: "2026-08-19T12:01:00.000Z",
  });
  const digest = feedEnvelope({
    eventId: "event-feed-digest",
    feedItemId: "feed-digest",
    sourceItemId: "source-digest",
    runId: "run-digest",
    agentKey: "afi.group-chat",
    provider: "codex",
    lane: "digest",
    occurredAt: "2026-08-19T12:02:00.000Z",
  });
  assert.equal((await app.fetch(await signedRequest(needsYou, { nonce: "nonce-feed-needsyou1" }))).status, 202);
  assert.equal((await app.fetch(await signedRequest(digest, { nonce: "nonce-feed-digest001" }))).status, 202);

  const listResponse = await app.fetch(readRequest(
    "/v1/feed?lane=needs_you&agent_key=afi.inbox&provider=codex&run_id=run-feed&limit=10",
  ));
  assert.equal(listResponse.status, 200);
  const list = await responseJson<{
    count: number;
    items: Array<{
      feed_item_id: string;
      source_items: Array<{ source_item_id: string }>;
      claims: Array<{ source_refs: Array<{ source_item_id: string }> }>;
    }>;
  }>(listResponse);
  assert.equal(list.count, 1);
  assert.equal(list.items[0]?.feed_item_id, "feed-needs-you");
  assert.equal(list.items[0]?.source_items[0]?.source_item_id, "source-needs-you");
  assert.equal(list.items[0]?.claims[0]?.source_refs[0]?.source_item_id, "source-needs-you");

  const detail = await app.fetch(readRequest("/v1/feed/feed-needs-you"));
  assert.equal(detail.status, 200);
  assert.equal(
    (await responseJson<{ item: { feed_item_id: string } }>(detail)).item.feed_item_id,
    "feed-needs-you",
  );

  const sources = await app.fetch(readRequest("/v1/sources?kind=email&q=useful&limit=10"));
  assert.equal(sources.status, 200);
  const sourceList = await responseJson<{ count: number; items: Array<{ source_item_id: string }> }>(sources);
  assert.equal(sourceList.count, 2);

  const sourceDetail = await app.fetch(readRequest("/v1/sources/source-needs-you"));
  assert.equal(sourceDetail.status, 200);
  const sourceBody = await responseJson<{
    item: { source_item_id: string; feed_ids: string[]; run_ids: string[] };
  }>(sourceDetail);
  assert.equal(sourceBody.item.source_item_id, "source-needs-you");
  assert.deepEqual(sourceBody.item.feed_ids, ["feed-needs-you"]);
  assert.deepEqual(sourceBody.item.run_ids, ["run-feed"]);
});
