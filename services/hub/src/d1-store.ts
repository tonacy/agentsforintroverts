import type { AppendResult, EventStore, StoredEvent } from "./types.js";
import { sameStoredEvent } from "./store-utils.js";

type D1Bindable = string | number | null;

export interface D1ResultLike {
  success: boolean;
  meta: {
    changes?: number;
  };
}

export interface D1PreparedStatementLike {
  bind(...values: D1Bindable[]): D1PreparedStatementLike;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<D1ResultLike>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<D1ResultLike[]>;
}

interface StoredEventRow {
  canonical_event_id: string;
  external_event_id: string;
  idempotency_key: string;
  payload_json: string;
}

function parseStoredEvent(payload: string): StoredEvent {
  return JSON.parse(payload) as StoredEvent;
}

export class D1EventStore implements EventStore {
  readonly kind = "d1";

  constructor(
    private readonly database: D1DatabaseLike,
    private readonly maxEventsPerRead = 10_000,
  ) {}

  async claimNonce(keyId: string, nonce: string, expiresAtMs: number, nowMs: number): Promise<boolean> {
    const cleanup = this.database
      .prepare("DELETE FROM ingest_nonces WHERE expires_at_ms < ?1")
      .bind(nowMs);
    const insert = this.database
      .prepare(
        "INSERT OR IGNORE INTO ingest_nonces (key_id, nonce, expires_at_ms, created_at_ms) VALUES (?1, ?2, ?3, ?4)",
      )
      .bind(keyId, nonce, expiresAtMs, nowMs);
    const results = await this.database.batch([cleanup, insert]);
    return (results[1]?.meta.changes ?? 0) > 0;
  }

  private async findExisting(event: StoredEvent): Promise<StoredEventRow | null> {
    return this.database
      .prepare(
        `SELECT canonical_event_id, external_event_id, idempotency_key, payload_json
         FROM events
         WHERE connection_id = ?1
           AND (idempotency_key = ?2 OR external_event_id = ?3)
         ORDER BY CASE WHEN idempotency_key = ?2 THEN 0 ELSE 1 END
         LIMIT 1`,
      )
      .bind(event.producer.connection_id, event.idempotency_key, event.event_id)
      .first<StoredEventRow>();
  }

  private duplicateResult(event: StoredEvent, existing: StoredEventRow): AppendResult {
    const record = parseStoredEvent(existing.payload_json);
    const sameIdempotencyKey = existing.idempotency_key === event.idempotency_key;
    const equivalent = sameStoredEvent(record, event, !sameIdempotencyKey);
    return equivalent
      ? { outcome: "duplicate", record }
      : { outcome: "conflict", record };
  }

  async append(event: StoredEvent): Promise<AppendResult> {
    const existing = await this.findExisting(event);
    if (existing) return this.duplicateResult(event, existing);

    const payload = JSON.stringify(event);
    const result = await this.database
      .prepare(
        `INSERT OR IGNORE INTO events (
          canonical_event_id,
          canonical_run_id,
          canonical_feed_id,
          schema_version,
          connection_id,
          provider,
          agent_key,
          external_event_id,
          idempotency_key,
          occurred_at,
          sequence,
          kind,
          received_at,
          payload_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
      )
      .bind(
        event.canonical_event_id,
        event.canonical_run_id,
        event.canonical_feed_id ?? null,
        event.schema,
        event.producer.connection_id,
        event.producer.provider,
        event.run.agent_key,
        event.event_id,
        event.idempotency_key,
        event.occurred_at,
        event.sequence,
        event.kind,
        event.received_at,
        payload,
      )
      .run();

    if ((result.meta.changes ?? 0) > 0) {
      return { outcome: "inserted", record: event };
    }

    const racedExisting = await this.findExisting(event);
    if (!racedExisting) {
      throw new Error("D1 rejected an event without returning the conflicting append-only record.");
    }
    return this.duplicateResult(event, racedExisting);
  }

  async listEvents(): Promise<StoredEvent[]> {
    const result = await this.database
      .prepare(
        `SELECT payload_json
         FROM events
         ORDER BY sequence ASC, occurred_at ASC, canonical_event_id ASC
         LIMIT ?1`,
      )
      .bind(this.maxEventsPerRead)
      .all<{ payload_json: string }>();
    return result.results.map((row) => parseStoredEvent(row.payload_json));
  }

  async listRunEvents(runId: string): Promise<StoredEvent[]> {
    const result = await this.database
      .prepare(
        `SELECT payload_json
         FROM events
         WHERE canonical_run_id = ?1
         ORDER BY sequence ASC, occurred_at ASC, canonical_event_id ASC
         LIMIT ?2`,
      )
      .bind(runId, this.maxEventsPerRead)
      .all<{ payload_json: string }>();
    return result.results.map((row) => parseStoredEvent(row.payload_json));
  }
}
