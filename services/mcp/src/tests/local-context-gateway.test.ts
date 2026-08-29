import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ContextKernel,
  canonicalJson,
  initializeContextWorkspace,
  sha256,
} from "../../../context-kernel/dist/src/index.js";
import {
  sealContextPack,
  type ContextPack as ProtocolContextPack,
} from "../../../../packages/protocol/dist/index.js";
import { LocalContextGateway } from "../local-context-gateway.js";
import { createQuietDeskServer } from "../server.js";
import type { QuietDeskGateway } from "../types.js";

const NOW = "2026-08-23T15:00:00.000Z";
const ROLE = "afi.daily-conversation";

function hubGateway(): QuietDeskGateway {
  const ok = async () => ({ ok: true });
  return {
    connectionState: () => ({ internalWriteConfigured: false }),
    health: async () => ({ status: "synthetic-test" }),
    listFeed: ok,
    getFeedItem: ok,
    listSources: ok,
    getSource: ok,
    observeSource: ok,
    publishFeedItem: ok,
    updateFeedItem: ok,
    withdrawFeedItem: ok,
    proposeAction: ok,
    recordFeedback: ok,
    completeRun: ok,
  };
}

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "afi-context-mcp-"));
  const root = join(parent, "workspace");
  await initializeContextWorkspace(root, {
    owner_id: "owner-test",
    created_at: NOW,
  });
  const gateway = await LocalContextGateway.open({
    root,
    actorId: "agent-roleplay-a",
    roles: [ROLE],
  });
  return { parent, root, gateway };
}

async function readWorkspaceBytesAsText(root: string): Promise<string> {
  const chunks: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) chunks.push((await readFile(path)).toString("utf8"));
    }
  };
  await visit(root);
  return chunks.join("\n");
}

async function seedExplicitGlobalStatement(
  kernel: ContextKernel,
  value: string,
  occurredAt: string,
): Promise<string> {
  const entityId = ContextKernel.newEntityId();
  const withoutHash = {
    schema: "afi.context_statement.v1",
    entity_type: "context_statement",
    entity_id: entityId,
    owner_id: "owner-test",
    revision: 1,
    created_at: occurredAt,
    updated_at: occurredAt,
    created_by: { actor_type: "user", actor_id: "owner-test" },
    last_modified_by: { actor_type: "user", actor_id: "owner-test" },
    provenance: {
      basis: "explicit",
      evidence_refs: [],
      human_seed_refs: [],
      derived_from_refs: [],
      external_refs: [],
      recorded_at: occurredAt,
    },
    retention: {
      classification: "private",
      mode: "durable",
      replication: "local_only",
      body_storage: "encrypted_object",
    },
    basis: "explicit",
    status: "active",
    subject: "cross-role calibration",
    predicate: "shared_principle",
    value,
    scope: { kind: "global" },
  };
  const entity = {
    ...withoutHash,
    record_hash: `sha256:${sha256(canonicalJson(withoutHash))}`,
  };
  await kernel.change({
    idempotency_key: `seed-explicit-${entityId}`,
    occurred_at: occurredAt,
    actor: { actor_type: "user", actor_id: "owner-test" },
    kind: "context.statement.user_recorded",
    basis: "explicit",
    entity_type: "context_statement",
    entity_id: entityId,
    expected_revision: 0,
    payload: { protocol_entity_schema: entity.schema, protocol_record_hash: entity.record_hash },
    body: canonicalJson(entity),
  });
  return entityId;
}

