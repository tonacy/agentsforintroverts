export type FeedLane = "needs_you" | "handled" | "watching" | "digest";
export type CompletionStatus = "completed" | "partial" | "failed";

export interface SourceInput {
  source_item_id: string;
  external_id: string;
  kind: string;
  url?: string;
  captured_at: string;
  content_hash: string;
  title?: string;
  author?: string;
  excerpt?: string;
  metadata?: Record<string, unknown>;
}

export interface ClaimInput {
  claim_id: string;
  kind: string;
  text: string;
  source_refs: string[];
  confidence?: number;
}

export interface RunContext {
  run_id: string;
  agent_key: string;
  sequence: number;
  trigger?: string;
}

export interface ListFeedQuery {
  lane?: string;
  agent_key?: string;
  status?: string;
  q?: string;
  limit?: number;
}

export interface QuietDeskGateway {
  connectionState(): {
    internalWriteConfigured: boolean;
  };
  health(): Promise<unknown>;
  listFeed(query: ListFeedQuery): Promise<unknown>;
  getFeedItem(id: string): Promise<unknown>;
  listSources(query: { kind?: string; q?: string; limit?: number }): Promise<unknown>;
  getSource(id: string): Promise<unknown>;
  observeSource(input: RunContext & SourceInput): Promise<unknown>;
  publishFeedItem(input: RunContext & {
    feed_item_id: string;
    headline: string;
    summary: string;
    why_it_matters: string;
    lane: FeedLane;
    confidence: number;
    claims: ClaimInput[];
    sources: SourceInput[];
  }): Promise<unknown>;
  updateFeedItem(input: RunContext & {
    feed_item_id: string;
    expected_revision: number;
    headline: string;
    summary: string;
    why_it_matters: string;
    lane: FeedLane;
    confidence: number;
    claims: ClaimInput[];
    sources: SourceInput[];
  }): Promise<unknown>;
  withdrawFeedItem(input: RunContext & {
    feed_item_id: string;
    expected_revision: number;
    reason: string;
    sources: SourceInput[];
  }): Promise<unknown>;
  proposeAction(input: RunContext & {
    action_id: string;
    revision: number;
    operation: string;
    account: string;
    target: string;
    payload: unknown;
    expires_at: string;
    rationale: string;
    sources: SourceInput[];
  }): Promise<unknown>;
  recordFeedback(input: RunContext & {
    feedback_id: string;
    feedback_kind: string;
    subject_id: string;
    value: unknown;
    sources: SourceInput[];
  }): Promise<unknown>;
  completeRun(input: RunContext & {
    status: CompletionStatus;
    summary: string;
    completed_steps: string[];
    remaining_steps: string[];
    blocker?: string;
    sources: SourceInput[];
  }): Promise<unknown>;
}

export type ContextJsonObject = Record<string, unknown>;

export const CONTEXT_KERNEL_OPERATIONS = [
  "context_capabilities",
  "open_run",
  "record_scratch_cue",
  "record_evidence",
  "assemble_context",
  "refresh_context",
  "search_entities",
  "get_entity",
  "append_context_event",
  "get_changes",
  "checkpoint_run",
  "complete_context_run",
] as const;

export type ContextKernelOperation = (typeof CONTEXT_KERNEL_OPERATIONS)[number];

/**
 * Authority is supplied by the trusted local Context Kernel adapter, never by
 * an MCP caller. The ordinary agent bridge deliberately has no confirmation,
 * approval, or execution operation.
 */
export interface ContextKernelAuthority {
  actor_type: "agent";
  roles: string[];
  operations: ContextKernelOperation[];
  allowed_event_kinds: string[];
  allowed_evidence_classes: string[];
  allowed_cue_classes: string[];
  allowed_retention_classes: string[];
  user_confirmation: false;
  approval: false;
  execution: false;
}

export interface ContextEntityRef {
  entity_type: string;
  entity_id: string;
  revision?: number;
  record_hash?: string;
}

