import type { AppendResult, EventStore, StoredEvent } from "./types.js";
import { sameStoredEvent } from "./store-utils.js";

function cloneEvent(event: StoredEvent): StoredEvent {
  return structuredClone(event);
}

export class MemoryEventStore implements EventStore {
  readonly kind = "memory";

  private readonly events: StoredEvent[] = [];
  private readonly byIdempotency = new Map<string, StoredEvent>();
  private readonly byExternalEvent = new Map<string, StoredEvent>();
  private readonly nonces = new Map<string, number>();

  async claimNonce(keyId: string, nonce: string, expiresAtMs: number, nowMs: number): Promise<boolean> {
    for (const [key, expiry] of this.nonces) {
      if (expiry < nowMs) this.nonces.delete(key);
    }
    const nonceKey = `${keyId}\u0000${nonce}`;
    if (this.nonces.has(nonceKey)) return false;
    this.nonces.set(nonceKey, expiresAtMs);
    return true;
  }

  async append(event: StoredEvent): Promise<AppendResult> {
    const idempotencyKey = `${event.producer.connection_id}\u0000${event.idempotency_key}`;
    const externalEventKey = `${event.producer.connection_id}\u0000${event.event_id}`;
    const idempotentRecord = this.byIdempotency.get(idempotencyKey);
    if (idempotentRecord) {
      if (!sameStoredEvent(idempotentRecord, event)) {
        return { outcome: "conflict", record: cloneEvent(idempotentRecord) };
      }
      return { outcome: "duplicate", record: cloneEvent(idempotentRecord) };
    }
    const existingEvent = this.byExternalEvent.get(externalEventKey);
    if (existingEvent) {
      return sameStoredEvent(existingEvent, event, true)
        ? { outcome: "duplicate", record: cloneEvent(existingEvent) }
        : { outcome: "conflict", record: cloneEvent(existingEvent) };
    }

    const stored = cloneEvent(event);
    this.events.push(stored);
    this.byIdempotency.set(idempotencyKey, stored);
    this.byExternalEvent.set(externalEventKey, stored);
    return { outcome: "inserted", record: cloneEvent(stored) };
  }

  async listEvents(): Promise<StoredEvent[]> {
    return this.events.map(cloneEvent);
  }

  async listRunEvents(runId: string): Promise<StoredEvent[]> {
    return this.events
      .filter((event) => event.canonical_run_id === runId)
      .map(cloneEvent);
  }
}