test("real local gateway is idempotent, searchable, bounded, and fail-closed", async (context) => {
  const { parent, root, gateway } = await fixture();
  context.after(() => rm(parent, { recursive: true, force: true }));

  const capabilities = await gateway.capabilities() as {
    shared_payload_shapes: { external_reference: { required: string[] } };
    proposal_contracts: {
      "context.statement.proposed": { invariants: string[] };
      "conversation.outcome.proposed": {
        nested_shapes: {
          outcome: { required: string[]; optional: string[]; allowed_disposition: string[] };
          participants: { min_items: number; item_shape: string };
        };
        invariants: string[];
      };
      "thread.proposed": { nested_shapes: { claims: { item_required: string[] } }; invariants: string[] };
      "selection.proposed": { nested_shapes: { candidates: { item_required: string[] } }; invariants: string[] };
      "place.proposed": { nested_shapes: { source_door: string }; allowed_values: { human_cost: string[] } };
    };
  };
  assert.deepEqual(capabilities.shared_payload_shapes.external_reference.required, ["provider", "kind", "external_id"]);
  assert.ok(capabilities.proposal_contracts["context.statement.proposed"].invariants.some((value) => value.includes("non-global")));
  assert.equal(capabilities.proposal_contracts["conversation.outcome.proposed"].nested_shapes.participants.min_items, 1);
  assert.deepEqual(capabilities.proposal_contracts["conversation.outcome.proposed"].nested_shapes.outcome.required, [
    "disposition", "summary", "learned", "uncertainties", "proposed_context_refs", "decision_refs",
    "thread_refs", "place_refs", "draft_refs", "action_refs", "carry_forward",
  ]);
  assert.ok(capabilities.proposal_contracts["conversation.outcome.proposed"].invariants.some((value) => value.includes("no_action_reason")));
  assert.deepEqual(capabilities.proposal_contracts["thread.proposed"].nested_shapes.claims.item_required, [
    "claim_id", "text", "evidence_refs", "first_seen_at", "last_seen_at", "occurrence_count",
  ]);
  assert.ok(capabilities.proposal_contracts["thread.proposed"].invariants.some((value) => value.includes("at least one evidence_item")));
  assert.ok(capabilities.proposal_contracts["selection.proposed"].invariants.some((value) => value.includes("evaluated_count")));
  assert.deepEqual(capabilities.proposal_contracts["selection.proposed"].nested_shapes.candidates.item_required, [
    "candidate_id", "label", "disposition", "rationale", "evidence_refs",
  ]);
  assert.equal(capabilities.proposal_contracts["place.proposed"].nested_shapes.source_door, "external_reference");
  assert.deepEqual(capabilities.proposal_contracts["place.proposed"].allowed_values.human_cost, ["low", "medium", "high"]);

  const openInput = {
    role: ROLE,
    goal: "Find one useful place to discuss feedless publishing",
    idempotency_key: "roleplay/open/one",
    bounds: { max_iterations: 8, context_budget_tokens: 4_096, source_limit: 4 },
  };
  const first = await gateway.openRun(openInput) as { run_id: string; duplicate: boolean };
  const retry = await gateway.openRun(openInput) as { run_id: string; duplicate: boolean };
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.run_id, first.run_id);

  const evidenceContent = {
    excerpt: "People want to publish planned ideas without entering an addictive discovery feed.",
  };
  const evidenceReceipt = await gateway.recordEvidence({
    run_id: first.run_id,
    evidence_id: "outside-source-one",
    evidence_class: "public_source",
    occurred_at: NOW,
    captured_at: NOW,
    content_hash: `sha256:${sha256(canonicalJson(evidenceContent))}`,
    content: evidenceContent,
    retention_class: "hub_eligible",
    source_url: "https://example.test/feedless-publishing",
    external_id: "post-1",
    provenance: [],
  }) as { entity: { entity_id: string; revision: number } };

  await assert.rejects(() => gateway.recordEvidence({
    run_id: first.run_id,
    evidence_id: "outside-source-bad-hash",
    evidence_class: "public_source",
    occurred_at: NOW,
    captured_at: NOW,
    content_hash: `sha256:${"0".repeat(64)}`,
    content: { excerpt: "This must be bound by its actual canonical hash." },
    retention_class: "hub_eligible",
    provenance: [],
  }), /content_hash mismatch/);

  const proposal = await gateway.appendContextEvent({
    run_id: first.run_id,
    event_id: "external-event-one",
    idempotency_key: "roleplay/proposal/one",
    kind: "context.statement.proposed",
    entity: { entity_type: "context_statement", entity_id: "external-context-one", expected_revision: 0 },
    occurred_at: NOW,
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "social participation",
      predicate: "benefits_from",
      value: "Separating publishing from discovery lowers the cost of participating.",
      scope: { kind: "domain", id: "social-publishing" },
    },
    provenance: [{
      ref: {
        entity_type: "evidence_item",
        entity_id: evidenceReceipt.entity.entity_id,
        revision: evidenceReceipt.entity.revision,
      },
      relation: "supported_by",
      observed_at: NOW,
    }],
  }) as { entity: { entity_id: string; revision: number } };

  await assert.rejects(() => gateway.appendContextEvent({
    run_id: first.run_id,
    event_id: "wrong-target-type",
    idempotency_key: "roleplay/wrong-target-type",
    kind: "draft.prepared",
    entity: { entity_type: "decision", entity_id: "wrong-target", expected_revision: 0 },
    occurred_at: NOW,
    payload: {},
    provenance: [],
  }), /must target entity type draft/);

  const filteredChanges = await gateway.getChanges({
    run_id: first.run_id,
    entity_types: ["context_statement"],
    limit: 1,
  }) as { events: Array<{ entity: { type: string } }>; cursor: string; scanned_events: number };
  assert.equal(filteredChanges.events[0]?.entity.type, "context_statement");
  assert.ok(filteredChanges.scanned_events >= 3, "cursor scanning must advance past nonmatching run/evidence events");
  assert.ok(filteredChanges.cursor);

  const foreignRoleGateway = await LocalContextGateway.open({
    root,
    actorId: "agent-roleplay-foreign-role",
    roles: ["afi.common-ground"],
  });
  await assert.rejects(() => foreignRoleGateway.recordEvidence({
    run_id: first.run_id,
    evidence_id: "cross-role-evidence",
    evidence_class: "public_source",
    occurred_at: NOW,
    captured_at: NOW,
    content_hash: `sha256:${sha256(canonicalJson({ excerpt: "cross role" }))}`,
    content: { excerpt: "cross role" },
    retention_class: "hub_eligible",
    provenance: [],
  }), /role is not authorized|Context role is not authorized/);

  const scratchObservedAt = new Date().toISOString();
  const scratchExpiresAt = new Date(Date.parse(scratchObservedAt) + 60 * 60 * 1_000).toISOString();
  const scratchInput = {
    run_id: first.run_id,
    cue_id: "browser-cue-one",
    cue_class: "computer_history",
    minimized_cue: "The day may have been fragmented; ask for calibration.",
    observed_at: scratchObservedAt,
    expires_at: scratchExpiresAt,
  };
  const scratchFirst = await gateway.recordScratchCue(scratchInput) as { duplicate: boolean; cue: { id: string } };
  const scratchRetry = await gateway.recordScratchCue(scratchInput) as { duplicate: boolean; cue: { id: string } };
  assert.equal(scratchFirst.duplicate, false);
  assert.equal(scratchRetry.duplicate, true);
  assert.equal(scratchRetry.cue.id, scratchFirst.cue.id);

  const search = await gateway.searchEntities({
    run_id: first.run_id,
    query: "social publishing discovery",
    entity_types: ["context_statement", "evidence_item", "thread"],
    statuses: ["active"],
    limit: 10,
  }) as { count: number; items: Array<{ entity_id: string }> };
  assert.ok(search.count >= 1);
  assert.ok(search.items.some((item) => item.entity_id === proposal.entity.entity_id));

  const pack = await gateway.assembleContext({
    run_id: first.run_id,
    role: ROLE,
    goal: openInput.goal,
    token_budget: 4_096,
    include_refs: [{ entity_type: "context_statement", entity_id: proposal.entity.entity_id }],
  }) as {
    context_pack_id: string;
    protocol_pack: ProtocolContextPack;
    context_pack_receipt: Record<string, unknown> & {
      schema: string;
      pack: ProtocolContextPack;
      mac: string;
    };
    derived: boolean;
    context: { observed: unknown[]; inferred: unknown[]; explicit: unknown[] };
    watermark: { event_count: number };
    requested_ref_trace: unknown[];
  };
  assert.equal(pack.derived, true);
  assert.equal(pack.context.observed.length, 1);
  assert.equal(pack.context.inferred.length, 1, "operational run records must not pollute context");
  assert.equal(pack.context.explicit.length, 0);
  assert.equal(pack.requested_ref_trace.length, 1);
  assert.equal(pack.watermark.event_count, 3);
  assert.equal(pack.protocol_pack.pack_id, pack.context_pack_id);
  assert.equal(pack.context_pack_receipt.pack.pack_id, pack.context_pack_id);
  const exactProposalRef = pack.protocol_pack.trace.find((trace) => (
    trace.ref.entity_type === "context_statement"
    && trace.ref.entity_id === proposal.entity.entity_id
  ))?.ref;
  assert.ok(exactProposalRef?.revision);
  assert.ok(exactProposalRef?.record_hash);

  await assert.rejects(() => gateway.assembleContext({
    run_id: first.run_id,
    role: ROLE,
    goal: "A caller-rebound purpose",
    token_budget: 4_096,
  }), /immutable open_run goal/i);
  await assert.rejects(() => gateway.assembleContext({
    run_id: first.run_id,
    role: ROLE,
    goal: openInput.goal,
    token_budget: 4_097,
  }), /exceeds open_run bound/i);
  await assert.rejects(() => gateway.assembleContext({
    run_id: first.run_id,
    role: ROLE,
    goal: openInput.goal,
    token_budget: 4_096,
    include_refs: [{
      entity_type: "context_statement",
      entity_id: proposal.entity.entity_id,
      revision: proposal.entity.revision,
      record_hash: `sha256:${"0".repeat(64)}`,
    }],
  }), /record_hash mismatch/i);

  const refreshHarness = await LocalContextGateway.open({
    root,
    actorId: "agent-roleplay-refresh-process",
    roles: [ROLE],
  });
  const refreshed = await refreshHarness.refreshContext({
    run_id: first.run_id,
    context_pack_id: pack.context_pack_id,
    previous_context_pack_receipt: pack.context_pack_receipt,
    after_event_id: pack.protocol_pack.ledger_watermark.event_id,
  }) as { context_pack_id: string; replaces_context_pack_id: string };
  assert.equal(refreshed.context_pack_id, pack.context_pack_id);
  assert.equal(refreshed.replaces_context_pack_id, pack.context_pack_id);

  const { pack_id: oldPackId, pack_hash: oldPackHash, ...oldPackBody } = pack.protocol_pack;
  assert.equal(oldPackId, pack.context_pack_id);
  assert.match(oldPackHash, /^sha256:[0-9a-f]{64}$/);
  const coherentlyResealedForgery = sealContextPack({
    ...oldPackBody,
    purpose: "A coherently rehashed caller purpose",
  });
  await assert.rejects(() => refreshHarness.refreshContext({
    run_id: first.run_id,
    context_pack_id: coherentlyResealedForgery.pack_id,
    previous_context_pack_receipt: {
      ...pack.context_pack_receipt,
      pack: coherentlyResealedForgery,
    },
  }), /authentication failed/i);
  await assert.rejects(() => refreshHarness.refreshContext({
    run_id: first.run_id,
    context_pack_id: `pack_${"0".repeat(64)}`,
    previous_context_pack_receipt: pack.context_pack_receipt,
  }), /context_pack_id mismatch/i);
  await assert.rejects(() => refreshHarness.refreshContext({
    run_id: first.run_id,
    context_pack_id: pack.context_pack_id,
    previous_context_pack_receipt: pack.context_pack_receipt,
    after_event_id: "evt_mismatched_authenticated_cursor",
  }), /must match the authenticated pack watermark/i);

  await assert.rejects(() => gateway.recordEvidence({
    run_id: first.run_id,
    evidence_id: "forged-human-capture",
    evidence_class: "human_capture",
    occurred_at: NOW,
    captured_at: NOW,
    content_hash: `sha256:${"b".repeat(64)}`,
    content: { words: "The agent must not turn this into Tony's words." },
    retention_class: "local_private",
    provenance: [],
  }), /evidence class is not authorized/);

  await assert.rejects(() => gateway.appendContextEvent({
    run_id: first.run_id,
    event_id: "forged-confirmation",
    idempotency_key: "roleplay/forged/confirmation",
    kind: "context.statement.confirmed",
    entity: { entity_type: "context_statement", entity_id: proposal.entity.entity_id, expected_revision: 1 },
    occurred_at: NOW,
    payload: { status: "confirmed" },
    provenance: [],
  }), /context event kind is not authorized/);

  const checkpoint = await gateway.checkpointRun({
    run_id: first.run_id,
    checkpoint_id: "checkpoint-one",
    completed_steps: ["recorded evidence", "assembled context"],
    remaining_steps: ["complete run"],
    next_step: "Record the bounded outcome",
    expected_run_revision: 1,
  }) as { entity: { revision: number } };
  assert.equal(checkpoint.entity.revision, 2);
  const afterCheckpoint = await gateway.assembleContext({
    run_id: first.run_id,
    role: ROLE,
    goal: openInput.goal,
    token_budget: 4_096,
  }) as { context_pack_id: string };
  assert.match(afterCheckpoint.context_pack_id, /^pack_[a-f0-9]{64}$/);

  await assert.rejects(() => gateway.completeContextRun({
    run_id: first.run_id,
    status: "completed" as const,
    summary: "A forged output reference must not complete a run.",
    output_refs: [{
      entity_type: "place",
      entity_id: ContextKernel.newEntityId(),
      revision: 1,
      record_hash: `sha256:${"0".repeat(64)}`,
    }],
    completed_steps: [],
    remaining_steps: [],
  }), /output reference not found/);
  await assert.rejects(() => gateway.completeContextRun({
    run_id: first.run_id,
    status: "completed" as const,
    summary: "An unbound output reference must not complete a run.",
    output_refs: [{ entity_type: "context_statement", entity_id: proposal.entity.entity_id }],
    completed_steps: [],
    remaining_steps: [],
  }), /require exact revision and record_hash/i);

  const completionInput = {
    run_id: first.run_id,
    status: "completed" as const,
    summary: "One bounded place was evaluated without external action.",
    output_refs: [exactProposalRef],
    completed_steps: ["recorded evidence", "assembled context", "recorded proposal"],
    remaining_steps: [],
  };
  const completed = await gateway.completeContextRun(completionInput) as {
    duplicate: boolean;
    event_id: string;
    entity: { revision: number };
  };
  assert.equal(completed.entity.revision, 3);
  assert.equal(completed.duplicate, false);
  const completionRetry = await gateway.completeContextRun(completionInput) as {
    duplicate: boolean;
    event_id: string;
    entity: { revision: number };
  };
  assert.equal(completionRetry.duplicate, true);
  assert.equal(completionRetry.event_id, completed.event_id);
  assert.equal(completionRetry.entity.revision, completed.entity.revision);
  await assert.rejects(() => gateway.completeContextRun({
    ...completionInput,
    summary: "Changed terminal summary must not be accepted.",
  }), /already terminal/);
  const canonicalEvents = await gateway.protocolLedgerEvents() as Array<{
    schema: string;
    sequence: number;
    target: { entity_type: string };
  }>;
  assert.deepEqual(canonicalEvents.map((event) => event.schema), ["afi.ledger_event.v1", "afi.ledger_event.v1"]);
  assert.deepEqual(canonicalEvents.map((event) => event.sequence), [1, 2]);
  assert.deepEqual(canonicalEvents.map((event) => event.target.entity_type), ["evidence_item", "context_statement"]);
  await assert.rejects(() => gateway.checkpointRun({
    run_id: first.run_id,
    checkpoint_id: "checkpoint-after-terminal",
    completed_steps: [],
    remaining_steps: [],
  }), /already terminal/);
  await assert.rejects(() => gateway.appendContextEvent({
    run_id: first.run_id,
    event_id: "proposal-after-terminal",
    idempotency_key: "roleplay/proposal/after-terminal",
    kind: "context.statement.proposed",
    entity: { entity_type: "context_statement", entity_id: "after-terminal", expected_revision: 0 },
    occurred_at: NOW,
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "terminal run",
      predicate: "cannot_write",
      value: true,
      scope: { kind: "global" },
    },
    provenance: [],
  }), /already terminal/);
  await assert.rejects(() => gateway.recordEvidence({
    run_id: first.run_id,
    evidence_id: "evidence-after-terminal",
    evidence_class: "public_source",
    occurred_at: NOW,
    captured_at: NOW,
    content_hash: `sha256:${sha256(canonicalJson({ excerpt: "terminal" }))}`,
    content: { excerpt: "terminal" },
    retention_class: "hub_eligible",
    provenance: [],
  }), /already terminal/);
  const terminalScratchObservedAt = new Date().toISOString();
  await assert.rejects(() => gateway.recordScratchCue({
    run_id: first.run_id,
    cue_id: "scratch-after-terminal",
    cue_class: "computer_history",
    minimized_cue: "A terminal run cannot gain new scratch context.",
    observed_at: terminalScratchObservedAt,
    expires_at: new Date(Date.parse(terminalScratchObservedAt) + 60_000).toISOString(),
  }), /already terminal/);
});

