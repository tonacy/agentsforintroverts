export const PROTOCOL_VERSION = "v1" as const;

export const AGENT_DEFINITION_SCHEMA = "afi.agent_definition.v1" as const;
export const PROVIDER_CONNECTION_SCHEMA = "afi.provider_connection.v1" as const;
export const RUN_SCHEMA = "afi.run.v1" as const;
export const EVENT_SCHEMA = "afi.event.v1" as const;
export const SOURCE_ITEM_SCHEMA = "afi.source_item.v1" as const;
export const FEED_ITEM_SCHEMA = "afi.feed_item.v1" as const;
export const ACTION_PROPOSAL_SCHEMA = "afi.action_proposal.v1" as const;
export const APPROVAL_DECISION_SCHEMA = "afi.approval_decision.v1" as const;
export const EXECUTION_RECEIPT_SCHEMA = "afi.execution_receipt.v1" as const;

export const KNOWN_EVENT_KINDS = {
  runStarted: "run.started",
  runCompleted: "run.completed",
  runPartial: "run.partial",
  runFailed: "run.failed",
  feedItemPublished: "feed.item.published",
  feedItemUpdated: "feed.item.updated",
  feedItemWithdrawn: "feed.item.withdrawn",
  actionProposed: "action.proposed",
  actionApprovalDecided: "action.approval_decided",
  actionExecutionReceiptRecorded: "action.execution_receipt.recorded",
  feedbackRecorded: "feedback.recorded",
} as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type IsoTimestamp = string;

export type ActorType = "user" | "agent" | "provider" | "system" | "service";

export interface ActorRef {
  actor_id: string;
  actor_type: ActorType;
  display_name?: string;
}

export interface EventProducer {
  connection_id: string;
  provider: string;
  external_agent_id?: string;
}

/** @deprecated Use EventProducer. Retained as a source-compatible type alias. */
export type ProducerRef = EventProducer;

export interface SourceReference {
  source_item_id: string;
  locator?: string;
  excerpt?: string;
  observed_at?: IsoTimestamp;
}

/**
 * Rich source input carried at the ingestion boundary. Canonical entities cite
 * it through SourceReference.source_item_id rather than embedding it again.
 */
export interface EmbeddedSourceInput {
  source_item_id: string;
  external_id: string;
  kind: string;
  url?: string;
  title?: string;
  captured_at: IsoTimestamp;
  content_hash: string;
  excerpt?: string;
  metadata?: JsonObject;
}

