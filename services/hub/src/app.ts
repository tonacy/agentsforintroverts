import { errorBody, HttpError } from "./errors.js";
import { projectFeedItems, projectRun, projectSources } from "./projector.js";
import {
  assertTimestampInWindow,
  readSignatureHeaders,
  verifyBearerToken,
  verifyHmacSignature,
} from "./security.js";
import type {
  AcceptedEventResponse,
  EventStore,
  FeedItem,
  SourceItem,
  StoredEvent,
} from "./types.js";
import { AFI_EVENT_SCHEMA } from "./types.js";
import { parseAfiEvent, parseJsonBody } from "./validation.js";

export type SecretResolver = (keyId: string) => Promise<string | null>;

export interface HubAppOptions {
  store: EventStore;
  resolveSecret: SecretResolver;
  readToken: string;
  replayWindowSeconds?: number;
  maxBodyBytes?: number;
  now?: () => number;
}

export interface HubApp {
  fetch(request: Request): Promise<Response>;
}

const DEFAULT_REPLAY_WINDOW_SECONDS = 300;
const DEFAULT_MAX_BODY_BYTES = 256 * 1_024;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(body), { status, headers });
}

function methodNotAllowed(allowed: string[]): Response {
  return jsonResponse(
    { error: { code: "method_not_allowed", message: "Method not allowed." } },
    405,
    { allow: allowed.join(", ") },
  );
}

async function readBoundedBody(request: Request, maxBodyBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new HttpError(400, "invalid_content_length", "Content-Length is invalid.");
    }
    if (parsedLength > maxBodyBytes) {
      throw new HttpError(413, "payload_too_large", `Request bodies are limited to ${maxBodyBytes} bytes.`);
    }
  }

  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBodyBytes) {
        await reader.cancel("payload limit exceeded");
        throw new HttpError(413, "payload_too_large", `Request bodies are limited to ${maxBodyBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function parseLimit(url: URL): number {
  const value = url.searchParams.get("limit");
  if (value === null) return DEFAULT_PAGE_SIZE;
  if (!/^\d+$/.test(value)) {
    throw new HttpError(400, "invalid_filter", "limit must be a positive integer.");
  }
  const limit = Number(value);
  if (limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new HttpError(400, "invalid_filter", `limit must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  return limit;
}

function parseDateFilter(url: URL, primary: string, alias: string): number | undefined {
  const value = url.searchParams.get(primary) ?? url.searchParams.get(alias);
  if (value === null) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new HttpError(400, "invalid_filter", `${primary} must be an RFC 3339 timestamp.`);
  }
  return timestamp;
}

function filterFeed(items: FeedItem[], url: URL): FeedItem[] {
  const agentKey = url.searchParams.get("agent_key");
  const kind = url.searchParams.get("kind") ?? url.searchParams.get("lane");
  const provider = url.searchParams.get("provider");
  const runId = url.searchParams.get("run_id");
  const status = url.searchParams.get("status");
  const query = url.searchParams.get("q")?.trim().toLocaleLowerCase();
  const since = parseDateFilter(url, "since", "after");
  const until = parseDateFilter(url, "until", "before");
  const limit = parseLimit(url);

  return items
    .filter((item) => !agentKey || item.agent_id === agentKey)
    .filter((item) => !kind || item.lane === kind)
    .filter((item) => !provider || item.provider === provider)
    .filter((item) => !runId || item.run_id === runId)
    .filter((item) => !status || item.status === status)
    .filter((item) => !query || [item.title, item.summary, item.why_it_matters]
      .some((value) => value.toLocaleLowerCase().includes(query)))
    .filter((item) => since === undefined || Date.parse(item.occurred_at) >= since)
    .filter((item) => until === undefined || Date.parse(item.occurred_at) <= until)
    .slice(0, limit);
}

function filterSources(items: SourceItem[], url: URL): SourceItem[] {
  const kind = url.searchParams.get("kind");
  const provider = url.searchParams.get("provider");
  const runId = url.searchParams.get("run_id");
  const query = url.searchParams.get("q")?.trim().toLocaleLowerCase();
  const limit = parseLimit(url);
  return items
    .filter((item) => !kind || item.kind === kind)
    .filter((item) => !provider || item.provider === provider)
    .filter((item) => !runId || item.run_ids.includes(runId))
    .filter((item) => !query || [item.title, item.author, item.excerpt, item.external_id]
      .some((value) => value?.toLocaleLowerCase().includes(query)))
    .slice(0, limit);
}

async function normalizeEvent(
  rawEvent: Awaited<ReturnType<typeof parseAfiEvent>>,
  receivedAt: string,
): Promise<StoredEvent> {
  const canonicalEventId = rawEvent.event_id;
  const canonicalRunId = rawEvent.run.external_id;
  let canonicalFeedId: string | undefined;
  if (rawEvent.kind === "feed.item.published" || rawEvent.kind === "feed.item.updated") {
    canonicalFeedId = (rawEvent.data.feed_item as Record<string, unknown>).feed_item_id as string;
  } else if (rawEvent.kind === "feed.item.withdrawn") {
    canonicalFeedId = rawEvent.data.feed_item_id as string;
  }

  return {
    ...rawEvent,
    canonical_event_id: canonicalEventId,
    canonical_run_id: canonicalRunId,
    canonical_feed_id: canonicalFeedId,
    received_at: receivedAt,
    sources: rawEvent.sources,
  };
}

async function requireReadAccess(request: Request, token: string): Promise<void> {
  if (!token) {
    throw new HttpError(500, "read_auth_unconfigured", "Read authentication is not configured.");
  }
  await verifyBearerToken(request, token);
}

