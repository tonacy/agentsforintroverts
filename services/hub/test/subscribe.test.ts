import assert from "node:assert/strict";
import test from "node:test";

import { createHubApp, type HubApp, type SubscribeOptions } from "../src/app.js";
import { MemoryEventStore } from "../src/memory-store.js";

const NOW_MS = Date.parse("2026-08-31T09:00:00.000Z");
const BASE_URL = "https://hub.example.test";
const SITE_ORIGIN = "https://agentsforintroverts.com";
const READ_TOKEN = "test-read-token";

interface TestHarness {
  app: HubApp;
  store: MemoryEventStore;
}

function harness(subscribe: Partial<SubscribeOptions> = {}): TestHarness {
  const store = new MemoryEventStore();
  return {
    store,
    app: createHubApp({
      store,
      readToken: READ_TOKEN,
      resolveSecret: async () => null,
      now: () => NOW_MS,
      subscribe: {
        allowedOrigins: [SITE_ORIGIN],
        ipHashSalt: "test-salt",
        ...subscribe,
      },
    }),
  };
}

function subscribeRequest(
  body: unknown,
  options: { origin?: string; ip?: string; contentType?: string | null } = {},
): Request {
  const headers = new Headers();
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  if (options.origin) headers.set("origin", options.origin);
  headers.set("cf-connecting-ip", options.ip ?? "203.0.113.10");
  return new Request(`${BASE_URL}/v1/subscribe`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function responseJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

test("POST /v1/subscribe stores a normalised address without any signature", async () => {
  const { app, store } = harness();
  const response = await app.fetch(subscribeRequest(
    { email: "  Reader@Example.Test  " },
    { origin: SITE_ORIGIN },
  ));

  assert.equal(response.status, 202);
  assert.deepEqual(await responseJson(response), { subscribed: true });
  assert.equal(response.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  assert.equal(response.headers.get("vary"), "origin");

  const subscribers = store.listSubscribers();
  assert.equal(subscribers.length, 1);
  assert.equal(subscribers[0]?.email, "reader@example.test");
  assert.equal(subscribers[0]?.source, "site");
  assert.equal(subscribers[0]?.unsubscribed_at, null);
  assert.equal(subscribers[0]?.created_at, new Date(NOW_MS).toISOString());
  assert.ok(subscribers[0]?.ip_hash && subscribers[0].ip_hash !== "203.0.113.10");
});

test("POST /v1/subscribe rejects a malformed address and stores nothing", async () => {
  const { app, store } = harness({ rateLimit: { maxRequests: 50, windowSeconds: 3_600 } });
  for (const email of [
    "not-an-email",
    "missing@domain",
    "@example.test",
    "spaced out@example.test",
    "double@@example.test",
    "trailing@example.test.",
    "",
    42,
    undefined,
  ]) {
    const response = await app.fetch(subscribeRequest({ email }, { origin: SITE_ORIGIN }));
    assert.equal(response.status, 422, `expected 422 for ${JSON.stringify(email)}`);
    assert.equal(
      (await responseJson<{ error: { code: string } }>(response)).error.code,
      "invalid_email",
    );
  }
  assert.equal(store.listSubscribers().length, 0);
});

test("POST /v1/subscribe is idempotent and never reveals an existing address", async () => {
  const { app, store } = harness();
  const first = await app.fetch(subscribeRequest(
    { email: "twice@example.test" },
    { origin: SITE_ORIGIN },
  ));
  const second = await app.fetch(subscribeRequest(
    { email: "TWICE@example.test" },
    { origin: SITE_ORIGIN },
  ));

  assert.equal(first.status, second.status);
  assert.deepEqual(await responseJson(first), await responseJson(second));
  assert.equal(second.status, 202);
  assert.equal(store.listSubscribers().length, 1);
});

test("POST /v1/subscribe enforces a bounded body", async () => {
  const { app, store } = harness({ maxBodyBytes: 64 });
  const response = await app.fetch(subscribeRequest(
    { email: "reader@example.test", padding: "x".repeat(512) },
    { origin: SITE_ORIGIN },
  ));
  assert.equal(response.status, 413);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(response)).error.code,
    "payload_too_large",
  );
  assert.equal(store.listSubscribers().length, 0);
});

test("POST /v1/subscribe refuses an origin outside the allowlist", async () => {
  const { app, store } = harness();
  const response = await app.fetch(subscribeRequest(
    { email: "reader@example.test" },
    { origin: "https://evil.example.test" },
  ));
  assert.equal(response.status, 403);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(response)).error.code,
    "origin_not_allowed",
  );
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(store.listSubscribers().length, 0);
});

