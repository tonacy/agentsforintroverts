import type {
  AppendResult,
  EventStore,
  StoredEvent,
  SubscribeOutcome,
  SubscriberInput,
  SubscriberRecord,
  SubscriberStore,
} from "./types.js";
import { sameStoredEvent } from "./store-utils.js";

function cloneEvent(event: StoredEvent): StoredEvent {
  return structuredClone(event);
}

interface RateLimitWindow {
  windowStartMs: number;
  attempts: number;
}

export class MemoryEventStore implements EventStore, SubscriberStore {
  readonly kind = "memory";

  private readonly events: StoredEvent[] = [];
  private readonly byIdempotency = new Map<string, StoredEvent>();
  private readonly byExternalEvent = new Map<string, StoredEvent>();
  private readonly nonces = new Map<string, number>();
  private readonly subscribers = new Map<string, SubscriberRecord>();
  private readonly subscribeWindows = new Map<string, RateLimitWindow>();

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

  async addSubscriber(input: SubscriberInput): Promise<SubscribeOutcome> {
    const existing = this.subscribers.get(input.email);
    if (existing) {
      // Idempotent: touch the row, but never resurrect an explicit unsubscribe.
      existing.updated_at = input.nowIso;
      return "duplicate";
    }
    this.subscribers.set(input.email, {
      id: input.id,
      email: input.email,
      source: input.source,
      ip_hash: input.ipHash,
      created_at: input.nowIso,
      updated_at: input.nowIso,
      unsubscribed_at: null,
    });
    return "inserted";
  }

  async claimSubscribeSlot(
    ipHash: string,
    nowMs: number,
    windowMs: number,
    maxRequests: number,
  ): Promise<boolean> {
    const windowFloor = nowMs - windowMs;
    for (const [key, window] of this.subscribeWindows) {
      if (window.windowStartMs <= windowFloor) this.subscribeWindows.delete(key);
    }
    const current = this.subscribeWindows.get(ipHash);
    if (!current) {
      this.subscribeWindows.set(ipHash, { windowStartMs: nowMs, attempts: 1 });
      return maxRequests >= 1;
    }
    current.attempts += 1;
    return current.attempts <= maxRequests;
  }

  /** Test-only view of the mailing list. */
  listSubscribers(): SubscriberRecord[] {
    return Array.from(this.subscribers.values(), (record) => ({ ...record }));
  }
}