export interface AgentDefinition {
  schema: typeof AGENT_DEFINITION_SCHEMA;
  agent_id: string;
  slug: string;
  version: number;
  name: string;
  purpose: string;
  system_prompt: string;
  capabilities: string[];
  source_kinds: string[];
  action_kinds: string[];
  enabled: boolean;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export type ProviderConnectionStatus = "connected" | "disabled" | "error";

export interface ProviderConnection {
  schema: typeof PROVIDER_CONNECTION_SCHEMA;
  connection_id: string;
  user_id: string;
  provider: string;
  adapter: string;
  account_ref: string;
  model?: string;
  capabilities: string[];
  status: ProviderConnectionStatus;
  metadata: JsonObject;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
}

export type RunStatus = "queued" | "running" | "completed" | "partial" | "failed";

export interface RunCompletedData {
  status: "completed";
  summary: string;
  output_ids: string[];
}

export interface RunPartialData {
  status: "partial";
  summary: string;
  completed_steps: string[];
  remaining_steps: string[];
  checkpoint: JsonObject;
}

export interface RunFailedData {
  status: "failed";
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  checkpoint?: JsonObject;
}

export type RunCompletion = RunCompletedData | RunPartialData | RunFailedData;

export interface Run {
  schema: typeof RUN_SCHEMA;
  run_id: string;
  user_id: string;
  agent_id: string;
  agent_version: number;
  provider_connection_id: string;
  goal: string;
  input_source_item_ids: string[];
  status: RunStatus;
  requested_at: IsoTimestamp;
  started_at?: IsoTimestamp;
  ended_at?: IsoTimestamp;
  last_sequence: number;
  completion?: RunCompletion;
}

export interface EventRunRef {
  external_id: string;
  agent_key: string;
  trigger?: string;
}

/** @deprecated Use EventRunRef. Retained as a source-compatible type alias. */
export type RunRef = EventRunRef;

export interface EventEnvelope<TData = JsonObject> {
  schema: typeof EVENT_SCHEMA;
  event_id: string;
  idempotency_key: string;
  occurred_at: IsoTimestamp;
  producer: EventProducer;
  run: EventRunRef;
  sequence: number;
  /** Open string. Consumers must ignore unknown kinds they do not project. */
  kind: string;
  data: TData;
  sources: EmbeddedSourceInput[];
}

export type RunEvent = EventEnvelope<
  JsonObject | RunCompletedData | RunPartialData | RunFailedData
>;

export interface SourceItem {
  schema: typeof SOURCE_ITEM_SCHEMA;
  source_item_id: string;
  user_id: string;
  provider_connection_id: string;
  provider: string;
  source_kind: string;
  external_id: string;
  thread_id?: string;
  title?: string;
  content: string;
  url?: string;
  occurred_at: IsoTimestamp;
  captured_at: IsoTimestamp;
  metadata: JsonObject;
}

export interface Claim {
  claim_id: string;
  kind: string;
  text: string;
  source_refs: SourceReference[];
  confidence?: number;
}

export type FeedItemStatus = "unread" | "saved" | "dismissed" | "handled";
export type FeedItemLane = "needs_you" | "handled" | "watching" | "digest";

export interface FeedItem {
  schema: typeof FEED_ITEM_SCHEMA;
  feed_item_id: string;
  user_id: string;
  run_id: string;
  agent_id: string;
  revision: number;
  title: string;
  summary: string;
  lane: FeedItemLane;
  why_it_matters: string;
  confidence?: number;
  claims: Claim[];
  sources: SourceReference[];
  status: FeedItemStatus;
  created_at: IsoTimestamp;
}

export interface ActionProposal {
  schema: typeof ACTION_PROPOSAL_SCHEMA;
  action_id: string;
  revision: number;
  user_id: string;
  run_id: string;
  agent_id: string;
  provider_connection_id: string;
  action_kind: string;
  rationale: string;
  payload: JsonObject;
  payload_hash: string;
  proposed_by: ActorRef;
  proposed_at: IsoTimestamp;
  expires_at?: IsoTimestamp;
  sources: SourceReference[];
  status: "proposed";
}

export interface ApprovalDecision {
  schema: typeof APPROVAL_DECISION_SCHEMA;
  decision_id: string;
  action_id: string;
  action_revision: number;
  payload_hash: string;
  decision: "approved" | "rejected";
  decided_by: ActorRef;
  decided_at: IsoTimestamp;
  valid_until?: IsoTimestamp;
  reason?: string;
}

export type ExecutionProofStatus =
  | "provider_acknowledged"
  | "delivered"
  | "read"
  | "failed";

export interface ExecutionReceipt {
  schema: typeof EXECUTION_RECEIPT_SCHEMA;
  receipt_id: string;
  action_id: string;
  action_revision: number;
  payload_hash: string;
  provider_connection_id: string;
  status: ExecutionProofStatus;
  occurred_at: IsoTimestamp;
  evidence: {
    source: string;
    external_id: string;
    detail?: JsonObject;
  };
}

export interface RunStartedData {
  status: "running";
}

export interface FeedItemPublishedData {
  feed_item: FeedItem;
}

export interface FeedItemUpdatedData {
  feed_item: FeedItem;
  previous_revision: number;
}

export interface FeedItemWithdrawnData {
  feed_item_id: string;
  feed_item_revision: number;
  reason: string;
  withdrawn_by: ActorRef;
}

export interface ActionProposedData {
  proposal: ActionProposal;
}

export interface ActionApprovalDecidedData {
  decision: ApprovalDecision;
}

export interface ActionExecutionReceiptRecordedData {
  receipt: ExecutionReceipt;
}

export interface FeedbackRecordedData {
  feedback_id: string;
  feed_item_id: string;
  feedback_kind: string;
  value: JsonValue;
  recorded_by: ActorRef;
}

export type KnownEventData =
  | RunStartedData
  | RunCompletedData
  | RunPartialData
  | RunFailedData
  | FeedItemPublishedData
  | FeedItemUpdatedData
  | FeedItemWithdrawnData
  | ActionProposedData
  | ActionApprovalDecidedData
  | ActionExecutionReceiptRecordedData
  | FeedbackRecordedData;

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };
