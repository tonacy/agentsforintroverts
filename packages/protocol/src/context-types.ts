import type {
  ActorRef,
  EventProducer,
  IsoTimestamp,
  JsonObject,
  JsonValue,
} from "./types.js";

export const CONTEXT_PROTOCOL_VERSION = "v1" as const;
export const LEDGER_EVENT_SCHEMA = "afi.ledger_event.v1" as const;
export const EVIDENCE_ITEM_SCHEMA = "afi.evidence_item.v1" as const;
export const CONTEXT_STATEMENT_SCHEMA = "afi.context_statement.v1" as const;
export const CONVERSATION_SCHEMA = "afi.conversation.v1" as const;
export const DECISION_SCHEMA = "afi.decision.v1" as const;
export const THREAD_SCHEMA = "afi.thread.v1" as const;
export const SELECTION_RUN_SCHEMA = "afi.selection_run.v1" as const;
export const PLACE_SCHEMA = "afi.place.v1" as const;
export const DRAFT_SCHEMA = "afi.draft.v1" as const;
export const FEEDBACK_SIGNAL_SCHEMA = "afi.feedback_signal.v1" as const;
export const CONTEXT_PACK_SCHEMA = "afi.context_pack.v1" as const;
export const CONTEXT_PACK_RECEIPT_SCHEMA = "afi.context_pack_receipt.v1" as const;
export const SCRATCH_CUE_SCHEMA = "afi.scratch_cue.v1" as const;

export const LEDGER_ENTITY_TYPES = [
  "evidence_item",
  "context_statement",
  "conversation",
  "decision",
  "thread",
  "selection_run",
  "place",
  "draft",
  "feedback_signal",
] as const;

export type LedgerEntityType = (typeof LEDGER_ENTITY_TYPES)[number];

export type ContextBasis = "explicit" | "observed" | "inferred";
export type ProvenanceBasis = ContextBasis | "derived";

export interface EntityRef<TType extends string = string> {
  entity_type: TType;
  entity_id: string;
  revision?: number;
  record_hash?: string;
}

export interface ExternalReference {
  provider: string;
  kind: string;
  external_id: string;
  uri?: string;
  observed_at?: IsoTimestamp;
}

/**
 * Bodies which must be truly deletable should be stored out of line. The
 * append-only ledger retains this encrypted object's hash and identifier, not
 * the private bytes themselves.
 */
export interface ContentObjectRef {
  object_id: string;
  content_hash: string;
  encrypted: boolean;
  media_type?: string;
  byte_length?: number;
}

export interface RecordProvenance {
  basis: ProvenanceBasis;
  evidence_refs: EntityRef<"evidence_item">[];
  human_seed_refs: EntityRef[];
  derived_from_refs: EntityRef[];
  external_refs: ExternalReference[];
  confidence?: number;
  recorded_at: IsoTimestamp;
}

export type RetentionClassification = "private" | "eligible_shared" | "public";
export type RetentionMode = "durable" | "ttl";
export type ReplicationPolicy = "local_only" | "eligible" | "replicated";

export interface RetentionPolicy {
  classification: RetentionClassification;
  mode: RetentionMode;
  replication: ReplicationPolicy;
  body_storage: "inline" | "encrypted_object" | "reference_only";
  expires_at?: IsoTimestamp;
}

export interface LedgerEntityBase<
  TSchema extends string,
  TType extends LedgerEntityType,
> {
  schema: TSchema;
  entity_type: TType;
  entity_id: string;
  owner_id: string;
  revision: number;
  /** SHA-256 of the canonical record with this field omitted. */
  record_hash: string;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
  created_by: ActorRef;
  last_modified_by: ActorRef;
  provenance: RecordProvenance;
  retention: RetentionPolicy;
}

export type EvidenceKind =
  | "human_capture"
  | "public_source"
  | "work_artifact"
  | "provider_receipt"
  | "conversation_receipt"
  | "other";

export interface EvidenceItem
  extends LedgerEntityBase<typeof EVIDENCE_ITEM_SCHEMA, "evidence_item"> {
  evidence_kind: EvidenceKind;
  title: string;
  summary: string;
  occurred_at?: IsoTimestamp;
  captured_at: IsoTimestamp;
  content?: string;
  content_object?: ContentObjectRef;
  source_uri?: string;
  metadata: JsonObject;
}

export type ContextStatementStatus =
  | "proposed"
  | "active"
  | "contested"
  | "superseded"
  | "expired";

export interface ContextScope {
  kind: "person" | "project" | "domain" | "relationship" | "global";
  id?: string;
}

export interface ContextStatement
  extends LedgerEntityBase<typeof CONTEXT_STATEMENT_SCHEMA, "context_statement"> {
  basis: ContextBasis;
  status: ContextStatementStatus;
  subject: string;
  predicate: string;
  value: JsonValue;
  scope: ContextScope;
  valid_from?: IsoTimestamp;
  valid_until?: IsoTimestamp;
  supersedes?: EntityRef<"context_statement">;
}

