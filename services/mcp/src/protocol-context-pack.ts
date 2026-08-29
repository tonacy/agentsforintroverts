import { createHmac, timingSafeEqual } from "node:crypto";
import {
  canonicalJson,
  type ContextPack as KernelContextPack,
  type ContextPackItem,
  type PackTraceItem,
} from "../../context-kernel/dist/src/index.js";
import {
  CONTEXT_PACK_RECEIPT_SCHEMA,
  sealContextPack,
  validateContextPack,
  validateContextPackReceipt,
  type ContextPack as ProtocolContextPack,
  type ContextPackReceipt,
  type ContextPackSection,
  type ContextPackTraceItem,
  type EntityRef,
} from "../../../packages/protocol/dist/index.js";
import type { ContextEntityRef } from "./types.js";

const SECTION_ORDER = ["explicit", "observed", "inferred", "system"] as const;

export interface BuildProtocolContextPackInput {
  source_pack: KernelContextPack;
  ledger_id: string;
  owner_id: string;
  run_id: string;
  purpose: string;
  agent_role: string;
  token_budget: number;
  requested_refs: ContextEntityRef[];
  assembled_at: string;
  capabilities: string[];
}

export interface VerifyRefreshContextPackInput {
  previous_pack: unknown;
  context_pack_id: string;
  ledger_id: string;
  owner_id: string;
  run_id: string;
  agent_role: string;
}

/**
 * Wraps the kernel's deterministic local selection in the portable protocol
 * receipt. The outer hash binds why and for whom the selection was made; the
 * source-pack hash binds every selected body, scratch cue, constraint, and
 * omission without duplicating private text in the receipt.
 */
