import type { StoredEvent } from "./types.js";

function immutableEventJson(event: StoredEvent, ignoreIdempotencyKey: boolean): string {
  const excludedKeys = new Set(["received_at"]);
  if (ignoreIdempotencyKey) excludedKeys.add("idempotency_key");
  return JSON.stringify(Object.fromEntries(
    Object.entries(event).filter(([key]) => !excludedKeys.has(key)),
  ));
}

/** Compare signed event content while excluding hub receipt metadata. */
export function sameStoredEvent(
  left: StoredEvent,
  right: StoredEvent,
  ignoreIdempotencyKey = false,
): boolean {
  return immutableEventJson(left, ignoreIdempotencyKey)
    === immutableEventJson(right, ignoreIdempotencyKey);
}