test("locators stay out of plaintext events and deleted entities disappear from portable export", async (context) => {
  const { parent, root, gateway } = await fixture();
  context.after(() => rm(parent, { recursive: true, force: true }));
  const opened = await gateway.openRun({
    role: ROLE,
    goal: "Capture bounded evidence without leaking source locators",
    idempotency_key: "locator-leak/open",
    bounds: { max_iterations: 4, context_budget_tokens: 2_048 },
  }) as { run_id: string };
  const anchorContent = { title: "Public anchor", excerpt: "A public structural reference." };
  const anchor = await gateway.recordEvidence({
    run_id: opened.run_id,
    evidence_id: "locator-anchor",
    evidence_class: "public_source",
    occurred_at: NOW,
    captured_at: NOW,
    content_hash: `sha256:${sha256(canonicalJson(anchorContent))}`,
    content: anchorContent,
    retention_class: "hub_eligible",
    provenance: [],
  }) as { entity: { entity_id: string; revision: number } };

  const urlToken = "AFI_URL_TOKEN_7F3B91";
  const fileToken = "AFI_FILE_TOKEN_4C8A27";
  const sourceUrl = `https://example.test/private?access_token=${urlToken}`;
  const locator = `file:///private/tmp/${fileToken}/daily-notes.md`;
  const privateContent = { title: "Locator-bound source", excerpt: "The locators belong only in the private snapshot." };
  const sensitive = await gateway.recordEvidence({
    run_id: opened.run_id,
    evidence_id: "locator-sensitive",
    evidence_class: "work_artifact",
    occurred_at: "2026-08-23T15:00:01.000Z",
    captured_at: "2026-08-23T15:00:01.000Z",
    content_hash: `sha256:${sha256(canonicalJson(privateContent))}`,
    content: privateContent,
    retention_class: "local_private",
    source_url: sourceUrl,
    provenance: [{
      ref: { entity_type: "evidence_item", entity_id: anchor.entity.entity_id, revision: anchor.entity.revision },
      relation: "located_from",
      locator,
      observed_at: NOW,
    }],
  }) as { entity: { entity_id: string; revision: number } };

  const kernel = await ContextKernel.open(root);
  const eventsBeforeDelete = await kernel.changes({ limit: 1_000 });
  const plaintextEvents = canonicalJson(eventsBeforeDelete);
  assert.doesNotMatch(plaintextEvents, new RegExp(urlToken));
  assert.doesNotMatch(plaintextEvents, new RegExp(fileToken));
  const sensitiveEvent = eventsBeforeDelete.find((event) => event.entity.id === sensitive.entity.entity_id);
  assert.ok(sensitiveEvent);
  assert.equal(sensitiveEvent.payload.source_url, undefined);
  assert.equal(typeof sensitiveEvent.payload.source_url_hash, "string");
  assert.ok(sensitiveEvent.source_refs.every((ref) => ref.url === undefined));
  const stored = await kernel.get("evidence_item", sensitive.entity.entity_id);
  assert.match(stored?.body ?? "", new RegExp(urlToken));
  assert.match(stored?.body ?? "", new RegExp(fileToken));

  const exportBeforeDelete = await gateway.protocolLedgerEvents() as Array<{
    target: { entity_id: string };
  }>;
  assert.ok(exportBeforeDelete.some((event) => event.target.entity_id === sensitive.entity.entity_id));

  await kernel.delete({
    entity_type: "evidence_item",
    entity_id: sensitive.entity.entity_id,
    expected_revision: sensitive.entity.revision,
    idempotency_key: "locator-leak-delete",
    actor: { actor_type: "user", actor_id: "owner-test" },
    occurred_at: "2026-08-23T15:00:02.000Z",
    reason_code: "owner_erasure",
  });
  const exportAfterDelete = await gateway.protocolLedgerEvents() as Array<{
    schema: string;
    target: { entity_id: string };
  }>;
  assert.ok(exportAfterDelete.every((event) => event.schema === "afi.ledger_event.v1"));
  assert.ok(!exportAfterDelete.some((event) => event.target.entity_id === sensitive.entity.entity_id));
  const workspaceText = await readWorkspaceBytesAsText(root);
  assert.doesNotMatch(workspaceText, new RegExp(urlToken));
  assert.doesNotMatch(workspaceText, new RegExp(fileToken));
});

test("role visibility is closed and purpose focus rejects unrelated same-role context", async (context) => {
  const { parent, root, gateway } = await fixture();
  context.after(() => rm(parent, { recursive: true, force: true }));
  const daily = await gateway.openRun({
    role: ROLE,
    goal: "Plan the orchard apple harvest",
    idempotency_key: "role-focus/daily",
    bounds: { max_iterations: 8, context_budget_tokens: 4_096 },
  }) as { run_id: string };
  const foreignGateway = await LocalContextGateway.open({
    root,
    actorId: "agent-common-ground",
    roles: ["afi.common-ground"],
  });
  const foreign = await foreignGateway.openRun({
    role: "afi.common-ground",
    goal: "Inspect role visibility marker discussions",
    idempotency_key: "role-focus/foreign",
    bounds: { max_iterations: 8, context_budget_tokens: 4_096 },
  }) as { run_id: string };

  const orchardContent = {
    title: "Orchard apple harvest role visibility marker",
    excerpt: "The orchard apple harvest needs a low-cost planning note.",
  };
  const orchard = await gateway.recordEvidence({
    run_id: daily.run_id,
    evidence_id: "orchard-evidence",
    evidence_class: "work_artifact",
    occurred_at: NOW,
    captured_at: NOW,
    content_hash: `sha256:${sha256(canonicalJson(orchardContent))}`,
    content: orchardContent,
    retention_class: "local_private",
    provenance: [],
  }) as { entity: { entity_id: string; revision: number } };
  const quantumContent = {
    title: "Quantum topology notes",
    excerpt: "Entanglement topology and qubit routing remain experimental.",
  };
  const quantum = await gateway.recordEvidence({
    run_id: daily.run_id,
    evidence_id: "quantum-evidence",
    evidence_class: "work_artifact",
    occurred_at: "2026-08-23T15:00:01.000Z",
    captured_at: "2026-08-23T15:00:01.000Z",
    content_hash: `sha256:${sha256(canonicalJson(quantumContent))}`,
    content: quantumContent,
    retention_class: "local_private",
    provenance: [],
  }) as { entity: { entity_id: string; revision: number } };
  const quantumStatement = await gateway.appendContextEvent({
    run_id: daily.run_id,
    event_id: "quantum-statement",
    idempotency_key: "role-focus/quantum-statement",
    kind: "context.statement.proposed",
    entity: { entity_type: "context_statement", entity_id: "quantum-statement", expected_revision: 0 },
    occurred_at: "2026-08-23T15:00:02.000Z",
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "qubit routing",
      predicate: "uses",
      value: "quantum entanglement topology",
      scope: { kind: "domain", id: "quantum-computing" },
    },
    provenance: [{
      ref: { entity_type: "evidence_item", entity_id: quantum.entity.entity_id, revision: quantum.entity.revision },
      relation: "supported_by",
    }],
  }) as { entity: { entity_id: string } };
  await assert.rejects(() => foreignGateway.appendContextEvent({
    run_id: foreign.run_id,
    event_id: "cross-role-target-takeover",
    idempotency_key: "role-focus/cross-role-target-takeover",
    kind: "context.statement.proposed",
    entity: {
      entity_type: "context_statement",
      entity_id: quantumStatement.entity.entity_id,
      expected_revision: 1,
    },
    occurred_at: "2026-08-23T15:00:02.500Z",
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "cross-role target",
      predicate: "cannot_take_over",
      value: false,
      scope: { kind: "domain", id: "role-isolation" },
    },
    provenance: [],
  }), /target is not visible to run role|different origin role/i);
  const retainedDailyTarget = await gateway.getEntity({
    run_id: daily.run_id,
    ref: { entity_type: "context_statement", entity_id: quantumStatement.entity.entity_id },
  }) as { revision: number };
  assert.equal(retainedDailyTarget.revision, 1);
  await assert.rejects(() => foreignGateway.getEntity({
    run_id: foreign.run_id,
    ref: { entity_type: "context_statement", entity_id: quantumStatement.entity.entity_id },
  }), /not visible to run role/i);
  const scratchAt = new Date().toISOString();
  const scratch = await gateway.recordScratchCue({
    run_id: daily.run_id,
    cue_id: "quantum-scratch",
    cue_class: "computer_history",
    minimized_cue: "Quantum qubit topology reading occupied a browser tab.",
    observed_at: scratchAt,
    expires_at: new Date(Date.parse(scratchAt) + 60 * 60 * 1_000).toISOString(),
  }) as { cue: { id: string } };

  const foreignContent = {
    title: "Foreign role visibility marker",
    excerpt: "This record belongs to a different agent role.",
  };
  const foreignEvidence = await foreignGateway.recordEvidence({
    run_id: foreign.run_id,
    evidence_id: "foreign-evidence",
    evidence_class: "public_source",
    occurred_at: "2026-08-23T15:00:03.000Z",
    captured_at: "2026-08-23T15:00:03.000Z",
    content_hash: `sha256:${sha256(canonicalJson(foreignContent))}`,
    content: foreignContent,
    retention_class: "hub_eligible",
    provenance: [],
  }) as { entity: { entity_id: string; revision: number } };
  const foreignThread = await foreignGateway.appendContextEvent({
    run_id: foreign.run_id,
    event_id: "foreign-thread",
    idempotency_key: "role-focus/foreign-thread",
    kind: "thread.proposed",
    entity: { entity_type: "thread", entity_id: "foreign-thread", expected_revision: 0 },
    occurred_at: "2026-08-23T15:00:04.000Z",
    payload: {
      title: "Foreign visibility discussion",
      summary: "A synthetic Thread owned by another role.",
      status: "watching",
      claims: [{
        claim_id: "foreign-claim",
        text: "The foreign role has its own bounded evidence.",
        evidence_refs: [{
          entity_type: "evidence_item",
          entity_id: foreignEvidence.entity.entity_id,
          revision: foreignEvidence.entity.revision,
        }],
        first_seen_at: "2026-08-23T15:00:03.000Z",
        last_seen_at: "2026-08-23T15:00:03.000Z",
        occurrence_count: 1,
      }],
      context_refs: [],
      participant_refs: [],
      first_seen_at: "2026-08-23T15:00:03.000Z",
      last_seen_at: "2026-08-23T15:00:03.000Z",
    },
    provenance: [{
      ref: { entity_type: "evidence_item", entity_id: foreignEvidence.entity.entity_id, revision: foreignEvidence.entity.revision },
      relation: "supported_by",
    }],
  }) as { entity: { entity_id: string } };

  const kernel = await ContextKernel.open(root);
  const explicitId = await seedExplicitGlobalStatement(
    kernel,
    "A trusted global role visibility marker is available to every agent role.",
    "2026-08-23T15:00:05.000Z",
  );

  const search = await gateway.searchEntities({
    run_id: daily.run_id,
    query: "role visibility marker",
    limit: 50,
  }) as { items: Array<{ entity_type: string; entity_id: string }> };
  assert.ok(search.items.every((item) => item.entity_type !== "run"));
  assert.ok(search.items.some((item) => item.entity_id === orchard.entity.entity_id));
  assert.ok(search.items.some((item) => item.entity_id === explicitId));
  assert.ok(!search.items.some((item) => item.entity_id === foreignEvidence.entity.entity_id));
  await assert.rejects(() => gateway.getEntity({
    run_id: daily.run_id,
    ref: { entity_type: "run", entity_id: daily.run_id },
  }), /not visible through this bridge/);
  await assert.rejects(() => gateway.getEntity({
    run_id: daily.run_id,
    ref: { entity_type: "evidence_item", entity_id: foreignEvidence.entity.entity_id },
  }), /not visible to run role/);
  const dailyExplicit = await gateway.getEntity({
    run_id: daily.run_id,
    ref: { entity_type: "context_statement", entity_id: explicitId },
  }) as { entity_id: string };
  const foreignExplicit = await foreignGateway.getEntity({
    run_id: foreign.run_id,
    ref: { entity_type: "context_statement", entity_id: explicitId },
  }) as { entity_id: string };
  assert.equal(dailyExplicit.entity_id, explicitId);
  assert.equal(foreignExplicit.entity_id, explicitId);

  await assert.rejects(() => gateway.appendContextEvent({
    run_id: daily.run_id,
    event_id: "cross-role-provenance",
    idempotency_key: "role-focus/cross-role-provenance",
    kind: "context.statement.proposed",
    entity: { entity_type: "context_statement", entity_id: "cross-role-provenance", expected_revision: 0 },
    occurred_at: "2026-08-23T15:00:06.000Z",
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "cross-role",
      predicate: "must_not_read",
      value: true,
      scope: { kind: "global" },
    },
    provenance: [{
      ref: { entity_type: "evidence_item", entity_id: foreignEvidence.entity.entity_id, revision: foreignEvidence.entity.revision },
      relation: "supported_by",
    }],
  }), /not visible to run role/);
  await assert.rejects(() => gateway.appendContextEvent({
    run_id: daily.run_id,
    event_id: "cross-role-semantic",
    idempotency_key: "role-focus/cross-role-semantic",
    kind: "place.proposed",
    entity: { entity_type: "place", entity_id: "cross-role-place", expected_revision: 0 },
    occurred_at: "2026-08-23T15:00:06.000Z",
    payload: {
      thread_ref: { entity_type: "thread", entity_id: foreignThread.entity.entity_id },
      title: "Cross-role Place",
      source_door: { provider: "synthetic", kind: "thread", external_id: "foreign", uri: "https://example.test/foreign" },
      opportunity: "Must remain unavailable across roles.",
      contribution: "None.",
      people_refs: [],
      next_move: "Do not act.",
      human_cost: "low",
      status: "proposed",
      expires_at: "2026-08-30T16:00:00.000Z",
    },
    provenance: [{
      ref: { entity_type: "evidence_item", entity_id: orchard.entity.entity_id, revision: orchard.entity.revision },
      relation: "bounded_by",
    }],
  }), /not visible to run role/);
  await assert.rejects(() => gateway.completeContextRun({
    run_id: daily.run_id,
    status: "completed",
    summary: "A hidden output cannot complete this run.",
    output_refs: [{ entity_type: "thread", entity_id: foreignThread.entity.entity_id }],
    completed_steps: [],
    remaining_steps: [],
  }), /not visible to run role/);

  const pack = await gateway.assembleContext({
    run_id: daily.run_id,
    role: ROLE,
    goal: "Plan the orchard apple harvest",
    token_budget: 4_096,
  }) as {
    context: {
      explicit: Array<{ entity_id: string }>;
      observed: Array<{ entity_id: string }>;
      inferred: Array<{ entity_id: string }>;
      scratch: Array<{ id: string }>;
    };
  };
  assert.ok(pack.context.explicit.some((item) => item.entity_id === explicitId));
  assert.ok(pack.context.observed.some((item) => item.entity_id === orchard.entity.entity_id));
  assert.ok(!pack.context.observed.some((item) => item.entity_id === quantum.entity.entity_id));
  assert.ok(!pack.context.observed.some((item) => item.entity_id === foreignEvidence.entity.entity_id));
  assert.ok(!pack.context.inferred.some((item) => item.entity_id === quantumStatement.entity.entity_id));
  assert.ok(!pack.context.scratch.some((item) => item.id === scratch.cue.id));

  const changes = await gateway.getChanges({ run_id: daily.run_id, limit: 100 }) as {
    events: Array<{ entity: { id: string; type: string } }>;
  };
  assert.ok(changes.events.every((event) => event.entity.type !== "run"));
  assert.ok(!changes.events.some((event) => event.entity.id === foreignEvidence.entity.entity_id));
  assert.ok(!changes.events.some((event) => event.entity.id === foreignThread.entity.entity_id));

  await kernel.delete({
    entity_type: "evidence_item",
    entity_id: foreignEvidence.entity.entity_id,
    expected_revision: foreignEvidence.entity.revision,
    idempotency_key: "role-focus-delete-foreign",
    actor: { actor_type: "user", actor_id: "owner-test" },
    occurred_at: "2026-08-23T15:00:07.000Z",
    reason_code: "synthetic_cleanup",
  });
  const foreignDeleted = await foreignGateway.getEntity({
    run_id: foreign.run_id,
    ref: { entity_type: "evidence_item", entity_id: foreignEvidence.entity.entity_id },
  }) as { status: string };
  assert.equal(foreignDeleted.status, "deleted");
  const changesAfterForeignDeletion = await gateway.getChanges({ run_id: daily.run_id, limit: 100 }) as {
    events: Array<{ entity: { id: string } }>;
  };
  assert.ok(!changesAfterForeignDeletion.events.some((event) => event.entity.id === foreignEvidence.entity.entity_id));
});

