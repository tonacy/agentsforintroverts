export const AFI_EVENT_SCHEMA = "afi.event.v1" as const;

export const knownEventKinds = [
  "run.started",
  "run.progress",
  "source.observed",
  "feed.item.published",
  "feed.item.updated",
  "feed.item.withdrawn",
  "action.proposed",
  "feedback.recorded",
  "run.partial",
  "run.completed",
  "run.failed",
] as const;

export type KnownEventKind = (typeof knownEventKinds)[number];

export const feedKinds = ["needs_you", "handled", "digest", "watching"] as const;
export type FeedKind = (typeof feedKinds)[number];

export interface EventProducer {
  connection_id: string;
  provider: string;
  external_agent_id?: string;
}

export interface EventRun {
  external_id: string;
  agent_key: string;
  trigger?: string;
}

export interface SourceRefInput {
  source_item_id: string;
  external_id: string;
  kind: string;
  url?: string;
  title?: string;
  author?: string;
  captured_at: string;
  content_hash: string;
  excerpt?: string;
  metadata?: Record<string, unknown>;
}

export interface FeedClaimInput {
  claim_id: string;
  kind: string;
  text: string;
  source_refs: SourceReference[];
  confidence?: number;
}

export interface SourceReference {
  source_item_id: string;
  locator?: string;
  excerpt?: string;
  observed_at?: string;
}

export interface AfiEventV1 {
  schema: typeof AFI_EVENT_SCHEMA;
  event_id: string;
  idempotency_key: string;
  occurred_at: string;
  producer: EventProducer;
  run: EventRun;
  sequence: number;
  /** Open protocol string. Unknown kinds are retained but not projected. */
  kind: string;
  data: Record<string, unknown>;
  sources: SourceRefInput[];
}

export type StoredSourceRef = SourceRefInput;

export interface StoredEvent extends Omit<AfiEventV1, "sources"> {
  canonical_event_id: string;
  canonical_run_id: string;
  canonical_feed_id?: string;
  received_at: string;
  sources: StoredSourceRef[];
}

export interface AppendDuplicate {
  outcome: "duplicate";
  record: StoredEvent;
}

export interface AppendInserted {
  outcome: "inserted";
  record: StoredEvent;
}

export interface AppendConflict {
  outcome: "conflict";
  record: StoredEvent;
}

export type AppendResult = AppendDuplicate | AppendInserted | AppendConflict;

export interface EventStore {
  readonly kind: string;
  claimNonce(keyId: string, nonce: string, expiresAtMs: number, nowMs: number): Promise<boolean>;
  append(event: StoredEvent): Promise<AppendResult>;
  listEvents(): Promise<StoredEvent[]>;
  listRunEvents(runId: string): Promise<StoredEvent[]>;
}

export type RunStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "partial"
  | "completed"
  | "failed";

export interface FeedClaim {
  claim_id: string;
  kind: string;
  text: string;
  source_refs: SourceReference[];
  confidence?: number;
}

export interface FeedItem {
  schema: "afi.feed_item.v1";
  feed_item_id: string;
  user_id: string;
  run_id: string;
  agent_id: string;
  revision: number;
  title: string;
  summary: string;
  lane: FeedKind;
  why_it_matters: string;
  confidence?: number;
  claims: FeedClaim[];
  sources: SourceReference[];
  status: "unread" | "saved" | "dismissed" | "handled";
  created_at: string;

  // Hub projection metadata. Canonical FeedItem consumers can ignore these.
  event_id: string;
  occurred_at: string;
  provider: string;
  connection_id: string;
  source_items: StoredSourceRef[];
}

export interface SourceItem extends StoredSourceRef {
  provider: string;
  connection_id: string;
  first_seen_at: string;
  last_seen_at: string;
  run_ids: string[];
  event_ids: string[];
  feed_ids: string[];
}

export interface RunProjection {
  run_id: string;
  external_id: string;
  provider: string;
  connection_id: string;
  agent_key: string;
  trigger?: string;
  status: RunStatus;
  started_at: string;
  updated_at: string;
  event_count: number;
  feed_item_count: number;
  events: StoredEvent[];
}

export interface AcceptedEventResponse {
  accepted: true;
  schema: typeof AFI_EVENT_SCHEMA;
  event_id: string;
  run_id: string;
  feed_id?: string;
  duplicate: boolean;
  accepted_at: string;
}