export function createHubApp(options: HubAppOptions): HubApp {
  const replayWindowSeconds = options.replayWindowSeconds ?? DEFAULT_REPLAY_WINDOW_SECONDS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const now = options.now ?? Date.now;

  async function ingest(request: Request): Promise<Response> {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json.");
    }

    const signatureHeaders = readSignatureHeaders(request);
    const nowMs = now();
    assertTimestampInWindow(signatureHeaders.timestamp, { nowMs, replayWindowSeconds });
    const secret = await options.resolveSecret(signatureHeaders.keyId);
    if (!secret) {
      throw new HttpError(401, "unknown_key", "The ingest key is not recognized.");
    }

    const rawBody = await readBoundedBody(request, maxBodyBytes);
    if (!(await verifyHmacSignature(secret, signatureHeaders, rawBody))) {
      throw new HttpError(401, "invalid_signature", "The ingest signature is invalid.");
    }

    const nonceAccepted = await options.store.claimNonce(
      signatureHeaders.keyId,
      signatureHeaders.nonce,
      nowMs + replayWindowSeconds * 1_000,
      nowMs,
    );
    if (!nonceAccepted) {
      throw new HttpError(409, "nonce_replay", "The ingest nonce has already been used.");
    }

    const event = await parseAfiEvent(parseJsonBody(rawBody));
    if (event.producer.connection_id !== signatureHeaders.keyId) {
      throw new HttpError(
        403,
        "connection_mismatch",
        "The signed key identifier must match producer.connection_id.",
      );
    }

    const storedEvent = await normalizeEvent(event, new Date(nowMs).toISOString());
    const result = await options.store.append(storedEvent);
    if (result.outcome === "conflict") {
      throw new HttpError(
        409,
        "idempotency_conflict",
        "The idempotency key was already used for a different event.",
        { existing_event_id: result.record.canonical_event_id },
      );
    }

    const response: AcceptedEventResponse = {
      accepted: true,
      schema: AFI_EVENT_SCHEMA,
      event_id: result.record.canonical_event_id,
      run_id: result.record.canonical_run_id,
      feed_id: result.record.canonical_feed_id,
      duplicate: result.outcome === "duplicate",
      accepted_at: result.record.received_at,
    };
    return jsonResponse(response, 202);
  }

  async function listFeed(request: Request, url: URL): Promise<Response> {
    await requireReadAccess(request, options.readToken);
    const allItems = projectFeedItems(await options.store.listEvents());
    const items = filterFeed(allItems, url);
    return jsonResponse({ items, count: items.length });
  }

  async function getFeedItem(request: Request, feedId: string): Promise<Response> {
    await requireReadAccess(request, options.readToken);
    const item = projectFeedItems(await options.store.listEvents())
      .find((candidate) => candidate.feed_item_id === feedId);
    if (!item) throw new HttpError(404, "feed_item_not_found", "Feed item not found.");
    return jsonResponse({ item });
  }

  async function getRun(request: Request, runId: string): Promise<Response> {
    await requireReadAccess(request, options.readToken);
    const run = projectRun(await options.store.listRunEvents(runId));
    if (!run) throw new HttpError(404, "run_not_found", "Run not found.");
    return jsonResponse({ run });
  }

  async function listSources(request: Request, url: URL): Promise<Response> {
    await requireReadAccess(request, options.readToken);
    const items = filterSources(projectSources(await options.store.listEvents()), url);
    return jsonResponse({ items, count: items.length });
  }

  async function getSource(request: Request, sourceId: string): Promise<Response> {
    await requireReadAccess(request, options.readToken);
    const item = projectSources(await options.store.listEvents())
      .find((candidate) => candidate.source_item_id === sourceId);
    if (!item) throw new HttpError(404, "source_not_found", "Source not found.");
    return jsonResponse({ item });
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      try {
        if (url.pathname === "/health") {
          if (request.method !== "GET") return methodNotAllowed(["GET"]);
          return jsonResponse({
            status: "ok",
            schema: AFI_EVENT_SCHEMA,
            storage: options.store.kind,
          });
        }

        if (url.pathname === "/v1/events") {
          if (request.method !== "POST") return methodNotAllowed(["POST"]);
          return await ingest(request);
        }

        if (url.pathname === "/v1/feed") {
          if (request.method !== "GET") return methodNotAllowed(["GET"]);
          return await listFeed(request, url);
        }
        if (url.pathname.startsWith("/v1/feed/")) {
          if (request.method !== "GET") return methodNotAllowed(["GET"]);
          return await getFeedItem(request, decodeURIComponent(url.pathname.slice("/v1/feed/".length)));
        }

        if (url.pathname === "/v1/sources") {
          if (request.method !== "GET") return methodNotAllowed(["GET"]);
          return await listSources(request, url);
        }
        if (url.pathname.startsWith("/v1/sources/")) {
          if (request.method !== "GET") return methodNotAllowed(["GET"]);
          return await getSource(request, decodeURIComponent(url.pathname.slice("/v1/sources/".length)));
        }

        if (url.pathname.startsWith("/v1/runs/")) {
          if (request.method !== "GET") return methodNotAllowed(["GET"]);
          return await getRun(request, decodeURIComponent(url.pathname.slice("/v1/runs/".length)));
        }

        return jsonResponse({ error: { code: "not_found", message: "Route not found." } }, 404);
      } catch (error) {
        if (error instanceof HttpError) return jsonResponse(errorBody(error), error.status);
        console.error(JSON.stringify({
          message: "Unhandled hub request error",
          method: request.method,
          path: url.pathname,
          error: error instanceof Error ? error.message : "Unknown error",
        }));
        return jsonResponse(
          { error: { code: "internal_error", message: "The hub could not process this request." } },
          500,
        );
      }
    },
  };
}