test("get_entity resolves immutable historical revisions and keeps current reads current", async (context) => {
  const { parent, root, gateway } = await fixture();
  context.after(() => rm(parent, { recursive: true, force: true }));
  const opened = await gateway.openRun({
    role: ROLE,
    goal: "Verify revision-bound context drill-down",
    idempotency_key: "historical-get/open",
    bounds: { max_iterations: 4, context_budget_tokens: 2_048 },
  }) as { run_id: string };
  const created = await gateway.appendContextEvent({
    run_id: opened.run_id,
    event_id: "historical-get-created",
    idempotency_key: "historical-get/create",
    kind: "context.statement.proposed",
    entity: { entity_type: "context_statement", entity_id: "historical-get-statement", expected_revision: 0 },
    occurred_at: NOW,
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "revision drill-down",
      predicate: "version",
      value: "revision one",
      scope: { kind: "project", id: "context-kernel" },
    },
    provenance: [],
  }) as { event_id: string; event_hash: string; entity: { entity_id: string; revision: number } };
  const kernel = await ContextKernel.open(root);
  const revisionOne = await kernel.get("context_statement", created.entity.entity_id);
  assert.ok(revisionOne?.body);
  const original = JSON.parse(revisionOne.body) as Record<string, unknown>;
  const correctionAt = "2026-08-23T15:00:01.000Z";
  const revisedWithoutHash: Record<string, unknown> = {
    ...original,
    revision: 2,
    updated_at: correctionAt,
    last_modified_by: gateway.actor,
    provenance: {
      ...(original.provenance as Record<string, unknown>),
      recorded_at: correctionAt,
    },
    value: "revision two corrected",
  };
  delete revisedWithoutHash.record_hash;
  const revised: Record<string, unknown> = {
    ...revisedWithoutHash,
    record_hash: `sha256:${sha256(canonicalJson(revisedWithoutHash))}`,
  };
  await kernel.correct({
    idempotency_key: "historical-get-correct",
    occurred_at: correctionAt,
    actor: gateway.actor,
    kind: "context.statement.corrected",
    basis: "inferred",
    entity_type: "context_statement",
    entity_id: created.entity.entity_id,
    expected_revision: 1,
    payload: {
      ...revisionOne.payload,
      protocol_entity_schema: String(revised["schema"]),
      protocol_record_hash: String(revised["record_hash"]),
      reason_code: "synthetic_correction",
    },
    body: canonicalJson(revised),
    source_refs: revisionOne.source_refs,
    supersedes_event_id: revisionOne.event_id,
  });

  const current = await gateway.getEntity({
    run_id: opened.run_id,
    ref: { entity_type: "context_statement", entity_id: created.entity.entity_id },
  }) as { revision: number; event_id: string; body: string; historical?: boolean };
  assert.equal(current.revision, 2);
  assert.equal(current.historical, undefined);
  assert.match(current.body, /revision two corrected/);
  const explicitlyCurrent = await gateway.getEntity({
    run_id: opened.run_id,
    ref: { entity_type: "context_statement", entity_id: created.entity.entity_id, revision: 2 },
  }) as { revision: number; historical?: boolean };
  assert.equal(explicitlyCurrent.revision, 2);
  assert.equal(explicitlyCurrent.historical, undefined);

  const historical = await gateway.getEntity({
    run_id: opened.run_id,
    ref: {
      entity_type: "context_statement",
      entity_id: created.entity.entity_id,
      revision: 1,
      record_hash: String(original.record_hash),
    },
  }) as {
    historical: boolean;
    current_revision: number;
    revision: number;
    event_id: string;
    event_hash: string;
    body_state: string;
    body: string;
  };
  assert.equal(historical.historical, true);
  assert.equal(historical.current_revision, 2);
  assert.equal(historical.revision, 1);
  assert.equal(historical.event_id, created.event_id);
  assert.equal(historical.event_hash, created.event_hash);
  assert.equal(historical.body_state, "present");
  assert.match(historical.body, /revision one/);
  assert.doesNotMatch(historical.body, /revision two corrected/);
  await assert.rejects(() => gateway.assembleContext({
    run_id: opened.run_id,
    role: ROLE,
    goal: "Verify revision-bound context drill-down",
    token_budget: 2_048,
    include_refs: [{
      entity_type: "context_statement",
      entity_id: created.entity.entity_id,
      revision: 1,
      record_hash: String(original.record_hash),
    }],
  }), /must name the current revision/i);
  await assert.rejects(() => gateway.getEntity({
    run_id: opened.run_id,
    ref: {
      entity_type: "context_statement",
      entity_id: created.entity.entity_id,
      revision: 2,
      record_hash: String(original.record_hash),
    },
  }), /record_hash mismatch/i);
  await assert.rejects(() => gateway.getEntity({
    run_id: opened.run_id,
    ref: { entity_type: "context_statement", entity_id: created.entity.entity_id, revision: 99 },
  }), /historical reference not found/);
});