export type ConversationDisposition =
  | "understanding_only"
  | "no_new_input"
  | "context_change_proposed"
  | "decision_recorded"
  | "thread_updated"
  | "place_proposed"
  | "draft_prepared"
  | "change_set_prepared"
  | "external_action_proposed";

export interface ConversationOutcome {
  disposition: ConversationDisposition;
  summary: string;
  learned: string[];
  uncertainties: string[];
  proposed_context_refs: EntityRef<"context_statement">[];
  decision_refs: EntityRef<"decision">[];
  thread_refs: EntityRef<"thread">[];
  place_refs: EntityRef<"place">[];
  draft_refs: EntityRef<"draft">[];
  action_refs: EntityRef[];
  carry_forward: string[];
  no_action_reason?: string;
}

export interface Conversation
  extends LedgerEntityBase<typeof CONVERSATION_SCHEMA, "conversation"> {
  purpose: string;
  mode: "short" | "deep" | "no_new_input" | "other";
  started_at: IsoTimestamp;
  ended_at?: IsoTimestamp;
  participants: ActorRef[];
  input_context_pack_id?: string;
  transcript_retention: "none" | "summary_only" | "full_private";
  human_seed_refs: EntityRef[];
  outcome?: ConversationOutcome;
}

export interface Decision
  extends LedgerEntityBase<typeof DECISION_SCHEMA, "decision"> {
  decision_kind:
    | "context_confirmation"
    | "context_rejection"
    | "priority"
    | "product"
    | "publishing"
    | "retention"
    | "other";
  statement: string;
  status: "active" | "superseded" | "reversed";
  decided_by: ActorRef;
  decided_at: IsoTimestamp;
  effective_until?: IsoTimestamp;
  target_refs: EntityRef[];
}

export interface ThreadClaim {
  claim_id: string;
  text: string;
  evidence_refs: EntityRef<"evidence_item">[];
  first_seen_at: IsoTimestamp;
  last_seen_at: IsoTimestamp;
  occurrence_count: number;
}

export interface Thread
  extends LedgerEntityBase<typeof THREAD_SCHEMA, "thread"> {
  title: string;
  summary: string;
  status: "watching" | "active" | "quiet" | "closed";
  claims: ThreadClaim[];
  context_refs: EntityRef<"context_statement">[];
  participant_refs: ExternalReference[];
  first_seen_at: IsoTimestamp;
  last_seen_at: IsoTimestamp;
}

export interface SelectionCandidate {
  candidate_id: string;
  label: string;
  disposition: "recommended" | "rejected" | "watching";
  rationale: string;
  score?: number;
  evidence_refs: EntityRef<"evidence_item">[];
}

export interface SelectionRun
  extends LedgerEntityBase<typeof SELECTION_RUN_SCHEMA, "selection_run"> {
  evaluation_kind: string;
  question: string;
  method: string;
  candidates: SelectionCandidate[];
  evaluated_count: number;
  rejected_count: number;
  result: "recommendation" | "none_worth_recommending" | "inconclusive";
  recommended_candidate_ids: string[];
  limitations: string[];
  completed_at: IsoTimestamp;
}

/** Product-language alias: an Evaluation is a recorded selection run. */
export type Evaluation = SelectionRun;

export interface Place
  extends LedgerEntityBase<typeof PLACE_SCHEMA, "place"> {
  thread_ref: EntityRef<"thread">;
  selection_run_ref?: EntityRef<"selection_run">;
  title: string;
  source_door: ExternalReference;
  opportunity: string;
  contribution: string;
  people_refs: ExternalReference[];
  next_move: string;
  human_cost: "low" | "medium" | "high";
  status: "proposed" | "selected" | "dismissed" | "expired" | "completed";
  expires_at: IsoTimestamp;
}

export interface DraftTarget {
  channel: string;
  account_ref?: string;
  audience?: string;
  reply_to?: ExternalReference;
}

export interface Draft
  extends LedgerEntityBase<typeof DRAFT_SCHEMA, "draft"> {
  draft_kind: "post" | "reply" | "article" | "message" | "change_set" | "other";
  title?: string;
  body: string;
  status: "working" | "ready" | "approved" | "superseded";
  target?: DraftTarget;
  source_refs: EntityRef<"evidence_item">[];
  /** A source-free draft is valid only when at least one human seed is cited. */
  human_seed_refs: EntityRef[];
  place_ref?: EntityRef<"place">;
}

export interface FeedbackSignal
  extends LedgerEntityBase<typeof FEEDBACK_SIGNAL_SCHEMA, "feedback_signal"> {
  target_ref: EntityRef;
  signal_kind:
    | "accepted"
    | "rejected"
    | "corrected"
    | "dismissed"
    | "useful"
    | "not_useful"
    | "other";
  value: JsonValue;
  recorded_by: ActorRef;
  recorded_at: IsoTimestamp;
}

export type LedgerEntity =
  | EvidenceItem
  | ContextStatement
  | Conversation
  | Decision
  | Thread
  | SelectionRun
  | Place
  | Draft
  | FeedbackSignal;

export interface LedgerWatermark {
  ledger_id: string;
  sequence: number;
  event_id: string;
  event_hash: string;
}