test("OPTIONS /v1/subscribe answers the preflight only for allowed origins", async () => {
  const { app } = harness();
  const allowed = await app.fetch(new Request(`${BASE_URL}/v1/subscribe`, {
    method: "OPTIONS",
    headers: {
      origin: SITE_ORIGIN,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), SITE_ORIGIN);
  assert.equal(allowed.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(allowed.headers.get("access-control-allow-headers"), "content-type");
  assert.equal(allowed.headers.get("vary"), "origin");

  const refused = await app.fetch(new Request(`${BASE_URL}/v1/subscribe`, {
    method: "OPTIONS",
    headers: { origin: "https://evil.example.test", "access-control-request-method": "POST" },
  }));
  assert.equal(refused.status, 403);
  assert.equal(refused.headers.get("access-control-allow-origin"), null);
});

test("POST /v1/subscribe rate limits per client IP", async () => {
  const { app, store } = harness({ rateLimit: { maxRequests: 2, windowSeconds: 3_600 } });
  const attempt = (email: string, ip: string) => app.fetch(subscribeRequest(
    { email },
    { origin: SITE_ORIGIN, ip },
  ));

  assert.equal((await attempt("one@example.test", "203.0.113.10")).status, 202);
  assert.equal((await attempt("two@example.test", "203.0.113.10")).status, 202);

  const limited = await attempt("three@example.test", "203.0.113.10");
  assert.equal(limited.status, 429);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(limited)).error.code,
    "rate_limited",
  );
  assert.equal(limited.headers.get("retry-after"), "3600");
  assert.equal(limited.headers.get("access-control-allow-origin"), SITE_ORIGIN);

  // A different client is unaffected.
  assert.equal((await attempt("four@example.test", "198.51.100.7")).status, 202);
  assert.deepEqual(
    store.listSubscribers().map((row) => row.email).sort(),
    ["four@example.test", "one@example.test", "two@example.test"],
  );
});

test("/v1/subscribe requires JSON and rejects other methods", async () => {
  const { app } = harness();
  const wrongType = await app.fetch(subscribeRequest(
    { email: "reader@example.test" },
    { origin: SITE_ORIGIN, contentType: "text/plain" },
  ));
  assert.equal(wrongType.status, 415);

  const wrongMethod = await app.fetch(new Request(`${BASE_URL}/v1/subscribe`, {
    method: "GET",
    headers: { origin: SITE_ORIGIN },
  }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST, OPTIONS");
});

test("POST /v1/subscribe accepts a bounded source label and defaults it", async () => {
  const { app, store } = harness();
  assert.equal((await app.fetch(subscribeRequest(
    { email: "labelled@example.test", source: "act-four" },
    { origin: SITE_ORIGIN },
  ))).status, 202);

  const rejected = await app.fetch(subscribeRequest(
    { email: "bad-label@example.test", source: "not a valid label!" },
    { origin: SITE_ORIGIN },
  ));
  assert.equal(rejected.status, 422);
  assert.equal(
    (await responseJson<{ error: { code: string } }>(rejected)).error.code,
    "invalid_source",
  );

  const stored = store.listSubscribers();
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.source, "act-four");
});

test("POST /v1/subscribe works without an Origin header for non-browser clients", async () => {
  const { app, store } = harness();
  const response = await app.fetch(subscribeRequest({ email: "curl@example.test" }));
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(store.listSubscribers().length, 1);
});
