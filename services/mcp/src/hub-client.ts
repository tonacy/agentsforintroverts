import { createHash, createHmac, randomUUID } from "node:crypto";
import type { BridgeConfig } from "./config.js";
import type {
  ListFeedQuery,
  QuietDeskGateway,
  RunContext,
  SourceInput,
} from "./types.js";

type Fetch = typeof fetch;

interface EventEnvelope {
  schema: "afi.event.v1";
  event_id: string;
  idempotency_key: string;
  occurred_at: string;
  producer: {
    connection_id: string;
    provider: string;
    external_agent_id: string;
  };
  run: {
    external_id: string;
    agent_key: string;
    trigger: string;
  };
  sequence: number;
  kind: string;
  data: Record<string, unknown>;
  sources: SourceInput[];
}

function stableValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON rejects non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Canonical JSON rejects cycles");
    seen.add(value);
    const result = value.map((child) => stableValue(child, seen));
    seen.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) throw new TypeError("Canonical JSON rejects cycles");
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON accepts only plain objects and arrays");
    }
    seen.add(value);
    const result = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => {
          if (child === undefined) throw new TypeError("Canonical JSON rejects undefined values");
          return [key, stableValue(child, seen)];
        }),
    );
    seen.delete(value);
    return result;
  }
  throw new TypeError(`Canonical JSON rejects ${typeof value} values`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value, new WeakSet()));
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function signatureInput(timestamp: string, nonce: string, body: string): string {
  return `${timestamp}\n${nonce}\n${body}`;
}

export class HubClient implements QuietDeskGateway {
  constructor(
    private readonly config: BridgeConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly uuid: () => string = randomUUID,
  ) {}