export function buildProtocolContextPack(
  input: BuildProtocolContextPackInput,
): ProtocolContextPack {
  const traceByKey = new Map(
    input.source_pack.trace.map((trace) => [traceKey(trace), trace]),
  );
  const protocolTrace: ContextPackTraceItem[] = [];
  const sections: ContextPackSection[] = [];

  for (const basis of SECTION_ORDER) {
    const items = input.source_pack.context[basis];
    const recordRefs: EntityRef[] = [];
    for (const item of items) {
      const trace = traceByKey.get(itemKey(item));
      if (!trace) {
        throw new TypeError(
          `Kernel Context Pack is missing trace for ${item.entity_type}:${item.entity_id}@${item.revision}`,
        );
      }
      const ref = exactRecordRef(item);
      recordRefs.push(ref);
      protocolTrace.push({
        ref,
        basis,
        event_id: trace.event_id,
        event_hash: canonicalHash(trace.event_hash),
      });
    }
    if (recordRefs.length > 0) {
      sections.push({
        key: basis,
        title: sectionTitle(basis),
        authority: basis === "system" ? "derived" : basis,
        record_refs: recordRefs,
      });
    }
  }

  if (protocolTrace.length !== input.source_pack.trace.length) {
    throw new TypeError("Kernel Context Pack trace contains an unselected durable record");
  }
  const watermark = input.source_pack.watermark;
  if (!watermark.last_event_id || !watermark.last_event_hash || watermark.sequence < 1) {
    throw new TypeError("A protocol Context Pack requires a non-empty ledger watermark");
  }

  const pack = sealContextPack({
    schema: "afi.context_pack.v1",
    owner_id: required(input.owner_id, "owner_id"),
    run_id: required(input.run_id, "run_id"),
    purpose: required(input.purpose, "purpose"),
    agent_role: required(input.agent_role, "agent_role"),
    derived: true,
    ledger_watermark: {
      ledger_id: required(input.ledger_id, "ledger_id"),
      sequence: watermark.sequence,
      event_id: watermark.last_event_id,
      event_hash: canonicalHash(watermark.last_event_hash),
    },
    token_budget: input.token_budget,
    requested_refs: input.requested_refs.map(requestedRef),
    source_pack: {
      schema: "afi.context_kernel_pack.v1",
      pack_hash: canonicalHash(input.source_pack.pack_hash),
    },
    sections,
    trace: protocolTrace,
    capabilities: [...new Set(input.capabilities)].sort(),
    omissions: omissionReceipts(input.source_pack),
    assembled_at: input.assembled_at,
  });
  const validation = validateContextPack(pack);
  if (!validation.ok) {
    throw new TypeError(
      `Generated protocol Context Pack is invalid: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return pack;
}

/**
 * Binding validation after the gateway has authenticated the workspace-key
 * receipt MAC. A pack hash provides integrity, not authenticity, so callers
 * must never use this function as the only refresh authorization check.
 */
export function verifyRefreshContextPack(
  input: VerifyRefreshContextPackInput,
): ProtocolContextPack {
  const validation = validateContextPack(input.previous_pack);
  if (!validation.ok) {
    throw new TypeError(
      `Previous Context Pack is invalid: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  const pack = validation.value;
  const bindings = [
    ["context_pack_id", input.context_pack_id, pack.pack_id],
    ["ledger_id", input.ledger_id, pack.ledger_watermark.ledger_id],
    ["owner_id", input.owner_id, pack.owner_id],
    ["run_id", input.run_id, pack.run_id],
    ["agent_role", input.agent_role, pack.agent_role],
  ] as const;
  const mismatch = bindings.find(([, actual, expected]) => actual !== expected);
  if (mismatch) {
    throw new TypeError(
      `Previous Context Pack ${mismatch[0]} mismatch: expected ${mismatch[2]}, received ${mismatch[1]}`,
    );
  }
  if (pack.expires_at && Date.parse(pack.expires_at) <= Date.now()) {
    throw new TypeError("Previous Context Pack has expired");
  }
  return pack;
}

export function signContextPackReceipt(
  pack: ProtocolContextPack,
  workspaceSecret: Uint8Array,
): ContextPackReceipt {
  return makeContextPackReceipt(pack, receiptMac(pack, workspaceSecret));
}

export function makeContextPackReceipt(
  pack: ProtocolContextPack,
  mac: string,
): ContextPackReceipt {
  const validation = validateContextPack(pack);
  if (!validation.ok) throw new TypeError("Cannot issue a receipt for an invalid Context Pack");
  if (!/^hmac-sha256:[a-f0-9]{64}$/.test(mac)) {
    throw new TypeError("Context Pack receipt MAC is invalid");
  }
  return {
    schema: CONTEXT_PACK_RECEIPT_SCHEMA,
    pack: validation.value,
    mac: mac as ContextPackReceipt["mac"],
  };
}

/** Shape and pack-hash validation only. Authenticate mac at the workspace boundary. */
export function parseContextPackReceipt(receiptInput: unknown): ContextPackReceipt {
  const validation = validateContextPackReceipt(receiptInput);
  if (!validation.ok) {
    throw new TypeError(
      `Context Pack receipt is invalid: ${validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return validation.value;
}

export function verifyContextPackReceipt(
  receiptInput: unknown,
  workspaceSecret: Uint8Array,
): ContextPackReceipt {
  const receipt = parseContextPackReceipt(receiptInput);
  const expected = receiptMac(receipt.pack, workspaceSecret);
  const actualBytes = Buffer.from(receipt.mac.slice("hmac-sha256:".length), "hex");
  const expectedBytes = Buffer.from(expected.slice("hmac-sha256:".length), "hex");
  if (actualBytes.byteLength !== expectedBytes.byteLength || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new TypeError("Context Pack receipt authentication failed");
  }
  return {
    schema: CONTEXT_PACK_RECEIPT_SCHEMA,
    pack: receipt.pack,
    mac: receipt.mac,
  };
}

function exactRecordRef(item: ContextPackItem): EntityRef {
  const body = parseBody(item);
  const recordHash = body.record_hash;
  if (typeof recordHash !== "string") {
    throw new TypeError(
      `Selected record ${item.entity_type}:${item.entity_id}@${item.revision} has no canonical record_hash`,
    );
  }
  const expected = {
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    revision: item.revision,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (body[key] !== value) {
      throw new TypeError(
        `Selected record ${item.entity_type}:${item.entity_id}@${item.revision} has a mismatched ${key}`,
      );
    }
  }
  return { ...expected, record_hash: canonicalHash(recordHash) };
}

function parseBody(item: ContextPackItem): Record<string, unknown> {
  if (!item.body) {
    throw new TypeError(
      `Selected protocol record ${item.entity_type}:${item.entity_id}@${item.revision} has no encrypted snapshot body`,
    );
  }
  const parsed = JSON.parse(item.body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Selected protocol record body must be a JSON object");
  }
  if (canonicalJson(parsed) !== item.body) {
    throw new TypeError("Selected protocol record body must use canonical JSON encoding");
  }
  return parsed as Record<string, unknown>;
}

function requestedRef(ref: ContextEntityRef): EntityRef {
  return {
    entity_type: required(ref.entity_type, "requested_refs.entity_type"),
    entity_id: required(ref.entity_id, "requested_refs.entity_id"),
    ...(ref.revision === undefined ? {} : { revision: ref.revision }),
    ...(ref.record_hash === undefined ? {} : { record_hash: canonicalHash(ref.record_hash) }),
  };
}

function omissionReceipts(pack: KernelContextPack): string[] {
  const details = pack.omissions.map((omission) => [
    omission.reason,
    omission.entity_type ?? "-",
    omission.entity_id ?? "-",
  ].join(":"));
  if (pack.omission_summary.total > pack.omission_summary.shown) {
    details.push(`details_truncated:${pack.omission_summary.shown}:${pack.omission_summary.total}`);
  }
  return [...new Set(details)].sort();
}

function itemKey(item: ContextPackItem): string {
  return `${item.entity_type}\u0000${item.entity_id}\u0000${item.revision}`;
}

function traceKey(trace: PackTraceItem): string {
  return `${trace.entity_type}\u0000${trace.entity_id}\u0000${trace.revision}`;
}

function canonicalHash(value: string): string {
  if (/^sha256:[a-f0-9]{64}$/.test(value)) return value;
  if (/^[a-f0-9]{64}$/.test(value)) return `sha256:${value}`;
  throw new TypeError("Expected a SHA-256 hash");
}

function required(value: string, label: string): string {
  if (!value.trim()) throw new TypeError(`${label} must be non-empty`);
  return value;
}

function sectionTitle(basis: typeof SECTION_ORDER[number]): string {
  switch (basis) {
    case "explicit": return "Explicit user context";
    case "observed": return "Observed evidence";
    case "inferred": return "Agent proposals and interpretations";
    case "system": return "Derived system context";
  }
}

function receiptMac(pack: ProtocolContextPack, workspaceSecret: Uint8Array): string {
  if (workspaceSecret.byteLength < 32) {
    throw new TypeError("Context Pack receipt secret must contain at least 32 bytes");
  }
  const receiptKey = createHmac("sha256", workspaceSecret)
    .update("afi.context-pack-receipt-key.v1", "utf8")
    .digest();
  const mac = createHmac("sha256", receiptKey)
    .update("afi.context-pack-receipt.v1\u0000", "utf8")
    .update(canonicalJson(pack), "utf8")
    .digest("hex");
  return `hmac-sha256:${mac}`;
}
