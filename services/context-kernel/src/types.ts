/** Local storage envelope. Convert through protocol-adapter before protocol transport. */
export const KERNEL_EVENT_SCHEMA = "afi.context_kernel_event.v1" as const;
export const WORKSPACE_SCHEMA = "afi.context-workspace.v1" as const;
/** Local deterministic pack; rich protocol ContextPacks are a separate transport contract. */
export const PACK_SCHEMA = "afi.context_kernel_pack.v1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Basis = "explicit" | "observed" | "inferred" | "system";
export type RunCompletionStatus = "completed" | "partial" | "blocked" | "failed";

export interface ActorRef {
  actor_id: string;
  actor_type: "user" | "agent" | "provider" | "system" | "service";
  display_name?: string;
}

export interface SourceRef {
  source: string;
  external_id?: string;
  /** @deprecated Raw locators are rejected at the storage boundary; keep them in encrypted body text. */
  url?: string;
  observed_at?: string;
}

export interface EntityRef {
  type: string;
  id: string;
  revision: number;
}

export interface PrivateBodyRef {
  object_id: string;
  sha256: string;
  bytes: number;
  algorithm: "aes-256-gcm";
}

export interface ContextEvent {
  schema: typeof KERNEL_EVENT_SCHEMA;
  event_id: string;
  idempotency_key: string;
  request_hash: string;
  sequence: number;
  previous_event_hash?: string;
  occurred_at: string;
  recorded_at: string;
  actor: ActorRef;
  kind: string;
  basis: Basis;
  entity: EntityRef;
  payload: Record<string, JsonValue>;
  private_body?: PrivateBodyRef;
  source_refs: SourceRef[];
  supersedes_event_id?: string;
  tombstone?: boolean;
  event_hash: string;
}

export interface ChangeInput {
  event_id?: string;
  idempotency_key: string;
  occurred_at?: string;
  recorded_at?: string;
  actor: ActorRef;
  kind: string;
  basis: Basis;
  entity_type: string;
  entity_id?: string;
  expected_revision: number;
  payload?: Record<string, JsonValue>;
  body?: string;
  source_refs?: SourceRef[];
  supersedes_event_id?: string;
  tombstone?: boolean;
}

export interface ChangeResult {
  event: ContextEvent;
  created: boolean;
}

export interface DeleteInput {
  entity_type: string;
  entity_id: string;
  expected_revision: number;
  idempotency_key: string;
  actor: ActorRef;
  occurred_at?: string;
  reason_code?: string;
}

export interface ProjectedRecord {
  entity_type: string;
  entity_id: string;
  revision: number;
  status: "active" | "deleted";
  basis: Basis;
  kind: string;
  payload: Record<string, JsonValue>;
  body?: string;
  body_state: "present" | "none" | "erased" | "deleted";
  source_refs: SourceRef[];
  event_id: string;
  event_hash: string;
  occurred_at: string;
  recorded_at: string;
}

export interface ReplayResult {
  watermark: LedgerWatermark;
  records: ProjectedRecord[];
}

export interface LedgerWatermark {
  sequence: number;
  event_count: number;
  last_event_id: string | null;
  last_event_hash: string | null;
  ledger_hash: string;
}

export interface SearchInput {
  query: string;
  entity_type?: string;
  basis?: Basis;
  include_deleted?: boolean;
  limit?: number;
}

export interface SearchHit {
  entity_type: string;
  entity_id: string;
  revision: number;
  basis: Basis;
  status: "active" | "deleted";
  title: string;
  snippet: string;
  rank: number;
  event_id: string;
}

export interface ScratchCueInput {
  id?: string;
  cue: string;
  created_at?: string;
  ttl_ms: number;
  basis?: Exclude<Basis, "system">;
  metadata?: Record<string, JsonValue>;
}

export interface ScratchCue {
  id: string;
  cue: string;
  basis: Exclude<Basis, "system">;
  created_at: string;
  recorded_at: string;
  expires_at: string;
  metadata: Record<string, JsonValue>;
}

export interface ExpiryPruneResult {
  checked_at: string;
  pruned: Array<{
    entity_type: string;
    entity_id: string;
    previous_revision: number;
    event_id: string;
    expires_at: string;
  }>;
}

export interface ContextPackInput {
  query?: string;
  entity_types?: string[];
  bases?: Basis[];
  max_items?: number;
  max_chars?: number;
  include_scratch?: boolean;
  now?: string;
}

export interface ContextPackItem {
  entity_type: string;
  entity_id: string;
  revision: number;
  basis: Basis;
  kind: string;
  payload: Record<string, JsonValue>;
  body?: string;
  occurred_at: string;
}

export interface PackTraceItem {
  entity_type: string;
  entity_id: string;
  revision: number;
  event_id: string;
  event_hash: string;
  basis: Basis;
  source_refs: SourceRef[];
}

export interface PackOmission {
  entity_type?: string;
  entity_id?: string;
  reason:
    | "query_mismatch"
    | "entity_type_filter"
    | "basis_filter"
    | "deleted"
    | "missing_private_body"
    | "item_limit"
    | "character_limit"
    | "scratch_expired";
}

export interface ContextPack {
  schema: typeof PACK_SCHEMA;
  watermark: LedgerWatermark;
  constraints: {
    query: string | null;
    entity_types: string[];
    bases: Basis[];
    max_items: number;
    max_chars: number;
    include_scratch: boolean;
  };
  context: {
    explicit: ContextPackItem[];
    observed: ContextPackItem[];
    inferred: ContextPackItem[];
    system: ContextPackItem[];
    scratch: ScratchCue[];
  };
  trace: PackTraceItem[];
  omissions: PackOmission[];
  omission_summary: {
    total: number;
    shown: number;
    by_reason: Record<PackOmission["reason"], number>;
  };
  selected_items: number;
  selected_chars: number;
  pack_hash: string;
}

export interface WorkspaceManifest {
  schema: typeof WORKSPACE_SCHEMA;
  workspace_id: string;
  owner_id: string;
  created_at: string;
  encryption: {
    algorithm: "aes-256-gcm";
    key_file: string;
  };
  paths: {
    ledger: string;
    private_objects: string;
    projections: string;
    scratch: string;
    cache: string;
  };
}

export interface WorkspaceInitInput {
  owner_id: string;
  workspace_id?: string;
  created_at?: string;
}

export interface RunCheckpointInput {
  run_id: string;
  idempotency_key: string;
  expected_revision: number;
  actor: ActorRef;
  summary: string;
  state?: Record<string, JsonValue>;
  occurred_at?: string;
}

export interface RunCompletionInput {
  run_id: string;
  idempotency_key: string;
  expected_revision: number;
  actor: ActorRef;
  status: RunCompletionStatus;
  summary: string;
  output_refs?: string[];
  occurred_at?: string;
}