export interface ContextPackSection {
  key: string;
  title: string;
  authority: "explicit" | "observed" | "inferred" | "derived";
  summary?: string;
  record_refs: EntityRef[];
  token_count?: number;
}

export interface ContextPackSource {
  schema: "afi.context_kernel_pack.v1";
  pack_hash: string;
}

export interface ContextPackTraceItem {
  ref: EntityRef;
  basis: "explicit" | "observed" | "inferred" | "system";
  event_id: string;
  event_hash: string;
}

/**
 * A Context Pack is an immutable, derived view. It is intentionally excluded
 * from LedgerEntity and therefore cannot be written as canonical memory.
 */
export interface ContextPack {
  schema: typeof CONTEXT_PACK_SCHEMA;
  pack_id: string;
  owner_id: string;
  run_id: string;
  purpose: string;
  agent_role: string;
  derived: true;
  ledger_watermark: LedgerWatermark;
  token_budget: number;
  requested_refs: EntityRef[];
  source_pack: ContextPackSource;
  sections: ContextPackSection[];
  trace: ContextPackTraceItem[];
  capabilities: string[];
  omissions: string[];
  assembled_at: IsoTimestamp;
  expires_at?: IsoTimestamp;
  pack_hash: string;
}

/** Local workspace authentication envelope for stateless cross-harness use. */
export interface ContextPackReceipt {
  schema: typeof CONTEXT_PACK_RECEIPT_SCHEMA;
  pack: ContextPack;
  mac: `hmac-sha256:${string}`;
}

/**
 * An uncertain short-lived cue. ScratchCue is intentionally neither a
 * LedgerEntity nor a legal LedgerEvent payload.
 */
export interface ScratchCue {
  schema: typeof SCRATCH_CUE_SCHEMA;
  cue_id: string;
  owner_id: string;
  channel: string;
  summary: string;
  locator?: string;
  observed_at: IsoTimestamp;
  expires_at: IsoTimestamp;
  uncertainty: string;
  retention: {
    classification: "ephemeral";
    persistence: "scratch";
    replication: "never";
  };
}

export type LedgerOperation = "created" | "revised" | "corrected" | "tombstoned";
export type LedgerEventKind = `${LedgerEntityType}.${LedgerOperation}`;

export const LEDGER_EVENT_KINDS = Object.freeze(
  Object.fromEntries(
    LEDGER_ENTITY_TYPES.flatMap((entityType) =>
      (["created", "revised", "corrected", "tombstoned"] as const).map(
        (operation) => [
          `${entityType}_${operation}`,
          `${entityType}.${operation}` as LedgerEventKind,
        ],
      ),
    ),
  ) as Record<`${LedgerEntityType}_${LedgerOperation}`, LedgerEventKind>,
);

export interface LedgerAuthority {
  mode:
    | "user_originated"
    | "user_confirmation"
    | "agent_proposal"
    | "connector_observation"
    | "system_derived";
  granted_by?: ActorRef;
  /** Exact active Decision which authorizes this otherwise agent-written event. */
  confirmation_ref?: EntityRef<"decision">;
}

export interface LedgerTombstone {
  reason: string;
  erased_object_ids: string[];
}

interface LedgerEventBase {
  schema: typeof LEDGER_EVENT_SCHEMA;
  ledger_id: string;
  event_id: string;
  /** SHA-256 of the canonical event with this field omitted. */
  event_hash: string;
  previous_event_hash?: string;
  idempotency_key: string;
  sequence: number;
  owner_id: string;
  occurred_at: IsoTimestamp;
  recorded_at: IsoTimestamp;
  kind: LedgerEventKind;
  operation: LedgerOperation;
  target: EntityRef<LedgerEntityType>;
  revision: number;
  previous_revision?: number;
  previous_entity_hash?: string;
  actor: ActorRef;
  /** Present when a provider adapter, rather than a local user, produced it. */
  producer?: EventProducer;
  authority: LedgerAuthority;
  run_id?: string;
  correlation_id?: string;
  causation_event_id?: string;
  /** A correction may point to the exact prior event whose assertion it replaces. */
  supersedes_event_id?: string;
  reason?: string;
}

export interface LedgerEntityMutationEvent<T extends LedgerEntity = LedgerEntity>
  extends LedgerEventBase {
  operation: "created" | "revised" | "corrected";
  entity_hash: string;
  entity: T;
}

export interface LedgerTombstoneEvent extends LedgerEventBase {
  operation: "tombstoned";
  tombstone: LedgerTombstone;
}

export type LedgerEvent<T extends LedgerEntity = LedgerEntity> =
  | LedgerEntityMutationEvent<T>
  | LedgerTombstoneEvent;

export interface AuthorityDecision {
  allowed: boolean;
  required_authority:
    | "none"
    | "user_originated"
    | "user_confirmation"
    | "evidence_required"
    | "agent_proposal";
  reasons: string[];
}

export interface LedgerProjection {
  ledger_id?: string;
  watermark?: LedgerWatermark;
  entities: Map<string, LedgerEntity>;
  tombstones: Map<string, LedgerTombstone>;
  applied_event_ids: string[];
}