test("budget pressure never separates an inferred record from its cited evidence", async (context) => {
  const { parent, gateway } = await fixture();
  context.after(() => rm(parent, { recursive: true, force: true }));
  const goal = "Assess orchard dependency closure candidates";
  const opened = await gateway.openRun({
    role: ROLE,
    goal,
    idempotency_key: "dependency-closure/open",
    bounds: { max_iterations: 32, context_budget_tokens: 4_096 },
  }) as { run_id: string };

  const evidenceIds = new Set<string>();
  for (let index = 0; index < 7; index += 1) {
    const occurredAt = new Date(Date.parse(NOW) + (index * 2 + 1) * 1_000).toISOString();
    const content = {
      title: `Support marker ${index}`,
      excerpt: `Synthetic supporting observation ${index}; intentionally lacks purpose terms.`,
    };
    const evidence = await gateway.recordEvidence({
      run_id: opened.run_id,
      evidence_id: `dependency-evidence-${index}`,
      evidence_class: "work_artifact",
      occurred_at: occurredAt,
      captured_at: occurredAt,
      content_hash: `sha256:${sha256(canonicalJson(content))}`,
      content,
      retention_class: "local_private",
      provenance: [],
    }) as { entity: { entity_id: string; revision: number } };
    evidenceIds.add(evidence.entity.entity_id);
    await gateway.appendContextEvent({
      run_id: opened.run_id,
      event_id: `dependency-statement-${index}`,
      idempotency_key: `dependency-closure/statement/${index}`,
      kind: "context.statement.proposed",
      entity: {
        entity_type: "context_statement",
        entity_id: `dependency-statement-${index}`,
        expected_revision: 0,
      },
      occurred_at: new Date(Date.parse(occurredAt) + 1_000).toISOString(),
      payload: {
        basis: "inferred",
        status: "proposed",
        subject: `orchard dependency closure candidate ${index}`,
        predicate: "is_supported_by",
        value: `support marker ${index}`,
        scope: { kind: "project", id: "context-kernel" },
      },
      provenance: [{
        ref: {
          entity_type: "evidence_item",
          entity_id: evidence.entity.entity_id,
          revision: evidence.entity.revision,
        },
        relation: "supported_by",
      }],
    });
  }

  const pack = await gateway.assembleContext({
    run_id: opened.run_id,
    role: ROLE,
    goal,
    token_budget: 4_096,
  }) as {
    selected_items: number;
    context: {
      observed: Array<{ entity_id: string }>;
      inferred: Array<{ entity_id: string; body?: string }>;
    };
  };
  assert.ok(pack.context.inferred.length > 0);
  assert.ok(pack.selected_items <= 10);
  const selectedEvidence = new Set(pack.context.observed.map((item) => item.entity_id));
  for (const statement of pack.context.inferred) {
    const body = JSON.parse(statement.body ?? "{}") as {
      provenance?: { evidence_refs?: Array<{ entity_id: string }> };
    };
    const refs = body.provenance?.evidence_refs ?? [];
    assert.ok(refs.length > 0, `selected inference ${statement.entity_id} must cite evidence`);
    for (const ref of refs) {
      assert.ok(evidenceIds.has(ref.entity_id));
      assert.ok(selectedEvidence.has(ref.entity_id), `missing selected evidence ${ref.entity_id}`);
    }
  }
});

