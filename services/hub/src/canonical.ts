const encoder = new TextEncoder();

function serializeCanonical(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not permit non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Canonical JSON does not permit cycles.");
    ancestors.add(value);
    const serialized = `[${value.map((item) => serializeCanonical(item, ancestors)).join(",")}]`;
    ancestors.delete(value);
    return serialized;
  }
  if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON only permits plain objects.");
    }
    if (ancestors.has(value)) throw new TypeError("Canonical JSON does not permit cycles.");
    ancestors.add(value);
    const record = value as Record<string, unknown>;
    const serialized = `{${Object.keys(record)
      .sort()
      .map((key) => {
        if (record[key] === undefined) {
          throw new TypeError("Canonical JSON does not permit undefined values.");
        }
        return `${JSON.stringify(key)}:${serializeCanonical(record[key], ancestors)}`;
      })
      .join(",")}}`;
    ancestors.delete(value);
    return serialized;
  }
  throw new TypeError(`Canonical JSON does not permit ${typeof value} values.`);
}

/** Stable JSON bytes used to bind an approval to one exact proposed payload. */
export function canonicalJson(value: unknown): string {
  return serializeCanonical(value, new WeakSet<object>());
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashActionPayload(payload: Record<string, unknown>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalJson(payload)));
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}
