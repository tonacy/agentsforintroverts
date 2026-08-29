import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { BridgeConfig } from "../config.js";
import {
  canonicalJson,
  canonicalSha256,
  HubClient,
  signatureInput,
} from "../hub-client.js";

const config: BridgeConfig = {
  hubUrl: "https://hub.example.test",
  connectionId: "conn-codex",
  userId: "user-tony",
  provider: "codex",
  hubSecret: "test-secret",
  hubReadToken: "read-token",
  mcpBearerToken: undefined,
  host: "127.0.0.1",
  port: 8788,
  allowedHosts: [],
};

const source = {
  source_item_id: "src-canonical-1",
  external_id: "gmail-message-1",
  kind: "email",
  url: "https://mail.example.test/thread/1",
  captured_at: "2026-08-19T03:00:00.000Z",
  content_hash: `sha256:${"a".repeat(64)}`,
};

interface CapturedFeedEvent {
  kind: string;
  producer: { connection_id: string };
  data: {
    feed_item: {
      user_id: string;
      lane: string;
      claims: Array<{ source_refs: Array<{ source_item_id: string }> }>;
      sources: Array<{ source_item_id: string }>;
    };
  };
  sources: Array<{ external_id: string }>;
}

interface CapturedActionEvent {
  kind: string;
  data: {
    proposal: {
      status: string;
      proposed_by: { actor_type: string };
      payload: {
        operation: string;
        account: string;
        target: string;
      };
      payload_hash: string;
    };
  };
}

interface CapturedSourceEvent {
  kind: string;
  data: Record<string, unknown>;
  sources: Array<Record<string, unknown>>;
}

test("observes one source without adding interpretation and preserves the rich Hub receipt", async () => {
  let event: CapturedSourceEvent | undefined;
  const receipt = {
    accepted: true,
    schema: "afi.event.v1",
    event_id: "event-source-00000000-0000-4000-8000-000000000001",
    run_id: "run-source-1",
    duplicate: false,
    accepted_at: "2026-08-20T16:31:00.000Z",
  };
  const fakeFetch: typeof fetch = async (_input, init) => {
    event = JSON.parse(String(init?.body)) as CapturedSourceEvent;
    return new Response(JSON.stringify(receipt), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };
  const ids = [receipt.event_id, "nonce-source-000000000001"];
  const client = new HubClient(
    config,
    fakeFetch,
    () => new Date("2026-08-20T16:31:00.000Z"),
    () => ids.shift() ?? "unexpected-id",
  );
  const observedSource = {
    run_id: receipt.run_id,
    agent_key: "afi.daily-conversation",
    sequence: 1,
    trigger: "source_event",
    source_item_id: "source-web-1",
    external_id: "post-1",
    kind: "web",
    url: "https://example.test/posts/1",
    captured_at: "2026-08-20T16:30:00.000Z",
    content_hash: `sha256:${"b".repeat(64)}`,
    title: "A public conversation",
    author: "Example Author",
    excerpt: "A bounded excerpt retained as source material.",
    metadata: { publication: "Example", tags: ["agents", "discourse"] },
  };

  assert.deepEqual(await client.observeSource(observedSource), receipt);
  assert.equal(event!.kind, "source.observed");
  assert.deepEqual(event!.data, { source_item_id: observedSource.source_item_id });
  assert.deepEqual(event!.sources, [{
    source_item_id: observedSource.source_item_id,
    external_id: observedSource.external_id,
    kind: observedSource.kind,
    url: observedSource.url,
    captured_at: observedSource.captured_at,
    content_hash: observedSource.content_hash,
    title: observedSource.title,
    author: observedSource.author,
    excerpt: observedSource.excerpt,
    metadata: observedSource.metadata,
  }]);
  assert.equal("summary" in event!.data, false);
  assert.equal("claims" in event!.data, false);
});

test("publishes a signed canonical feed event with claim-level provenance", async () => {
  let request: Request | undefined;
  const fakeFetch: typeof fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ accepted: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  };
  const ids = ["event-00000000-0000-4000-8000-000000000001", "nonce-0000000000000001"];
  const client = new HubClient(
    config,
    fakeFetch,
    () => new Date("2026-08-19T03:05:00.000Z"),
    () => ids.shift() ?? "unexpected-id",
  );

  await client.publishFeedItem({
    run_id: "run-1",
    agent_key: "afi.inbox",
    sequence: 2,
    feed_item_id: "feed-1",
    headline: "A reply needs a decision",
    summary: "A synthetic fixture asks which day works.",
    why_it_matters: "The proposed dates expire tomorrow.",
    lane: "needs_you",
    confidence: 0.9,
    claims: [{
      claim_id: "claim-1",
      kind: "deadline",
      text: "The reply is requested by tomorrow.",
      source_refs: [source.source_item_id],
      confidence: 0.9,
    }],
    sources: [source],
  });

  assert.ok(request);
  const body = await request.text();
  const event = JSON.parse(body) as CapturedFeedEvent;
  assert.equal(event.kind, "feed.item.published");
  assert.equal(event.producer.connection_id, config.connectionId);
  assert.equal(event.data.feed_item.user_id, config.userId);
  assert.equal(event.data.feed_item.lane, "needs_you");
  assert.equal(event.data.feed_item.claims[0].source_refs[0].source_item_id, source.source_item_id);
  assert.equal(event.data.feed_item.sources[0].source_item_id, source.source_item_id);
  assert.equal(event.sources[0].external_id, source.external_id);

  const timestamp = request.headers.get("x-afi-timestamp")!;
  const nonce = request.headers.get("x-afi-nonce")!;
  const expected = createHmac("sha256", config.hubSecret!)
    .update(signatureInput(timestamp, nonce, body))
    .digest("hex");
  assert.equal(request.headers.get("x-afi-key-id"), config.connectionId);
  assert.equal(request.headers.get("x-afi-signature"), expected);
});