test("authenticated refresh rejects a requested entity after its exact revision changes", async (context) => {
  const { parent, gateway } = await fixture();
  context.after(() => rm(parent, { recursive: true, force: true }));
  const goal = "Keep exact requested refresh inputs coherent";
  const opened = await gateway.openRun({
    role: ROLE,
    goal,
    idempotency_key: "stale-refresh/open",
    bounds: { max_iterations: 8, context_budget_tokens: 4_096 },
  }) as { run_id: string };
  const created = await gateway.appendContextEvent({
    run_id: opened.run_id,
    event_id: "stale-refresh-created",
    idempotency_key: "stale-refresh/create",
    kind: "context.statement.proposed",
    entity: { entity_type: "context_statement", entity_id: "stale-refresh-statement", expected_revision: 0 },
    occurred_at: NOW,
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "exact requested refresh inputs",
      predicate: "revision",
      value: "one",
      scope: { kind: "project", id: "context-kernel" },
    },
    provenance: [],
  }) as { entity: { entity_id: string; revision: number } };
  const current = await gateway.getEntity({
    run_id: opened.run_id,
    ref: { entity_type: "context_statement", entity_id: created.entity.entity_id },
  }) as { body: string };
  const recordHash = String((JSON.parse(current.body) as Record<string, unknown>).record_hash);
  const pack = await gateway.assembleContext({
    run_id: opened.run_id,
    role: ROLE,
    goal,
    token_budget: 4_096,
    include_refs: [{
      entity_type: "context_statement",
      entity_id: created.entity.entity_id,
      revision: 1,
      record_hash: recordHash,
    }],
  }) as {
    context_pack_id: string;
    context_pack_receipt: Record<string, unknown>;
  };
  await gateway.appendContextEvent({
    run_id: opened.run_id,
    event_id: "stale-refresh-revised",
    idempotency_key: "stale-refresh/revise",
    kind: "context.statement.proposed",
    entity: {
      entity_type: "context_statement",
      entity_id: created.entity.entity_id,
      expected_revision: 1,
    },
    occurred_at: "2026-08-23T15:00:01.000Z",
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "exact requested refresh inputs",
      predicate: "revision",
      value: "two",
      scope: { kind: "project", id: "context-kernel" },
    },
    provenance: [],
  });
  await assert.rejects(() => gateway.refreshContext({
    run_id: opened.run_id,
    context_pack_id: pack.context_pack_id,
    previous_context_pack_receipt: pack.context_pack_receipt,
  }), /must name the current revision/i);
});

