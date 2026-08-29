import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalJson,
  sha256,
  type ContextPack as KernelContextPack,
} from "../../../context-kernel/dist/src/index.js";
import {
  sealEntity,
  validateContextPack,
  type ContextStatement,
} from "../../../../packages/protocol/dist/index.js";
import {
  buildProtocolContextPack,
  signContextPackReceipt,
  verifyContextPackReceipt,
  verifyRefreshContextPack,
} from "../protocol-context-pack.js";

const WHEN = "2026-08-23T15:00:00.000Z";
const EVENT_ID = "evt_01M0S8P5K8T6D4F2J9N7Q3W1ZX";
const ENTITY_ID = "ctx_01M0S8P5K8T6D4F2J9N7Q3W1ZX";

test("portable Context Pack identity binds run, purpose, role, refs, and source selection", () => {
  const source = kernelPack();
  const base = {
    source_pack: source,
    ledger_id: "workspace_01M0S8P5K8T6D4F2J9N7Q3W1ZX",
    owner_id: "owner-tony",
    run_id: "run_01M0S8P5K8T6D4F2J9N7Q3W1ZX",
    purpose: "Find one low-noise place to contribute",
    agent_role: "afi.daily-conversation",
    token_budget: 4_096,
    requested_refs: [{ entity_type: "context_statement", entity_id: ENTITY_ID, revision: 1 }],
    assembled_at: WHEN,
    capabilities: ["search_entities", "get_entity"],
  };
  const pack = buildProtocolContextPack(base);
  assert.equal(validateContextPack(pack).ok, true);
  assert.match(pack.pack_id, /^pack_[a-f0-9]{64}$/);
  assert.equal(pack.source_pack.pack_hash, `sha256:${source.pack_hash}`);
  assert.equal(pack.trace[0]?.ref.record_hash, entity().record_hash);

  const mutations = [
    { ...base, run_id: "run_01M0S8P5K8T6D4F2J9N7Q3W1ZY" },
    { ...base, purpose: `${base.purpose} today` },
    { ...base, agent_role: "afi.common-ground" },
    { ...base, requested_refs: [] },
    { ...base, source_pack: { ...source, pack_hash: "f".repeat(64) } },
  ];
  for (const mutation of mutations) {
    assert.notEqual(buildProtocolContextPack(mutation).pack_id, pack.pack_id);
  }
});

test("portable Context Pack refuses missing or mismatched exact record traces", () => {
  const source = kernelPack();
  const input = {
    source_pack: source,
    ledger_id: "workspace_01M0S8P5K8T6D4F2J9N7Q3W1ZX",
    owner_id: "owner-tony",
    run_id: "run_01M0S8P5K8T6D4F2J9N7Q3W1ZX",
    purpose: "Daily conversation",
    agent_role: "afi.daily-conversation",
    token_budget: 4_096,
    requested_refs: [],
    assembled_at: WHEN,
    capabilities: [],
  };
  assert.throws(
    () => buildProtocolContextPack({ ...input, source_pack: { ...source, trace: [] } }),
    /missing trace/i,
  );
  const wrongBody = canonicalJson({ ...entity(), entity_id: "ctx_wrong" });
  assert.throws(
    () => buildProtocolContextPack({
      ...input,
      source_pack: {
        ...source,
        context: {
          ...source.context,
          explicit: [{ ...source.context.explicit[0]!, body: wrongBody }],
        },
      },
    }),
    /mismatched entity_id/i,
  );
});

test("refresh accepts a portable receipt across processes and rejects opaque or rebound packs", () => {
  const pack = buildProtocolContextPack({
    source_pack: kernelPack(),
    ledger_id: "workspace_01M0S8P5K8T6D4F2J9N7Q3W1ZX",
    owner_id: "owner-tony",
    run_id: "run_01M0S8P5K8T6D4F2J9N7Q3W1ZX",
    purpose: "Daily conversation",
    agent_role: "afi.daily-conversation",
    token_budget: 4_096,
    requested_refs: [],
    assembled_at: WHEN,
    capabilities: [],
  });
  const bound = {
    previous_pack: JSON.parse(JSON.stringify(pack)),
    context_pack_id: pack.pack_id,
    ledger_id: pack.ledger_watermark.ledger_id,
    owner_id: pack.owner_id,
    run_id: pack.run_id,
    agent_role: pack.agent_role,
  };
  assert.equal(verifyRefreshContextPack(bound).pack_id, pack.pack_id);
  assert.throws(
    () => verifyRefreshContextPack({ ...bound, previous_pack: { pack_id: pack.pack_id } }),
    /invalid/i,
  );
  assert.throws(
    () => verifyRefreshContextPack({ ...bound, context_pack_id: `pack_${"0".repeat(64)}` }),
    /context_pack_id mismatch/i,
  );
  assert.throws(
    () => verifyRefreshContextPack({ ...bound, run_id: "run_other" }),
    /run_id mismatch/i,
  );
  assert.throws(
    () => verifyRefreshContextPack({
      ...bound,
      previous_pack: { ...pack, purpose: "Rebound purpose" },
    }),
    /invalid/i,
  );
});

