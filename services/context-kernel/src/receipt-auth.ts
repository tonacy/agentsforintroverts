import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { canonicalJson } from "./canonical.js";
import { ContextKernelError } from "./errors.js";
import type { WorkspacePaths } from "./workspace.js";

const RECEIPT_SCHEMA = "afi.context_pack_receipt.v1";
const MAC_PREFIX = "hmac-sha256:";

/** Authenticate a canonical derived pack without persisting it as memory. */
export async function signContextPackPayload(
  paths: WorkspacePaths,
  canonicalPayload: string,
): Promise<string> {
  assertCanonicalPayload(canonicalPayload);
  const key = await receiptKey(paths);
  return `${MAC_PREFIX}${createHmac("sha256", key)
    .update(`${RECEIPT_SCHEMA}\u0000`, "utf8")
    .update(canonicalPayload, "utf8")
    .digest("hex")}`;
}

export async function verifyContextPackPayload(
  paths: WorkspacePaths,
  canonicalPayload: string,
  mac: string,
): Promise<boolean> {
  assertCanonicalPayload(canonicalPayload);
  if (!/^hmac-sha256:[a-f0-9]{64}$/.test(mac)) return false;
  const expected = await signContextPackPayload(paths, canonicalPayload);
  const expectedBytes = Buffer.from(expected.slice(MAC_PREFIX.length), "hex");
  const actualBytes = Buffer.from(mac.slice(MAC_PREFIX.length), "hex");
  return actualBytes.byteLength === expectedBytes.byteLength
    && timingSafeEqual(actualBytes, expectedBytes);
}

function assertCanonicalPayload(payload: string): void {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (canonicalJson(parsed) !== payload) throw new Error("not canonical");
  } catch {
    throw new ContextKernelError(
      "RECEIPT_PAYLOAD_INVALID",
      "Context Pack receipt payload must be canonical JSON",
    );
  }
}

async function receiptKey(paths: WorkspacePaths): Promise<Buffer> {
  const rootKey = await readFile(paths.key);
  if (rootKey.byteLength !== 32) {
    throw new ContextKernelError("ENCRYPTION_KEY_INVALID", "Workspace key must be 32 bytes");
  }
  return createHmac("sha256", rootKey)
    .update("afi.context-pack-receipt-key.v1", "utf8")
    .digest();
}
