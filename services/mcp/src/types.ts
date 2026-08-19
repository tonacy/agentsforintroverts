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
  health(): Promise<unknown>;
  listFeed(query: ListFeedQuery): Promise<unknown>;
  getFeedItem(id: string): Promise<unknown>;
  listSources(query: { kind?: string; q?: string; limit?: number }): Promise<unknown>;
  getSource(id: string): Promise<unknown>;
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