test("workspace-key receipt authenticates across processes and rejects a coherently rehashed forgery", () => {
  const secret = Buffer.alloc(32, 7);
  const pack = buildProtocolContextPack({
    source_pack: kernelPack(),
    ledger_id: "workspace_01M0S8P5K8T6D4F2J9N7Q3W1ZX",
    owner_id: "owner-tony",
    run_id: "run_01M0S8P5K8T6D4F2J9N7Q3W1ZX",
    purpose: "Daily conversation",
    agent_role: "afi.daily-conversation",
    token_budget: 4_096,
    requested_refs: [],
    assembled_at: WHEN,
    capabilities: [],
  });
  const receipt = signContextPackReceipt(pack, secret);
  assert.equal(verifyContextPackReceipt(JSON.parse(JSON.stringify(receipt)), secret).pack.pack_id, pack.pack_id);
  assert.throws(
    () => verifyContextPackReceipt(receipt, Buffer.alloc(32, 8)),
    /authentication failed/i,
  );

  const forgedPack = buildProtocolContextPack({
    source_pack: kernelPack(),
    ledger_id: pack.ledger_watermark.ledger_id,
    owner_id: pack.owner_id,
    run_id: pack.run_id,
    purpose: "A purpose chosen by the caller",
    agent_role: pack.agent_role,
    token_budget: pack.token_budget,
    requested_refs: [],
    assembled_at: pack.assembled_at,
    capabilities: [],
  });
  assert.equal(validateContextPack(forgedPack).ok, true);
  assert.throws(
    () => verifyContextPackReceipt({ ...receipt, pack: forgedPack }, secret),
    /authentication failed/i,
  );
});

function kernelPack(): KernelContextPack {
  const record = entity();
  const body = canonicalJson(record);
  const withoutHash: Omit<KernelContextPack, "pack_hash"> = {
    schema: "afi.context_kernel_pack.v1",
    watermark: {
      sequence: 3,
      event_count: 3,
      last_event_id: EVENT_ID,
      last_event_hash: "a".repeat(64),
      ledger_hash: "b".repeat(64),
    },
    constraints: {
      query: "Daily conversation",
      entity_types: ["context_statement"],
      bases: ["explicit"],
      max_items: 20,
      max_chars: 50_000,
      include_scratch: false,
    },
    context: {
      explicit: [{
        entity_type: "context_statement",
        entity_id: ENTITY_ID,
        revision: 1,
        basis: "explicit",
        kind: "context.statement.created",
        payload: { protocol_record_hash: record.record_hash },
        body,
        occurred_at: WHEN,
      }],
      observed: [],
      inferred: [],
      system: [],
      scratch: [],
    },
    trace: [{
      entity_type: "context_statement",
      entity_id: ENTITY_ID,
      revision: 1,
      event_id: EVENT_ID,
      event_hash: "a".repeat(64),
      basis: "explicit",
      source_refs: [],
    }],
    omissions: [],
    omission_summary: {
      total: 0,
      shown: 0,
      by_reason: {
        query_mismatch: 0,
        entity_type_filter: 0,
        basis_filter: 0,
        deleted: 0,
        missing_private_body: 0,
        item_limit: 0,
        character_limit: 0,
        scratch_expired: 0,
      },
    },
    selected_items: 1,
    selected_chars: body.length,
  };
  return { ...withoutHash, pack_hash: sha256(canonicalJson(withoutHash)) };
}

function entity() {
  return sealEntity<ContextStatement>({
    schema: "afi.context_statement.v1" as const,
    entity_type: "context_statement" as const,
    entity_id: ENTITY_ID,
    owner_id: "owner-tony",
    revision: 1,
    created_at: WHEN,
    updated_at: WHEN,
    created_by: { actor_type: "user" as const, actor_id: "owner-tony" },
    last_modified_by: { actor_type: "user" as const, actor_id: "owner-tony" },
    provenance: {
      basis: "explicit" as const,
      evidence_refs: [],
      human_seed_refs: [],
      derived_from_refs: [],
      external_refs: [],
      recorded_at: WHEN,
    },
    retention: {
      classification: "private" as const,
      mode: "durable" as const,
      replication: "local_only" as const,
      body_storage: "encrypted_object" as const,
    },
    basis: "explicit" as const,
    status: "active" as const,
    subject: "social participation",
    predicate: "publishing_discovery_boundary",
    value: "Publishing should stay separate from discovery.",
    scope: { kind: "project" as const, id: "agents-for-introverts" },
  });
}
