import { describe, it, expect, vi, afterEach } from "vitest";
import { looksLikeEmail, submitSubscription, subscribeMessages, subscribeEndpoint } from "./subscribe";

function respond(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("looksLikeEmail", () => {
  it("accepts an ordinary address and rejects obvious typos", () => {
    expect(looksLikeEmail("tony@quiet.dev")).toBe(true);
    expect(looksLikeEmail("not-an-email")).toBe(false);
    expect(looksLikeEmail("a@b")).toBe(false);
    expect(looksLikeEmail("with space@x.io")).toBe(false);
  });
});

describe("submitSubscription", () => {
  it("posts JSON to the subscribe endpoint with the site as source", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(202, { subscribed: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitSubscription("Tony@Quiet.dev");
    expect(result).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(subscribeEndpoint);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "Tony@Quiet.dev", source: "site" });
  });

  it("reports an unreachable hub when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await submitSubscription("tony@quiet.dev")).toEqual({
      ok: false,
      message: subscribeMessages.unreachable,
    });
  });

  it("maps 429 to the rate-limit message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(429, { error: { code: "rate_limited" } })));
    expect(await submitSubscription("tony@quiet.dev")).toEqual({
      ok: false,
      message: subscribeMessages.rateLimited,
    });
  });

  it("maps a 422 invalid_email to the invalid message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(422, { error: { code: "invalid_email" } })));
    expect(await submitSubscription("tony@quiet.dev")).toEqual({
      ok: false,
      message: subscribeMessages.invalid,
    });
  });

  it("blames the server, not the address, for anything else", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(500)));
    expect(await submitSubscription("tony@quiet.dev")).toEqual({
      ok: false,
      message: subscribeMessages.server,
    });
  });
});