  private async read(path: string, params?: Record<string, string | number | undefined>): Promise<unknown> {
    const url = new URL(path, `${this.config.hubUrl}/`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    const headers = new Headers({ accept: "application/json" });
    if (this.config.hubReadToken) headers.set("authorization", `Bearer ${this.config.hubReadToken}`);
    const response = await this.fetchImpl(url, { headers });
    return this.parse(response);
  }

  private async parse(response: Response): Promise<unknown> {
    const text = await response.text();
    let payload: unknown = text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // Preserve non-JSON upstream details without pretending they are structured.
      }
    }
    if (!response.ok) {
      throw new Error(`Quiet Hub ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
    }
    return payload;
  }

  private envelope(kind: string, context: RunContext, data: Record<string, unknown>, sources: SourceInput[]): EventEnvelope {
    return {
      schema: "afi.event.v1",
      event_id: this.uuid(),
      idempotency_key: `${this.config.connectionId}/${context.run_id}/${context.sequence}/${kind}`,
      occurred_at: this.now().toISOString(),
      producer: {
        connection_id: this.config.connectionId,
        provider: this.config.provider,
        external_agent_id: context.agent_key,
      },
      run: {
        external_id: context.run_id,
        agent_key: context.agent_key,
        trigger: context.trigger ?? "manual",
      },
      sequence: context.sequence,
      kind,
      data,
      sources,
    };
  }

  private sourceReferences(sources: SourceInput[]): Array<Record<string, unknown>> {
    return sources.map((source) => ({
      source_item_id: source.source_item_id,
      locator: source.url,
      observed_at: source.captured_at,
    }));
  }

  private claims(claims: Parameters<QuietDeskGateway["publishFeedItem"]>[0]["claims"]): Array<Record<string, unknown>> {
    return claims.map((claim) => ({
      claim_id: claim.claim_id,
      kind: claim.kind,
      text: claim.text,
      source_refs: claim.source_refs.map((source_item_id) => ({ source_item_id })),
      ...(claim.confidence === undefined ? {} : { confidence: claim.confidence }),
    }));
  }

  private async publish(kind: string, context: RunContext, data: Record<string, unknown>, sources: SourceInput[]): Promise<unknown> {
    if (!this.config.hubSecret) {
      throw new Error("QUIET_HUB_SECRET is required for write tools");
    }
    const body = JSON.stringify(this.envelope(kind, context, data, sources));
    const timestamp = String(Math.floor(this.now().getTime() / 1000));
    const nonce = this.uuid();
    const signature = createHmac("sha256", this.config.hubSecret)
      .update(signatureInput(timestamp, nonce, body))
      .digest("hex");
    const response = await this.fetchImpl(new URL("v1/events", `${this.config.hubUrl}/`), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-afi-key-id": this.config.connectionId,
        "x-afi-timestamp": timestamp,
        "x-afi-nonce": nonce,
        "x-afi-signature": signature,
      },
      body,
    });
    return this.parse(response);
  }

  health(): Promise<unknown> {
    return this.read("health");
  }

  listFeed(query: ListFeedQuery): Promise<unknown> {
    return this.read("v1/feed", { ...query });
  }

  getFeedItem(id: string): Promise<unknown> {
    return this.read(`v1/feed/${encodeURIComponent(id)}`);
  }

  listSources(query: { kind?: string; q?: string; limit?: number }): Promise<unknown> {
    return this.read("v1/sources", query);
  }

  getSource(id: string): Promise<unknown> {
    return this.read(`v1/sources/${encodeURIComponent(id)}`);
  }

  publishFeedItem(input: Parameters<QuietDeskGateway["publishFeedItem"]>[0]): Promise<unknown> {
    return this.publish("feed.item.published", input, {
      feed_item: {
        schema: "afi.feed_item.v1",
        feed_item_id: input.feed_item_id,
        user_id: this.config.userId,
        run_id: input.run_id,
        agent_id: input.agent_key,
        revision: 1,
        title: input.headline,
        summary: input.summary,
        why_it_matters: input.why_it_matters,
        lane: input.lane,
        confidence: input.confidence,
        claims: this.claims(input.claims),
        sources: this.sourceReferences(input.sources),
        status: "unread",
        created_at: this.now().toISOString(),
      },
    }, input.sources);
  }

  updateFeedItem(input: Parameters<QuietDeskGateway["updateFeedItem"]>[0]): Promise<unknown> {
    return this.publish("feed.item.updated", input, {
      feed_item: {
        schema: "afi.feed_item.v1",
        feed_item_id: input.feed_item_id,
        user_id: this.config.userId,
        run_id: input.run_id,
        agent_id: input.agent_key,
        revision: input.expected_revision + 1,
        title: input.headline,
        summary: input.summary,
        why_it_matters: input.why_it_matters,
        lane: input.lane,
        confidence: input.confidence,
        claims: this.claims(input.claims),
        sources: this.sourceReferences(input.sources),
        status: "unread",
        created_at: this.now().toISOString(),
      },
      previous_revision: input.expected_revision,
    }, input.sources);
  }

  withdrawFeedItem(input: Parameters<QuietDeskGateway["withdrawFeedItem"]>[0]): Promise<unknown> {
    const { sources } = input;
    return this.publish("feed.item.withdrawn", input, {
      feed_item_id: input.feed_item_id,
      feed_item_revision: input.expected_revision,
      reason: input.reason,
      withdrawn_by: { actor_type: "agent", actor_id: input.agent_key },
    }, sources);
  }

  proposeAction(input: Parameters<QuietDeskGateway["proposeAction"]>[0]): Promise<unknown> {
    const { sources } = input;
    const boundPayload = {
      operation: input.operation,
      account: input.account,
      target: input.target,
      body: input.payload,
    };
    return this.publish("action.proposed", input, {
      proposal: {
        schema: "afi.action_proposal.v1",
        action_id: input.action_id,
        revision: input.revision,
        user_id: this.config.userId,
        run_id: input.run_id,
        agent_id: input.agent_key,
        provider_connection_id: this.config.connectionId,
        action_kind: input.operation,
        rationale: input.rationale,
        payload: boundPayload,
        payload_hash: `sha256:${canonicalSha256(boundPayload)}`,
        proposed_by: { actor_type: "agent", actor_id: input.agent_key },
        proposed_at: this.now().toISOString(),
        expires_at: input.expires_at,
        sources: this.sourceReferences(input.sources),
        status: "proposed",
      },
    }, sources);
  }

  recordFeedback(input: Parameters<QuietDeskGateway["recordFeedback"]>[0]): Promise<unknown> {
    return this.publish("feedback.recorded", input, {
      feedback_id: input.feedback_id,
      feed_item_id: input.subject_id,
      feedback_kind: input.feedback_kind,
      value: input.value,
      recorded_by: { actor_type: "agent", actor_id: input.agent_key },
    }, input.sources);
  }

  completeRun(input: Parameters<QuietDeskGateway["completeRun"]>[0]): Promise<unknown> {
    const { sources } = input;
    if (input.status === "completed") {
      return this.publish("run.completed", input, {
        status: "completed",
        summary: input.summary,
        output_ids: [],
      }, sources);
    }
    if (input.status === "partial") {
      return this.publish("run.partial", input, {
        status: "partial",
        summary: input.summary,
        completed_steps: input.completed_steps,
        remaining_steps: input.remaining_steps,
        checkpoint: { blocker: input.blocker ?? null },
      }, sources);
    }
    return this.publish("run.failed", input, {
      status: "failed",
      error: {
        code: "agent_run_failed",
        message: input.blocker ?? input.summary,
        retryable: input.remaining_steps.length > 0,
      },
      checkpoint: {
        completed_steps: input.completed_steps,
        remaining_steps: input.remaining_steps,
      },
    }, sources);
  }
}