test("action proposal binds operation, account, target, and body without approving or executing", async () => {
  let event: CapturedActionEvent | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    event = JSON.parse(String(init?.body)) as CapturedActionEvent;
    return new Response(JSON.stringify({ accepted: true }), { status: 202 });
  };
  const client = new HubClient(config, fakeFetch, () => new Date("2026-08-19T03:05:00.000Z"), () => "uuid-0000000000000001");
  await client.proposeAction({
    run_id: "run-2",
    agent_key: "afi.scheduling",
    sequence: 4,
    action_id: "action-1",
    revision: 1,
    operation: "calendar.create_hold",
    account: "work-calendar",
    target: "calendar:primary",
    payload: { starts_at: "2026-08-20T16:00:00Z" },
    expires_at: "2026-08-20T12:00:00Z",
    rationale: "Synthetic scheduling conflict",
    sources: [source],
  });

  const proposal = event!.data.proposal;
  assert.equal(event!.kind, "action.proposed");
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.proposed_by.actor_type, "agent");
  assert.equal(proposal.payload.operation, "calendar.create_hold");
  assert.equal(proposal.payload.account, "work-calendar");
  assert.equal(proposal.payload.target, "calendar:primary");
  assert.match(proposal.payload_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(proposal.payload_hash, `sha256:${canonicalSha256(proposal.payload)}`);
  assert.equal("approved" in proposal, false);
  assert.equal("executed" in proposal, false);
});

test("canonical JSON is stable and rejects lossy values", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.throws(() => canonicalJson({ bad: undefined }), /undefined/);
  assert.throws(() => canonicalJson({ bad: Number.NaN }), /non-finite/);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => canonicalJson(cyclic), /cycles/);
});

test("write tools fail clearly when hub signing is not configured", async () => {
  const client = new HubClient({ ...config, hubSecret: undefined });
  await assert.rejects(() => client.completeRun({
    run_id: "run-3",
    agent_key: "afi.meetup",
    sequence: 1,
    status: "partial",
    summary: "Waiting for a source",
    completed_steps: [],
    remaining_steps: ["Read invite"],
    blocker: "Source unavailable",
    sources: [],
  }), /QUIET_HUB_SECRET/);
});
