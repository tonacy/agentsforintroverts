import { HttpError } from "./errors.js";

const encoder = new TextEncoder();

export const SIGNATURE_HEADERS = {
  keyId: "x-afi-key-id",
  timestamp: "x-afi-timestamp",
  nonce: "x-afi-nonce",
  signature: "x-afi-signature",
} as const;

export interface SignatureHeaders {
  keyId: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

export interface SignatureWindowOptions {
  nowMs: number;
  replayWindowSeconds: number;
}

interface TimingSafeSubtleCrypto extends SubtleCrypto {
  timingSafeEqual?(left: ArrayBuffer | ArrayBufferView, right: ArrayBuffer | ArrayBufferView): boolean;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const combined = new Uint8Array(new ArrayBuffer(size));
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function fixedLengthTimingSafeEqual(left: Uint8Array, right: Uint8Array): Promise<boolean> {
  const subtle = crypto.subtle as TimingSafeSubtleCrypto;
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(left, right);
  }

  // Both values are fixed-size HMAC digests. This fallback is for runtimes that
  // have not implemented SubtleCrypto.timingSafeEqual yet (including Node 20).
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

export function signatureInput(
  timestamp: string,
  nonce: string,
  rawBody: Uint8Array,
): Uint8Array<ArrayBuffer> {
  return concatBytes(encoder.encode(`${timestamp}\n${nonce}\n`), rawBody);
}

export async function createHmacSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  rawBody: Uint8Array | string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bodyBytes = typeof rawBody === "string" ? encoder.encode(rawBody) : rawBody;
  const digest = await crypto.subtle.sign("HMAC", key, signatureInput(timestamp, nonce, bodyBytes));
  return bytesToHex(new Uint8Array(digest));
}

export function readSignatureHeaders(request: Request): SignatureHeaders {
  const keyId = request.headers.get(SIGNATURE_HEADERS.keyId);
  const timestamp = request.headers.get(SIGNATURE_HEADERS.timestamp);
  const nonce = request.headers.get(SIGNATURE_HEADERS.nonce);
  const signatureHeader = request.headers.get(SIGNATURE_HEADERS.signature);

  if (!keyId || !timestamp || !nonce || !signatureHeader) {
    throw new HttpError(401, "missing_signature", "Signed ingest headers are required.");
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(keyId)) {
    throw new HttpError(401, "invalid_key_id", "The ingest key identifier is invalid.");
  }
  if (!/^[A-Za-z0-9._:-]{16,160}$/.test(nonce)) {
    throw new HttpError(401, "invalid_nonce", "The ingest nonce is invalid.");
  }

  const signature = signatureHeader.toLowerCase().startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  if (!hexToBytes(signature)) {
    throw new HttpError(401, "invalid_signature", "The ingest signature is invalid.");
  }

  return { keyId, timestamp, nonce, signature: signature.toLowerCase() };
}

export function assertTimestampInWindow(
  timestamp: string,
  options: SignatureWindowOptions,
): number {
  if (!/^(?:\d{10}|\d{13})$/.test(timestamp)) {
    throw new HttpError(401, "invalid_timestamp", "The ingest timestamp is invalid.");
  }
  const numericTimestamp = Number(timestamp);
  const timestampMs = timestamp.length === 13 ? numericTimestamp : numericTimestamp * 1_000;
  const delta = Math.abs(options.nowMs - timestampMs);
  if (!Number.isSafeInteger(numericTimestamp) || delta > options.replayWindowSeconds * 1_000) {
    throw new HttpError(401, "stale_timestamp", "The ingest timestamp is outside the replay window.");
  }
  return timestampMs;
}

export async function verifyHmacSignature(
  secret: string,
  headers: SignatureHeaders,
  rawBody: Uint8Array,
): Promise<boolean> {
  const expectedHex = await createHmacSignature(secret, headers.timestamp, headers.nonce, rawBody);
  const expected = hexToBytes(expectedHex);
  const provided = hexToBytes(headers.signature);
  if (!expected || !provided) return false;
  return fixedLengthTimingSafeEqual(expected, provided);
}

export async function verifyBearerToken(request: Request, expectedToken: string): Promise<void> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "missing_bearer", "A bearer token is required.");
  }

  const provided = encoder.encode(authorization.slice(7));
  const expected = encoder.encode(expectedToken);
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", provided),
    crypto.subtle.digest("SHA-256", expected),
  ]);
  if (!(await fixedLengthTimingSafeEqual(new Uint8Array(providedDigest), new Uint8Array(expectedDigest)))) {
    throw new HttpError(401, "invalid_bearer", "The bearer token is invalid.");
  }
}
