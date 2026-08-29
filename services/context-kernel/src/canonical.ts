import { createHash, randomBytes } from "node:crypto";
import type { JsonValue } from "./types.js";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON rejects non-finite numbers");
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item) ?? null);
  }
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const sorted = sortValue((value as Record<string, unknown>)[key]);
      if (sorted !== undefined) output[key] = sorted;
    }
    return output;
  }
  throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let lastSortableTime = -1;
let lastSortableRandom = 0n;

/** Dependency-free monotonic ULID with a readable, type-specific prefix. */
export function newId(prefix: string, now = Date.now()): string {
  safeSegment(prefix, "id prefix");
  if (!Number.isSafeInteger(now) || now < 0 || now > 281_474_976_710_655) {
    throw new RangeError("ULID timestamp must fit in 48 bits");
  }
  const timestamp = Math.max(now, lastSortableTime);
  let random: bigint;
  if (timestamp === lastSortableTime) {
    random = lastSortableRandom + 1n;
    if (random >= (1n << 80n)) throw new Error("ULID random component overflowed");
  } else {
    random = BigInt(`0x${randomBytes(10).toString("hex")}`);
  }
  lastSortableTime = timestamp;
  lastSortableRandom = random;
  let cursor = (BigInt(timestamp) << 80n) | random;
  let encoded = "";
  for (let index = 0; index < 26; index += 1) {
    encoded = CROCKFORD[Number(cursor & 31n)] + encoded;
    cursor >>= 5n;
  }
  return `${prefix}_${encoded}`;
}

export function isSortableId(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9.-]{0,31}_[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}

export function assertSortableId(value: string, label: string): string {
  if (!isSortableId(value)) throw new TypeError(`${label} must be a prefixed ULID`);
  return value;
}

export function safeSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw new TypeError(`${label} must be non-empty`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) {
    throw new TypeError(`${label} contains unsupported path characters`);
  }
  return normalized;
}

export function assertIsoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new TypeError(`${label} must be an ISO-8601 UTC timestamp`);
  }
  if (Number.isNaN(Date.parse(value))) throw new TypeError(`${label} is invalid`);
  return value;
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
