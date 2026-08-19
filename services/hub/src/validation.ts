import { canonicalJson, hashActionPayload } from "./canonical.js";
import { HttpError } from "./errors.js";
import {
  AFI_EVENT_SCHEMA,
  feedKinds,
  type AfiEventV1,
  type FeedClaimInput,
  type FeedKind,
  type SourceReference,
  type SourceRefInput,
} from "./types.js";

const feedKindSet = new Set<string>(feedKinds);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const forbiddenAuthorityKinds = new Set([
  "approval.requested",
  "approval.decided",
  "action.approved",
  "action.rejected",
  "action.executed",
  "action.delivered",
  "execution.recorded",
  "action.approval_decided",
  "action.execution_receipt.recorded",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new HttpError(422, "invalid_event", `${field} must be an object.`);
  }
  return value;
}

function requireString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): string {
  const min = options.min ?? 1;
  const max = options.max ?? 512;
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw new HttpError(422, "invalid_event", `${field} must be a string between ${min} and ${max} characters.`);
  }
  return value;
}

function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, field, { max });
}

function optionalHttpUrl(value: unknown, field: string): string | undefined {
  const text = optionalString(value, field, 2_048);
  if (text === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new HttpError(422, "invalid_event", `${field} must be an absolute HTTP(S) URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(422, "invalid_event", `${field} must be an absolute HTTP(S) URL.`);
  }
  return text;
}

function requireTimestamp(value: unknown, field: string): string {
  const timestamp = requireString(value, field, { max: 64 });
  if (!ISO_TIMESTAMP.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    throw new HttpError(422, "invalid_event", `${field} must be an RFC 3339 timestamp.`);
  }
  return timestamp;
}

function optionalTimestamp(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requireTimestamp(value, field);
}

function requireInteger(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new HttpError(422, "invalid_event", `${field} must be an integer greater than or equal to ${minimum}.`);
  }
  return value as number;
}

function optionalConfidence(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new HttpError(422, "invalid_event", `${field} must be between 0 and 1.`);
  }
  return value;
}

function parseSource(source: unknown, index: number): SourceRefInput {
  const path = `sources[${index}]`;
  const record = requireRecord(source, path);
  const metadata = record.metadata === undefined
    ? undefined
    : requireRecord(record.metadata, `${path}.metadata`);

  return {
    source_item_id: requireString(record.source_item_id, `${path}.source_item_id`, { max: 256 }),
    external_id: requireString(record.external_id, `${path}.external_id`, { max: 256 }),
    kind: requireString(record.kind, `${path}.kind`, { max: 64 }),
    url: optionalHttpUrl(record.url, `${path}.url`),
    title: optionalString(record.title, `${path}.title`, 512),
    author: optionalString(record.author, `${path}.author`, 256),
    captured_at: requireTimestamp(record.captured_at, `${path}.captured_at`),
    content_hash: requireString(record.content_hash, `${path}.content_hash`, { max: 256 }),
    excerpt: optionalString(record.excerpt, `${path}.excerpt`, 4_000),
    metadata,
  };
}

function parseSourceReference(value: unknown, path: string, sourceIds: Set<string>): SourceReference {
  const record = requireRecord(value, path);
  const sourceItemId = requireString(record.source_item_id, `${path}.source_item_id`, { max: 256 });
  if (!sourceIds.has(sourceItemId)) {
    throw new HttpError(422, "unknown_source_ref", "A claim references a source absent from the event.", {
      missing_source_refs: [sourceItemId],
    });
  }
  return {
    source_item_id: sourceItemId,
    locator: optionalString(record.locator, `${path}.locator`, 2_048),
    excerpt: optionalString(record.excerpt, `${path}.excerpt`, 4_000),
    observed_at: optionalTimestamp(record.observed_at, `${path}.observed_at`),
  };
}

function parseSourceReferences(
  value: unknown,
  path: string,
  sourceIds: Set<string>,
  minimum: number,
): SourceReference[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > 100) {
    throw new HttpError(
      422,
      "provenance_required",
      `${path} must contain at least ${minimum} source reference(s).`,
    );
  }
  const references = value.map((entry, index) =>
    parseSourceReference(entry, `${path}[${index}]`, sourceIds),
  );
  if (new Set(references.map((reference) => reference.source_item_id)).size !== references.length) {
    throw new HttpError(422, "duplicate_source_ref", `${path} contains duplicate source_item_id values.`);
  }
  return references;
}

function parseFeedClaims(value: unknown, sourceIds: Set<string>, path: string): FeedClaimInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new HttpError(422, "provenance_required", `${path} must contain sourced claims.`);
  }

  const claims = value.map((claim, index) => {
    const claimPath = `${path}[${index}]`;
    const record = requireRecord(claim, claimPath);
    return {
      claim_id: requireString(record.claim_id, `${claimPath}.claim_id`, { max: 256 }),
      kind: requireString(record.kind, `${claimPath}.kind`, { max: 64 }),
      text: requireString(record.text, `${claimPath}.text`, { max: 4_000 }),
      source_refs: parseSourceReferences(record.source_refs, `${claimPath}.source_refs`, sourceIds, 1),
      confidence: optionalConfidence(record.confidence, `${claimPath}.confidence`),
    };
  });
  if (new Set(claims.map((claim) => claim.claim_id)).size !== claims.length) {
    throw new HttpError(422, "duplicate_claim_id", `${path} contains duplicate claim_id values.`);
  }
  return claims;
}

function parseLane(value: unknown, path: string): FeedKind {
  const lane = requireString(value, path, { max: 64 });
  if (!feedKindSet.has(lane)) {
    throw new HttpError(422, "invalid_feed_kind", `${path} is not a supported feed lane.`);
  }
  return lane as FeedKind;
}

function validateCanonicalFeedItem(
  value: unknown,
  sourceIds: Set<string>,
  path: string,
): SourceReference[] {
  const item = requireRecord(value, path);
  if (item.schema !== "afi.feed_item.v1") {
    throw new HttpError(422, "invalid_event", `${path}.schema must be afi.feed_item.v1.`);
  }
  const requiredString = (key: string, max: number): void => {
    requireString(item[key], `${path}.${key}`, { max });
  };
  requiredString("feed_item_id", 256);
  requiredString("user_id", 256);
  requiredString("run_id", 256);
  requiredString("agent_id", 256);
  requiredString("title", 240);
  requiredString("summary", 4_000);
  requiredString("why_it_matters", 2_000);
  requireInteger(item.revision, `${path}.revision`, 1);
  parseLane(item.lane, `${path}.lane`);
  optionalConfidence(item.confidence, `${path}.confidence`);
  parseFeedClaims(item.claims, sourceIds, `${path}.claims`);
  const references = parseSourceReferences(item.sources, `${path}.sources`, sourceIds, 1);
  const status = requireString(item.status, `${path}.status`, { max: 32 });
  if (!["unread", "saved", "dismissed", "handled"].includes(status)) {
    throw new HttpError(422, "invalid_event", `${path}.status is not supported.`);
  }
  requireTimestamp(item.created_at, `${path}.created_at`);
  return references;
}

function assertExactSourceCoverage(
  references: SourceReference[],
  sources: SourceRefInput[],
  path: string,
): void {
  const referenced = references.map((source) => source.source_item_id).sort();
  const embedded = sources.map((source) => source.source_item_id).sort();
  if (referenced.length !== embedded.length || referenced.some((id, index) => id !== embedded[index])) {
    throw new HttpError(
      422,
      "event_source_mismatch",
      `${path} source_item_id values must exactly cover the top-level sources.`,
    );
  }
}

function validatePublishedOrUpdatedFeed(
  kind: "feed.item.published" | "feed.item.updated",
  data: Record<string, unknown>,
  sources: SourceRefInput[],
  run: { external_id: string; agent_key: string },
): void {
  if (sources.length === 0) {
    throw new HttpError(422, "provenance_required", `${kind} events require top-level source items.`);
  }
  const sourceIds = new Set(sources.map((source) => source.source_item_id));
  const item = requireRecord(data.feed_item, "data.feed_item");
  const feedItemId = requireString(item.feed_item_id, "data.feed_item.feed_item_id", { max: 256 });
  const revision = requireInteger(item.revision, "data.feed_item.revision", 1);
  const references = validateCanonicalFeedItem(data.feed_item, sourceIds, "data.feed_item");
  assertExactSourceCoverage(references, sources, "data.feed_item.sources");
  if (item.run_id !== run.external_id || item.agent_id !== run.agent_key) {
    throw new HttpError(
      422,
      "event_run_binding_mismatch",
      "Feed item run_id and agent_id must match the event run envelope.",
      { feed_item_id: feedItemId },
    );
  }
  if (kind === "feed.item.published" && revision !== 1) {
    throw new HttpError(422, "invalid_initial_revision", "Published feed items must start at revision 1.");
  }
  if (kind === "feed.item.updated") {
    const previousRevision = requireInteger(data.previous_revision, "data.previous_revision", 1);
    if (revision !== previousRevision + 1) {
      throw new HttpError(
        422,
        "invalid_feed_revision",
        "Updated feed item revision must equal previous_revision + 1.",
      );
    }
  }
}

function validateFeedWithdrawal(data: Record<string, unknown>): void {
  requireString(data.feed_item_id, "data.feed_item_id", { max: 256 });
  requireInteger(data.feed_item_revision, "data.feed_item_revision", 1);
  requireString(data.reason, "data.reason", { max: 2_000 });
  requireRecord(data.withdrawn_by, "data.withdrawn_by");
}

async function validateActionProposal(
  data: Record<string, unknown>,
  sources: SourceRefInput[],
  producer: { connection_id: string },
  run: { external_id: string; agent_key: string },
): Promise<void> {
  const proposal = requireRecord(data.proposal, "data.proposal");
  if (proposal.schema !== "afi.action_proposal.v1") {
    throw new HttpError(422, "invalid_event", "data.proposal.schema must be afi.action_proposal.v1.");
  }
  requireString(proposal.action_id, "data.proposal.action_id", { max: 256 });
  requireInteger(proposal.revision, "data.proposal.revision", 1);
  requireString(proposal.user_id, "data.proposal.user_id", { max: 256 });
  const runId = requireString(proposal.run_id, "data.proposal.run_id", { max: 256 });
  const agentId = requireString(proposal.agent_id, "data.proposal.agent_id", { max: 256 });
  const connectionId = requireString(
    proposal.provider_connection_id,
    "data.proposal.provider_connection_id",
    { max: 128 },
  );
  requireString(proposal.action_kind, "data.proposal.action_kind", { max: 128 });
  requireString(proposal.rationale, "data.proposal.rationale", { max: 4_000 });
  const payloadHash = requireString(proposal.payload_hash, "data.proposal.payload_hash", { max: 71 });
  if (!/^sha256:[a-f0-9]{64}$/.test(payloadHash)) {
    throw new HttpError(
      422,
      "invalid_payload_hash",
      "data.proposal.payload_hash must be sha256: followed by 64 lowercase hex characters.",
    );
  }
  const payload = requireRecord(proposal.payload, "data.proposal.payload");
  let expectedPayloadHash: string;
  try {
    expectedPayloadHash = await hashActionPayload(payload);
  } catch (error) {
    throw new HttpError(
      422,
      "invalid_action_payload",
      error instanceof Error ? error.message : "data.proposal.payload must contain JSON values.",
    );
  }
  if (payloadHash !== expectedPayloadHash) {
    throw new HttpError(
      422,
      "payload_hash_mismatch",
      "data.proposal.payload_hash must bind the exact canonical payload bytes.",
    );
  }
  const actor = requireRecord(proposal.proposed_by, "data.proposal.proposed_by");
  const actorType = requireString(actor.actor_type, "data.proposal.proposed_by.actor_type", { max: 32 });
  const actorId = requireString(actor.actor_id, "data.proposal.proposed_by.actor_id", { max: 256 });
  optionalString(actor.display_name, "data.proposal.proposed_by.display_name", 256);
  if (actorType !== "agent" || actorId !== run.agent_key) {
    throw new HttpError(
      403,
      "forbidden_authority",
      "Action proposals must be proposed by the same agent named by the event run.",
    );
  }
  requireTimestamp(proposal.proposed_at, "data.proposal.proposed_at");
  optionalTimestamp(proposal.expires_at, "data.proposal.expires_at");
  const references = parseSourceReferences(
    proposal.sources,
    "data.proposal.sources",
    new Set(sources.map((source) => source.source_item_id)),
    1,
  );
  assertExactSourceCoverage(references, sources, "data.proposal.sources");
  if (runId !== run.external_id || agentId !== run.agent_key) {
    throw new HttpError(
      422,
      "event_run_binding_mismatch",
      "Action proposal run_id and agent_id must match the event run envelope.",
    );
  }
  if (connectionId !== producer.connection_id) {
    throw new HttpError(
      422,
      "event_producer_binding_mismatch",
      "Action proposal provider_connection_id must match producer.connection_id.",
    );
  }
  if (proposal.status !== "proposed") {
    throw new HttpError(403, "forbidden_authority", "Providers may only submit proposed actions.");
  }
}

export async function parseAfiEvent(value: unknown): Promise<AfiEventV1> {
  const event = requireRecord(value, "event");
  try {
    canonicalJson(event);
  } catch (error) {
    throw new HttpError(
      422,
      "invalid_json_value",
      error instanceof Error ? error.message : "The event must contain only lossless JSON values.",
    );
  }
  if (event.schema !== AFI_EVENT_SCHEMA) {
    throw new HttpError(422, "unsupported_schema", `schema must be ${AFI_EVENT_SCHEMA}.`);
  }

  const rawKind = requireString(event.kind, "kind", { max: 128 });
  if (forbiddenAuthorityKinds.has(rawKind)) {
    throw new HttpError(
      403,
      "forbidden_authority",
      "Providers may propose actions but may not emit approval or execution authority.",
    );
  }
  // Event kinds are deliberately open in afi.event.v1. Unknown kinds remain
  // append-only audit records and are ignored by projectors. Only authority
  // kinds are rejected at this provider-signed boundary.
  const kind = rawKind;

  const producer = requireRecord(event.producer, "producer");
  const run = requireRecord(event.run, "run");
  const data = requireRecord(event.data, "data");
  const parsedProducer = {
    connection_id: requireString(producer.connection_id, "producer.connection_id", { max: 128 }),
    provider: requireString(producer.provider, "producer.provider", { max: 64 }),
    external_agent_id: optionalString(producer.external_agent_id, "producer.external_agent_id", 256),
  };
  const parsedRun = {
    external_id: requireString(run.external_id, "run.external_id", { max: 256 }),
    agent_key: requireString(run.agent_key, "run.agent_key", { max: 128 }),
    trigger: optionalString(run.trigger, "run.trigger", 64),
  };
  if (!Array.isArray(event.sources) || event.sources.length > 100) {
    throw new HttpError(422, "invalid_event", "sources must be an array containing at most 100 items.");
  }
  const sources = event.sources.map(parseSource);
  const sourceIds = sources.map((source) => source.source_item_id);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new HttpError(422, "duplicate_source_ref", "Source item IDs must be unique within an event.");
  }

  if (kind === "source.observed" && sources.length === 0) {
    throw new HttpError(422, "provenance_required", "source.observed events require at least one source.");
  }
  if (kind === "feed.item.published" || kind === "feed.item.updated") {
    validatePublishedOrUpdatedFeed(kind, data, sources, parsedRun);
  }
  if (kind === "feed.item.withdrawn") validateFeedWithdrawal(data);
  if (kind === "action.proposed") {
    await validateActionProposal(data, sources, parsedProducer, parsedRun);
  }

  const sequence = requireInteger(event.sequence, "sequence", 1);

  return {
    schema: AFI_EVENT_SCHEMA,
    event_id: requireString(event.event_id, "event_id", { max: 256 }),
    idempotency_key: requireString(event.idempotency_key, "idempotency_key", { max: 256 }),
    occurred_at: requireTimestamp(event.occurred_at, "occurred_at"),
    producer: parsedProducer,
    run: parsedRun,
    sequence,
    kind,
    data,
    sources,
  };
}

export function parseJsonBody(rawBody: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    throw new HttpError(400, "invalid_encoding", "The request body must be valid UTF-8.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "The request body must be valid JSON.");
  }
}