test("two harness instances observe a human correction and cannot overwrite it", async (context) => {
  const { parent, root, gateway } = await fixture();
  context.after(() => rm(parent, { recursive: true, force: true }));
  const server = createQuietDeskServer(hubGateway(), gateway);
  const client = new Client({ name: "roleplay-harness-a", version: "1.0.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  context.after(async () => {
    await client.close();
    await server.close();
  });

  const opened = await client.callTool({
    name: "open_run",
    arguments: {
      role: ROLE,
      goal: "Calibrate the daily conversation",
      idempotency_key: "roleplay/open/two",
      bounds: { max_iterations: 5, context_budget_tokens: 4_096 },
    },
  });
  assert.equal(opened.isError, undefined);
  const runId = String((opened.structuredContent as { run_id: string }).run_id);

  const proposed = await client.callTool({
    name: "append_context_event",
    arguments: {
      run_id: runId,
      event_id: "harness-a-proposal",
      idempotency_key: "roleplay/context/two",
      kind: "context.statement.proposed",
      entity: { entity_type: "context_statement", entity_id: "harness-context-two", expected_revision: 0 },
      occurred_at: NOW,
      payload: {
        basis: "inferred",
        status: "proposed",
        subject: "daily conversation",
        predicate: "default_depth",
        value: "deep",
        scope: { kind: "project", id: "agents-for-introverts" },
      },
      provenance: [],
    },
  });
  assert.equal(proposed.isError, undefined);
  const entityId = String((proposed.structuredContent as {
    entity: { entity_id: string };
  }).entity.entity_id);

  const kernel = await ContextKernel.open(root);
  const explicitId = ContextKernel.newEntityId();
  const explicitAt = "2026-08-23T15:01:00.000Z";
  const explicitWithoutHash = {
    schema: "afi.context_statement.v1",
    entity_type: "context_statement",
    entity_id: explicitId,
    owner_id: "owner-test",
    revision: 1,
    created_at: explicitAt,
    updated_at: explicitAt,
    created_by: { actor_type: "user", actor_id: "owner-test" },
    last_modified_by: { actor_type: "user", actor_id: "owner-test" },
    provenance: {
      basis: "explicit",
      evidence_refs: [],
      human_seed_refs: [],
      derived_from_refs: [{ entity_type: "context_statement", entity_id: entityId, revision: 1 }],
      external_refs: [],
      recorded_at: explicitAt,
    },
    retention: {
      classification: "private",
      mode: "durable",
      replication: "local_only",
      body_storage: "encrypted_object",
    },
    basis: "explicit",
    status: "active",
    subject: "daily conversation",
    predicate: "depth_selection",
    value: "Choose the depth each day; today's mode is short.",
    scope: { kind: "project", id: "agents-for-introverts" },
    supersedes: { entity_type: "context_statement", entity_id: entityId, revision: 1 },
  };
  const explicitEntity = {
    ...explicitWithoutHash,
    record_hash: `sha256:${sha256(canonicalJson(explicitWithoutHash))}`,
  };
  await kernel.change({
    idempotency_key: "human-correction-two",
    occurred_at: explicitAt,
    actor: { actor_type: "user", actor_id: "owner-test" },
    kind: "context.statement.user_recorded",
    basis: "explicit",
    entity_type: "context_statement",
    entity_id: explicitId,
    expected_revision: 0,
    payload: { protocol_entity_schema: explicitEntity.schema, protocol_record_hash: explicitEntity.record_hash },
    body: canonicalJson(explicitEntity),
  });

  const firstPack = await gateway.assembleContext({
    run_id: runId,
    role: ROLE,
    goal: "Calibrate the daily conversation",
    token_budget: 4_096,
  }) as { context_pack_id: string; context: { explicit: Array<{ body?: string }> } };
  assert.equal(firstPack.context.explicit.length, 1);
  assert.match(firstPack.context.explicit[0]?.body ?? "", /Choose the depth each day/);

  const secondHarness = await LocalContextGateway.open({
    root,
    actorId: "agent-roleplay-b",
    roles: [ROLE],
  });
  const secondPack = await secondHarness.assembleContext({
    run_id: runId,
    role: ROLE,
    goal: "Calibrate the daily conversation",
    token_budget: 4_096,
  }) as { context_pack_id: string; context: { explicit: Array<{ body?: string }> } };
  assert.equal(secondPack.context_pack_id, firstPack.context_pack_id);
  assert.match(secondPack.context.explicit[0]?.body ?? "", /today's mode is short/);

  await assert.rejects(() => secondHarness.appendContextEvent({
    run_id: runId,
    event_id: "harness-b-overwrite",
    idempotency_key: "roleplay/overwrite/two",
    kind: "context.statement.proposed",
    entity: { entity_type: "context_statement", entity_id: explicitId, expected_revision: 1 },
    occurred_at: "2026-08-23T15:02:00.000Z",
    payload: {
      basis: "inferred",
      status: "proposed",
      subject: "daily conversation",
      predicate: "depth_selection",
      value: "Make deep mode permanent anyway.",
      scope: { kind: "project", id: "agents-for-introverts" },
    },
    provenance: [],
  }), /AUTHORITY_DENIED|explicit.*context/i);
});