export interface ContextProvenanceRef {
  ref: ContextEntityRef;
  relation: string;
  locator?: string;
  excerpt?: string;
  observed_at?: string;
}

export interface OpenContextRunInput {
  role: string;
  goal: string;
  trigger?: string;
  idempotency_key: string;
  bounds: {
    max_iterations?: number;
    context_budget_tokens?: number;
    source_limit?: number;
    deadline_at?: string;
  };
  metadata?: ContextJsonObject;
}

export interface ScratchCueInput {
  run_id: string;
  cue_id: string;
  cue_class: string;
  minimized_cue: string;
  observed_at: string;
  expires_at: string;
  source_scope?: string;
  metadata?: ContextJsonObject;
}

export interface ContextEvidenceInput {
  run_id: string;
  evidence_id: string;
  evidence_class: string;
  occurred_at: string;
  captured_at: string;
  content_hash: string;
  content: ContextJsonObject;
  retention_class: string;
  expires_at?: string;
  source_url?: string;
  external_id?: string;
  provenance: ContextProvenanceRef[];
}

export interface AssembleContextInput {
  run_id: string;
  role: string;
  goal: string;
  token_budget: number;
  include_refs?: ContextEntityRef[];
  after_event_id?: string;
}

export interface RefreshContextInput {
  run_id: string;
  context_pack_id: string;
  /** Full workspace-authenticated receipt returned by assemble_context. */
  previous_context_pack_receipt: ContextJsonObject;
  after_event_id?: string;
  token_budget?: number;
}

export interface SearchContextEntitiesInput {
  run_id: string;
  query: string;
  entity_types?: string[];
  statuses?: string[];
  limit: number;
  cursor?: string;
}

export interface GetContextEntityInput {
  run_id: string;
  ref: ContextEntityRef;
}

export interface AppendContextEventInput {
  run_id: string;
  event_id: string;
  idempotency_key: string;
  kind: string;
  entity: {
    entity_type: string;
    entity_id: string;
    expected_revision?: number;
  };
  occurred_at: string;
  payload: ContextJsonObject;
  provenance: ContextProvenanceRef[];
}

export interface GetContextChangesInput {
  run_id: string;
  after_event_id?: string;
  entity_types?: string[];
  limit: number;
  cursor?: string;
}

export interface ContextCheckpointInput {
  run_id: string;
  checkpoint_id: string;
  completed_steps: string[];
  remaining_steps: string[];
  next_step?: string;
  state?: ContextJsonObject;
  expected_run_revision?: number;
}

export interface CompleteContextRunInput {
  run_id: string;
  status: "completed" | "partial" | "failed";
  summary: string;
  output_refs: ContextEntityRef[];
  completed_steps: string[];
  remaining_steps: string[];
  blocker?: string;
}

/**
 * Harness-neutral port implemented by the local Context Kernel service. MCP,
 * HTTP, CLI, Codex, and future agent harnesses should all target this contract.
 * Implementations must repeat authorization checks at their storage boundary.
 */
export interface ContextKernelGateway {
  authority(): ContextKernelAuthority;
  capabilities(): Promise<unknown>;
  openRun(input: OpenContextRunInput): Promise<unknown>;
  recordScratchCue(input: ScratchCueInput): Promise<unknown>;
  recordEvidence(input: ContextEvidenceInput): Promise<unknown>;
  assembleContext(input: AssembleContextInput): Promise<unknown>;
  refreshContext(input: RefreshContextInput): Promise<unknown>;
  searchEntities(input: SearchContextEntitiesInput): Promise<unknown>;
  getEntity(input: GetContextEntityInput): Promise<unknown>;
  appendContextEvent(input: AppendContextEventInput): Promise<unknown>;
  getChanges(input: GetContextChangesInput): Promise<unknown>;
  checkpointRun(input: ContextCheckpointInput): Promise<unknown>;
  completeContextRun(input: CompleteContextRunInput): Promise<unknown>;
}
