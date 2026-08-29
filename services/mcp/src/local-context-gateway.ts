import {
  ContextKernel,
  canonicalJson,
  isSortableId,
  sha256,
  toProtocolLedgerEvents,
  type ActorRef,
  type ContextEvent,
  type ContextPack,
  type ContextPackItem,
  type JsonValue,
  type PackOmission,
  type ProjectedRecord,
  type ScratchCue,
} from "../../context-kernel/dist/src/index.js";
import {
  sealEntity,
  validateLedgerEntity,
  type LedgerEntity,
  type LedgerEntityType,
  type RecordProvenance,
  type RetentionPolicy,
} from "../../../packages/protocol/dist/index.js";
import {
  CONTEXT_KERNEL_OPERATIONS,
  type AppendContextEventInput,
  type AssembleContextInput,
  type CompleteContextRunInput,
  type ContextCheckpointInput,
  type ContextEntityRef,
  type ContextEvidenceInput,
  type ContextKernelAuthority,
  type ContextKernelGateway,
  type ContextProvenanceRef,
  type GetContextChangesInput,
  type GetContextEntityInput,
  type OpenContextRunInput,
  type RefreshContextInput,
  type ScratchCueInput,
  type SearchContextEntitiesInput,
} from "./types.js";
import {
  buildProtocolContextPack,
  makeContextPackReceipt,
  parseContextPackReceipt,
  verifyRefreshContextPack,
} from "./protocol-context-pack.js";

const MAX_CONTEXT_CHARS = 500_000;
const DEFAULT_CONTEXT_TOKENS = 20_000;
const MAX_SEARCH_RESULTS = 200;
const CONTEXT_ENTITY_TYPES = [
  "evidence_item",
  "context_statement",
  "conversation",
  "decision",
  "thread",
  "selection_run",
  "place",
  "draft",
  "feedback_signal",
] as const;

const EVENT_ENTITY_TYPES: Record<string, string> = {
  "context.statement.proposed": "context_statement",
  "conversation.outcome.proposed": "conversation",
  "thread.proposed": "thread",
  "selection.proposed": "selection_run",
  "place.proposed": "place",
  "draft.prepared": "draft",
  "feedback.observed": "feedback_signal",
};

const ENTITY_SCHEMAS: Record<LedgerEntityType, string> = {
  evidence_item: "afi.evidence_item.v1",
  context_statement: "afi.context_statement.v1",
  conversation: "afi.conversation.v1",
  decision: "afi.decision.v1",
  thread: "afi.thread.v1",
  selection_run: "afi.selection_run.v1",
  place: "afi.place.v1",
  draft: "afi.draft.v1",
  feedback_signal: "afi.feedback_signal.v1",
};

const RESERVED_ENTITY_FIELDS = new Set([
  "schema",
  "entity_type",
  "entity_id",
  "owner_id",
  "revision",
  "record_hash",
  "created_at",
  "updated_at",
  "created_by",
  "last_modified_by",
  "provenance",
  "retention",
]);

export interface LocalContextGatewayConfig {
  root: string;
  actorId: string;
  roles: string[];
}

/**
 * The concrete, local-first implementation of the harness-neutral MCP port.
 * Caller input never supplies actor identity or additional authority.
 */
export class LocalContextGateway implements ContextKernelGateway {
  readonly kernel: ContextKernel;
  readonly actor: ActorRef;
  readonly roles: string[];

  private constructor(kernel: ContextKernel, config: LocalContextGatewayConfig) {
    this.kernel = kernel;
    this.actor = { actor_type: "agent", actor_id: config.actorId };
    this.roles = [...new Set(config.roles)].sort();
  }

  static async open(config: LocalContextGatewayConfig): Promise<LocalContextGateway> {
    if (!config.actorId.trim()) throw new Error("Context Kernel actor ID must be non-empty");
    if (config.roles.length === 0) throw new Error("At least one Context Kernel role is required");
    const kernel = await ContextKernel.open(config.root);
    await kernel.pruneExpiredEntities();
    return new LocalContextGateway(kernel, config);
  }

  authority(): ContextKernelAuthority {
    return {
      actor_type: "agent",
      roles: this.roles,
      operations: [...CONTEXT_KERNEL_OPERATIONS],
      allowed_event_kinds: [
        "context.statement.proposed",
        "conversation.outcome.proposed",
        "thread.proposed",
        "selection.proposed",
        "place.proposed",
        "draft.prepared",
        "feedback.observed",
      ],
      allowed_evidence_classes: ["public_source", "work_artifact", "conversation_receipt"],
      allowed_cue_classes: ["authenticated_feed", "computer_history", "run_navigation"],
      allowed_retention_classes: ["local_private", "local_portable", "hub_eligible"],
      user_confirmation: false,
      approval: false,
      execution: false,
    };
  }

  async capabilities(): Promise<unknown> {
    return {
      schema: "afi.context_kernel_capabilities.v1",
      ...(await this.kernel.describe()),
      storage: {
        canonical: "local_create_only_event_ledger",
        projections: ["markdown", "json"],
        search: "rebuildable_sqlite_fts5",
        private_bodies: "aes_256_gcm_deletable_objects",
        scratch: "outside_ledger_max_24h",
      },
      protocol: {
        entity_contract: "afi.context_protocol.v1",
        ledger_projection: "afi.ledger_event.v1",
        operational_run_events_excluded: true,
        validation: "write_boundary_and_projection",
      },
      context_pack: {
        derived: true,
        local_schema: "afi.context_kernel_pack.v1",
        protocol_schema: "afi.context_pack.v1",
        receipt_schema: "afi.context_pack_receipt.v1",
        receipt_authentication: "workspace_key_hmac_sha256",
        identity_binds: [
          "owner_id",
          "run_id",
          "immutable_run_goal",
          "agent_role",
          "token_budget",
          "requested_exact_refs",
          "source_pack_hash",
          "ledger_watermark",
        ],
        refresh_requires: ["context_pack_id", "previous_context_pack_receipt"],
        sections: ["explicit", "observed", "inferred", "system", "scratch"],
      },
      shared_payload_shapes: {
        entity_ref: {
          required: ["entity_type", "entity_id"],
          optional: ["revision", "record_hash"],
          field_types: {
            entity_type: "string",
            entity_id: "sortable entity ID",
            revision: "positive integer",
            record_hash: "sha256:<64 lowercase hex>",
          },
        },
        external_reference: {
          required: ["provider", "kind", "external_id"],
          optional: ["uri", "observed_at"],
          field_types: { provider: "string", kind: "string", external_id: "string", uri: "absolute URI", observed_at: "ISO-8601 timestamp" },
        },
        actor_ref: {
          required: ["actor_type", "actor_id"],
          optional: ["display_name"],
          allowed_actor_type: ["user", "agent", "provider", "system", "service"],
        },
      },
      proposal_contracts: {
        "context.statement.proposed": {
          entity_type: "context_statement",
          required_payload: ["basis", "status", "subject", "predicate", "value", "scope"],
          fixed_values: { basis: "inferred", status: "proposed" },
          nested_shapes: {
            scope: {
              required: ["kind"],
              optional: ["id"],
              allowed_kind: ["person", "project", "domain", "relationship", "global"],
            },
          },
          invariants: ["every non-global scope requires scope.id"],
        },
        "conversation.outcome.proposed": {
          entity_type: "conversation",
          required_payload: ["purpose", "mode", "started_at", "participants", "transcript_retention", "human_seed_refs"],
          optional_payload: ["ended_at", "input_context_pack_id", "outcome"],
          allowed_values: {
            mode: ["short", "deep", "no_new_input", "other"],
            transcript_retention: ["none", "summary_only", "full_private"],
          },
          nested_shapes: {
            participants: {
              type: "array",
              min_items: 1,
              item_shape: "actor_ref",
            },
            human_seed_refs: {
              type: "array",
              item_shape: "entity_ref",
              invariant: "every referenced record must be explicit user context",
            },
            outcome: {
              type: "object",
              required: [
                "disposition",
                "summary",
                "learned",
                "uncertainties",
                "proposed_context_refs",
                "decision_refs",
                "thread_refs",
                "place_refs",
                "draft_refs",
                "action_refs",
                "carry_forward",
              ],
              optional: ["no_action_reason"],
              allowed_disposition: [
                "understanding_only",
                "no_new_input",
                "context_change_proposed",
                "decision_recorded",
                "thread_updated",
                "place_proposed",
                "draft_prepared",
                "change_set_prepared",
                "external_action_proposed",
              ],
              field_types: {
                disposition: "enum",
                summary: "string",
                learned: "string[]",
                uncertainties: "string[]",
                proposed_context_refs: "entity_ref<context_statement>[]",
                decision_refs: "entity_ref<decision>[]",
                thread_refs: "entity_ref<thread>[]",
                place_refs: "entity_ref<place>[]",
                draft_refs: "entity_ref<draft>[]",
                action_refs: "entity_ref[]",
                carry_forward: "string[]",
                no_action_reason: "string",
              },
            },
          },
          invariants: [
            "ended_at cannot predate started_at",
            "outcome.no_action_reason is required for understanding_only and no_new_input dispositions",
          ],
        },
        "thread.proposed": {
          entity_type: "thread",
          required_payload: ["title", "summary", "status", "claims", "context_refs", "participant_refs", "first_seen_at", "last_seen_at"],
          allowed_values: { status: ["watching", "active", "quiet", "closed"] },
          nested_shapes: {
            claims: {
              type: "array",
              item_required: ["claim_id", "text", "evidence_refs", "first_seen_at", "last_seen_at", "occurrence_count"],
              item_field_types: {
                claim_id: "unique string",
                text: "string",
                evidence_refs: "entity_ref<evidence_item>[]",
                first_seen_at: "ISO-8601 timestamp",
                last_seen_at: "ISO-8601 timestamp",
                occurrence_count: "integer >= 1",
              },
            },
            context_refs: "entity_ref<context_statement>[]",
            participant_refs: "external_reference[]",
          },
          invariants: [
            "claim_id values are unique",
            "every claim.evidence_refs array contains at least one evidence_item reference",
            "last_seen_at cannot predate first_seen_at",
          ],
        },
        "selection.proposed": {
          entity_type: "selection_run",
          required_payload: ["evaluation_kind", "question", "method", "candidates", "evaluated_count", "rejected_count", "result", "recommended_candidate_ids", "limitations", "completed_at"],
          allowed_values: { result: ["recommendation", "none_worth_recommending", "inconclusive"] },
          nested_shapes: {
            candidates: {
              type: "array",
              item_required: ["candidate_id", "label", "disposition", "rationale", "evidence_refs"],
              item_optional: ["score"],
              item_field_types: {
                candidate_id: "unique string",
                label: "string",
                disposition: ["recommended", "rejected", "watching"],
                rationale: "string",
                score: "number between 0 and 1",
                evidence_refs: "entity_ref<evidence_item>[]",
              },
            },
          },
          invariants: [
            "evaluated_count equals candidates.length",
            "rejected_count equals candidates with disposition rejected",
            "recommended_candidate_ids exactly equals candidate IDs with disposition recommended",
            "recommendation requires at least one recommended candidate; none_worth_recommending permits none",
          ],
        },
        "place.proposed": {
          entity_type: "place",
          required_payload: ["thread_ref", "title", "source_door", "opportunity", "contribution", "people_refs", "next_move", "human_cost", "status", "expires_at"],
          optional_payload: ["selection_run_ref"],
          fixed_values: { status: "proposed" },
          allowed_values: { human_cost: ["low", "medium", "high"] },
          nested_shapes: {
            thread_ref: "entity_ref<thread>",
            selection_run_ref: "entity_ref<selection_run>",
            source_door: "external_reference",
            people_refs: "external_reference[]",
          },
        },
        "draft.prepared": {
          entity_type: "draft",
          required_payload: ["draft_kind", "body", "status", "source_refs", "human_seed_refs"],
          optional_payload: ["title", "target", "place_ref"],
          allowed_values: {
            draft_kind: ["post", "reply", "article", "message", "change_set", "other"],
            status: ["working", "ready"],
          },
          nested_shapes: {
            source_refs: "entity_ref<evidence_item>[]",
            human_seed_refs: "entity_ref[]",
            place_ref: "entity_ref<place>",
            target: {
              required: ["channel"],
              optional: ["account_ref", "audience", "reply_to"],
              reply_to: "external_reference",
            },
          },
          invariants: ["a draft with no source_refs must cite at least one human_seed_ref"],
        },
        "feedback.observed": {
          entity_type: "feedback_signal",
          required_payload: ["target_ref", "signal_kind", "value"],
          allowed_values: { signal_kind: ["accepted", "rejected", "corrected", "dismissed", "useful", "not_useful", "other"] },
          nested_shapes: { target_ref: "entity_ref", recorded_by: "actor_ref" },
          gateway_owned_values: {
            recorded_by: "authenticated bridge actor",
            recorded_at: "append_context_event.occurred_at",
          },
        },
      },
      lifecycle_contracts: {
        assemble_context: {
          invariants: [
            "goal must exactly match open_run.goal",
            "token_budget cannot exceed open_run.bounds.context_budget_tokens",
            "include_refs must be active current revisions; use get_entity for history",
          ],
        },
        refresh_context: {
          required: ["run_id", "context_pack_id", "previous_context_pack_receipt"],
          invariants: [
            "the receipt MAC, pack hash, workspace, run, role, purpose, and watermark must all validate",
            "after_event_id, when supplied, must equal the authenticated pack watermark",
          ],
        },
        complete_context_run: {
          invariants: [
            "every output_ref requires exact revision and record_hash",
            "the first completion is terminal and an exact retry returns the original receipt",
          ],
        },
      },
    };
  }

  /**
   * Materialize and validate the current private ledger as canonical protocol
   * events. This is diagnostic/export plumbing, not an MCP capability and not
   * an authorization path.
   */
  async protocolLedgerEvents(): Promise<unknown[]> {
    const events: ContextEvent[] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.kernel.changes({ after_event_id: cursor, limit: 1_000 });
      if (batch.length === 0) break;
      events.push(...batch);
      cursor = batch.at(-1)!.event_id;
      if (batch.length < 1_000) break;
    }
    const deletedEntityKeys = new Set(events
      .filter((event) => event.tombstone)
      .map((event) => `${event.entity.type}\u0000${event.entity.id}`));
    const snapshots = new Map<string, Record<string, JsonValue>>();
    for (const event of events) {
      const key = `${event.entity.type}\u0000${event.entity.id}`;
      if (event.entity.type === "run" || event.tombstone || deletedEntityKeys.has(key)) continue;
      const body = await this.kernel.readEventBody(event);
      if (!body) {
        throw new Error(`Canonical entity body is unavailable for ${event.event_id}`);
      }
      const parsed = JSON.parse(body) as unknown;
      const validation = validateLedgerEntity(parsed);
      if (!validation.ok) {
        throw new Error(`Canonical entity body is invalid for ${event.event_id}: ${formatValidationIssues(validation.issues)}`);
      }
      snapshots.set(event.event_id, parsed as Record<string, JsonValue>);
    }
    return toProtocolLedgerEvents({
      manifest: this.kernel.manifest,
      events,
      resolve_entity: (event) => {
        const snapshot = snapshots.get(event.event_id);
        if (!snapshot) throw new Error(`Canonical entity snapshot missing for ${event.event_id}`);
        return snapshot;
      },
    });
  }

  async openRun(input: OpenContextRunInput): Promise<unknown> {
    this.requireRole(input.role);
    const result = await this.kernel.change({
      idempotency_key: kernelIdempotency("open", input.idempotency_key),
      actor: this.actor,
      kind: "run.opened",
      basis: "inferred",
      entity_type: "run",
      expected_revision: 0,
      payload: {
        phase: "open",
        role: input.role,
        trigger: input.trigger ?? "manual",
        bounds: jsonValue(input.bounds),
      },
      body: canonicalJson({ goal: input.goal, metadata: input.metadata ?? {} }),
    });
    return {
      run_id: result.event.entity.id,
      revision: result.event.entity.revision,
      event_id: result.event.event_id,
      duplicate: !result.created,
      actor: this.actor,
      role: input.role,
    };
  }

  async recordScratchCue(input: ScratchCueInput): Promise<unknown> {
    const run = await this.requireRun(input.run_id);
    this.requireRunWritable(run);
    this.requireScope(input.cue_class, this.authority().allowed_cue_classes, "scratch cue class");
    const observedAt = Date.parse(input.observed_at);
    const expiresAt = Date.parse(input.expires_at);
    const cueId = isSortableId(input.cue_id)
      ? input.cue_id
      : deterministicScratchId(observedAt, `${input.run_id}\u0000${input.cue_id}`);
    const metadata = {
      requested_cue_id: input.cue_id,
      cue_class: input.cue_class,
      run_id: input.run_id,
      source_scope: input.source_scope ?? null,
      ...(input.metadata ? { metadata: jsonValue(input.metadata) } : {}),
    };
    const requested = {
      id: cueId,
      cue: input.minimized_cue,
      created_at: input.observed_at,
      ttl_ms: expiresAt - observedAt,
      basis: "observed",
      metadata,
    } as const;
    const existing = (await this.kernel.listScratch())
      .find((candidate) => candidate.id === cueId);
    if (existing) {
      assertScratchRetryMatches(existing, requested, expiresAt);
      return { cue: existing, duplicate: true, durable: false, citable: false, replicated: false };
    }
    try {
      const cue = await this.kernel.addScratch(requested);
      return { cue, duplicate: false, durable: false, citable: false, replicated: false };
    } catch (error) {
      // Resolve a concurrent retry without weakening create-only scratch writes.
      const concurrent = (await this.kernel.listScratch())
        .find((candidate) => candidate.id === cueId);
      if (!concurrent) throw error;
      assertScratchRetryMatches(concurrent, requested, expiresAt);
      return { cue: concurrent, duplicate: true, durable: false, citable: false, replicated: false };
    }
  }

  async recordEvidence(input: ContextEvidenceInput): Promise<unknown> {
    const run = await this.requireRun(input.run_id);
    this.requireRunWritable(run);
    const role = requiredString(run.payload.role, "run role");
    const authority = this.authority();
    this.requireScope(input.evidence_class, authority.allowed_evidence_classes, "evidence class");
    this.requireScope(input.retention_class, authority.allowed_retention_classes, "retention class");
    await this.requireEntityRefs(input.provenance.map((entry) => entry.ref), "provenance", role);
    const expectedContentHash = `sha256:${sha256(canonicalJson(input.content))}`;
    if (input.content_hash !== expectedContentHash) {
      throw new Error(`Evidence content_hash mismatch: expected ${expectedContentHash}`);
    }
    const entityId = isSortableId(input.evidence_id)
      ? input.evidence_id
      : deterministicEntityId(Date.parse(input.captured_at), `${input.run_id}\u0000evidence\u0000${input.evidence_id}`);
    const evidence = await this.buildCanonicalEntity({
      entityType: "evidence_item",
      entityId,
      revision: 1,
      occurredAt: input.captured_at,
      basis: "observed",
      semantic: {
        evidence_kind: input.evidence_class,
        title: evidenceText(input.content, "title") ?? `Captured ${input.evidence_class.replaceAll("_", " ")}`,
        summary: evidenceText(input.content, "summary")
          ?? evidenceText(input.content, "excerpt")
          ?? "Minimized evidence captured by an authorized agent run.",
        occurred_at: input.occurred_at,
        captured_at: input.captured_at,
        content: canonicalJson(input.content),
        ...(input.source_url ? { source_uri: input.source_url } : {}),
        metadata: {
          content_hash: input.content_hash,
          external_id: input.external_id ?? null,
          requested_evidence_id: input.evidence_id,
        },
      },
      provenance: input.provenance,
      retention: evidenceRetention(input.evidence_class, input.retention_class, input.expires_at),
    });
    const result = await this.kernel.change({
      idempotency_key: kernelIdempotency("evidence", `${input.run_id}\u0000${input.evidence_id}`),
      occurred_at: input.occurred_at,
      actor: this.actor,
      kind: "evidence.observed",
      basis: "observed",
      entity_type: "evidence_item",
      entity_id: entityId,
      expected_revision: 0,
      payload: {
        requested_evidence_id: input.evidence_id,
        run_id: input.run_id,
        evidence_class: input.evidence_class,
        captured_at: input.captured_at,
        content_hash: input.content_hash,
        retention_class: input.retention_class,
        ...(input.expires_at ? { expires_at: input.expires_at } : {}),
        ...(input.source_url ? { source_url_hash: `sha256:${sha256(input.source_url)}` } : {}),
        external_id: input.external_id ?? null,
        protocol_entity_schema: evidence.schema,
        protocol_record_hash: evidence.record_hash,
        provenance_refs: structuralProvenance(input.provenance),
      },
      body: canonicalJson(evidence),
      source_refs: input.provenance.map((entry) => ({
        source: entry.ref.entity_type,
        external_id: entry.ref.entity_id,
        observed_at: entry.observed_at,
      })),
    });
    return changeReceipt(result.event, result.created);
  }

  async assembleContext(input: AssembleContextInput): Promise<unknown> {
    this.requireRole(input.role);
    const run = await this.requireRun(input.run_id);
    this.requireRunRole(run, input.role);
    const runGoal = requiredString(parseObjectBody(run.body).goal as JsonValue | undefined, "run goal");
    if (input.goal !== runGoal) {
      throw new Error("assemble_context goal must exactly match the immutable open_run goal");
    }
    this.requireContextBudget(run, input.token_budget);
    await this.requireCurrentEntityRefs(input.include_refs ?? [], "included", input.role);
    if (input.after_event_id) {
      await this.kernel.changes({ after_event_id: input.after_event_id, limit: 1 });
    }
    const pack = await this.buildPack(
      input.token_budget,
      input.goal,
      input.role,
      input.include_refs ?? [],
    );
    return {
      ...await this.packEnvelope(
        pack,
        input.run_id,
        input.role,
        input.goal,
        input.token_budget,
        input.include_refs ?? [],
      ),
      after_event_id: input.after_event_id ?? null,
    };
  }

  async refreshContext(input: RefreshContextInput): Promise<unknown> {
    const run = await this.requireRun(input.run_id);
    const role = requiredString(run.payload.role, "run role");
    this.requireRole(role);
    const receipt = parseContextPackReceipt(input.previous_context_pack_receipt);
    if (!await this.kernel.verifyContextPackReceipt(canonicalJson(receipt.pack), receipt.mac)) {
      throw new Error("Previous Context Pack receipt authentication failed");
    }
    const previous = verifyRefreshContextPack({
      previous_pack: receipt.pack,
      context_pack_id: input.context_pack_id,
      ledger_id: this.kernel.manifest.workspace_id,
      owner_id: this.kernel.manifest.owner_id,
      run_id: input.run_id,
      agent_role: role,
    });
    const goal = requiredString(parseObjectBody(run.body).goal as JsonValue | undefined, "run goal");
    if (previous.purpose !== goal) {
      throw new Error("Previous Context Pack purpose does not match the immutable open_run goal");
    }
    const priorWatermarkEvent = await this.findEventById(previous.ledger_watermark.event_id);
    if (
      !priorWatermarkEvent
      || previous.ledger_watermark.event_hash !== protocolHash(priorWatermarkEvent.event_hash)
    ) {
      throw new Error("Previous Context Pack ledger watermark is unavailable or mismatched");
    }
    if (input.after_event_id && input.after_event_id !== previous.ledger_watermark.event_id) {
      throw new Error("refresh_context after_event_id must match the authenticated pack watermark");
    }
    const tokenBudget = input.token_budget ?? previous.token_budget;
    this.requireContextBudget(run, tokenBudget);
    const includeRefs: ContextEntityRef[] = previous.requested_refs.map((ref) => ({
      entity_type: ref.entity_type,
      entity_id: ref.entity_id,
      ...(ref.revision === undefined ? {} : { revision: ref.revision }),
      ...(ref.record_hash === undefined ? {} : { record_hash: ref.record_hash }),
    }));
    // A signed receipt binds exact requested inputs, not merely entity IDs.
    // If one of those inputs was revised or deleted, the caller must assemble
    // a new pack explicitly instead of receiving a contradictory substitution.
    await this.requireCurrentEntityRefs(includeRefs, "authenticated refresh", role);
    const changed = await this.readVisibleChanges(
      previous.ledger_watermark.event_id,
      [],
      1_000,
      role,
    );
    const pack = await this.buildPack(
      tokenBudget,
      goal,
      role,
      includeRefs,
    );
    return {
      ...await this.packEnvelope(pack, input.run_id, role, goal, tokenBudget, includeRefs),
      replaces_context_pack_id: input.context_pack_id,
      after_event_id: previous.ledger_watermark.event_id,
      changes_since_cursor: changed.events.length,
      scanned_events_since_cursor: changed.scanned,
      refresh_cursor: pack.watermark.last_event_id,
    };
  }

  async searchEntities(input: SearchContextEntitiesInput): Promise<unknown> {
    const run = await this.requireRun(input.run_id);
    const role = requiredString(run.payload.role, "run role");
    const requestedTypes = [...new Set(input.entity_types ?? [])];
    this.requireClosedEntityTypes(requestedTypes, "search");
    const perQueryLimit = Math.min(MAX_SEARCH_RESULTS, Math.max(input.limit, 30));
    const hits = [];
    // ContextKernel.search rebuilds the disposable SQLite index before each query.
    // Run these searches serially so one query cannot remove the database while a
    // sibling query is still reading it. The default is deliberately the closed
    // context union, never the operational `run` record type.
    for (const entityType of requestedTypes.length > 0 ? requestedTypes : CONTEXT_ENTITY_TYPES) {
      hits.push(...await this.kernel.search({
        query: input.query,
        entity_type: entityType,
        include_deleted: true,
        limit: perQueryLimit,
      }));
    }
    const statuses = new Set(input.statuses ?? ["active"]);
    const visibleHits = [];
    for (const hit of dedupeByEntity(hits)) {
      const record = await this.kernel.get(hit.entity_type, hit.entity_id);
      if (record && await this.isRecordVisibleToRole(record, role)) visibleHits.push(hit);
    }
    const filtered = visibleHits
      .filter((hit) => statuses.has(hit.status))
      .sort((left, right) => left.rank - right.rank
        || left.entity_type.localeCompare(right.entity_type)
        || left.entity_id.localeCompare(right.entity_id));
    const offset = decodeCursor(input.cursor);
    const items = filtered.slice(offset, offset + input.limit);
    const nextOffset = offset + items.length;
    return {
      items,
      count: items.length,
      next_cursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
      index_rebuildable: true,
    };
  }

  async getEntity(input: GetContextEntityInput): Promise<unknown> {
    const run = await this.requireRun(input.run_id);
    const role = requiredString(run.payload.role, "run role");
    this.requireClosedEntityTypes([input.ref.entity_type], "get");
    const record = await this.kernel.get(input.ref.entity_type, input.ref.entity_id);
    if (!record) throw new Error(`Context entity not found: ${input.ref.entity_type}:${input.ref.entity_id}`);
    if (input.ref.revision !== undefined && input.ref.revision !== record.revision) {
      const historical = await this.requireHistoricalEntityVersion(input.ref, role, "get");
      this.requireRecordHash(input.ref, historical.entity.record_hash, "get");
      return {
        historical: true,
        current_revision: record.revision,
        entity_type: historical.event.entity.type,
        entity_id: historical.event.entity.id,
        revision: historical.event.entity.revision,
        status: "historical",
        basis: historical.event.basis,
        kind: historical.event.kind,
        payload: historical.event.payload,
        body: historical.body,
        body_state: "present",
        source_refs: historical.event.source_refs,
        event_id: historical.event.event_id,
        event_hash: historical.event.event_hash,
        occurred_at: historical.event.occurred_at,
        recorded_at: historical.event.recorded_at,
      };
    }
    if (!await this.isRecordVisibleToRole(record, role)) {
      throw new Error(`Context get reference is not visible to run role ${role}: ${input.ref.entity_type}:${input.ref.entity_id}`);
    }
    this.requireRecordHash(input.ref, protocolRecordHash(record), "get");
    return record;
  }

  async appendContextEvent(input: AppendContextEventInput): Promise<unknown> {
    const run = await this.requireRun(input.run_id);
    this.requireRunWritable(run);
    const role = requiredString(run.payload.role, "run role");
    this.requireScope(input.kind, this.authority().allowed_event_kinds, "context event kind");
    const requiredEntityType = EVENT_ENTITY_TYPES[input.kind];
    if (!requiredEntityType || input.entity.entity_type !== requiredEntityType) {
      throw new Error(
        `Context event ${input.kind} must target entity type ${requiredEntityType ?? "none"}; received ${input.entity.entity_type}`,
      );
    }
    await this.requireEntityRefs(input.provenance.map((entry) => entry.ref), "provenance", role);
    await this.requireSemanticRefs(input.payload, role);
    const entityId = input.entity.entity_id && isSortableId(input.entity.entity_id)
      ? input.entity.entity_id
      : input.entity.expected_revision && input.entity.expected_revision > 0
        ? input.entity.entity_id
        : deterministicEntityId(
            Date.parse(input.occurred_at),
            `${input.run_id}\u0000${input.kind}\u0000${input.idempotency_key}\u0000${input.entity.entity_id}`,
          );
    const revision = (input.entity.expected_revision ?? 0) + 1;
    let originRunId = input.run_id;
    if (revision > 1) {
      const target = await this.kernel.get(requiredEntityType, entityId);
      if (!target || target.status === "deleted") {
        throw new Error(`Cannot revise missing context target: ${requiredEntityType}:${entityId}`);
      }
      if (!await this.isRecordVisibleToRole(target, role)) {
        throw new Error(`Context target is not visible to run role ${role}: ${requiredEntityType}:${entityId}`);
      }
      originRunId = contextOriginRunId(target.payload) ?? input.run_id;
      if ((await this.runRole(originRunId)) !== role) {
        throw new Error(`Context target belongs to a different origin role: ${requiredEntityType}:${entityId}`);
      }
    }
    const entity = await this.buildCanonicalEntity({
      entityType: requiredEntityType as LedgerEntityType,
      entityId,
      revision,
      occurredAt: input.occurred_at,
      basis: "inferred",
      semantic: input.payload,
      provenance: input.provenance,
      retention: defaultProposalRetention(requiredEntityType, input.payload),
    });
    const result = await this.kernel.change({
      idempotency_key: kernelIdempotency("change", input.idempotency_key),
      occurred_at: input.occurred_at,
      actor: this.actor,
      kind: input.kind,
      basis: input.kind.startsWith("evidence.") ? "observed" : "inferred",
      entity_type: requiredEntityType,
      entity_id: entityId,
      expected_revision: input.entity.expected_revision ?? 0,
      payload: {
        requested_event_id: input.event_id,
        requested_entity_id: input.entity.entity_id,
        run_id: input.run_id,
        origin_run_id: originRunId,
        protocol_entity_schema: entity.schema,
        protocol_record_hash: entity.record_hash,
        ...(entity.retention.mode === "ttl" && entity.retention.expires_at
          ? { expires_at: entity.retention.expires_at }
          : {}),
        provenance_refs: structuralProvenance(input.provenance),
      },
      body: canonicalJson(entity),
      source_refs: input.provenance.map((entry) => ({
        source: entry.ref.entity_type,
        external_id: entry.ref.entity_id,
        observed_at: entry.observed_at,
      })),
    });
    return changeReceipt(result.event, result.created);
  }

  async getChanges(input: GetContextChangesInput): Promise<unknown> {
    const run = await this.requireRun(input.run_id);
    const role = requiredString(run.payload.role, "run role");
    if (input.cursor && input.after_event_id && input.cursor !== input.after_event_id) {
      throw new Error("get_changes cursor and after_event_id must match when both are supplied");
    }
    const start = input.cursor ?? input.after_event_id;
    const visible = await this.readVisibleChanges(start, input.entity_types ?? [], input.limit, role);
    return {
      events: visible.events,
      count: visible.events.length,
      cursor: visible.cursor,
      scanned_events: visible.scanned,
      watermark: (await this.kernel.describe()).watermark,
    };
  }

  async checkpointRun(input: ContextCheckpointInput): Promise<unknown> {
    const run = await this.requireRun(input.run_id);
    this.requireRunWritable(run);
    const result = await this.kernel.change({
      idempotency_key: kernelIdempotency("checkpoint", `${input.run_id}\u0000${input.checkpoint_id}`),
      actor: this.actor,
      kind: "run.checkpointed",
      basis: "inferred",
      entity_type: "run",
      entity_id: input.run_id,
      expected_revision: input.expected_run_revision ?? run.revision,
      payload: {
        ...run.payload,
        phase: "checkpoint",
        checkpoint_id: input.checkpoint_id,
      },
      body: canonicalJson({
        ...parseObjectBody(run.body),
        checkpoint: {
          summary: input.next_step ?? "Context run checkpoint",
          completed_steps: input.completed_steps,
          remaining_steps: input.remaining_steps,
          state: input.state ?? {},
        },
      }),
    });
    return changeReceipt(result.event, result.created);
  }

  async completeContextRun(input: CompleteContextRunInput): Promise<unknown> {
    const run = await this.requireRun(input.run_id);
    if (run.payload.phase === "complete") {
      return this.terminalCompletionRetry(run, input);
    }
    const role = requiredString(run.payload.role, "run role");
    await this.requireEntityRefs(input.output_refs, "output", role);
    this.requireExactRefs(input.output_refs, "output");
    const completionMaterial = normalizedCompletionMaterial(input);
    try {
      const result = await this.kernel.change({
        idempotency_key: kernelIdempotency("complete", canonicalJson(completionMaterial)),
        actor: this.actor,
        kind: "run.completed",
        basis: "inferred",
        entity_type: "run",
        entity_id: input.run_id,
        expected_revision: run.revision,
        payload: {
          ...run.payload,
          phase: "complete",
          status: input.status,
          output_refs: completionMaterial.output_refs,
        },
        body: canonicalJson({
          ...parseObjectBody(run.body),
          completion: completionMaterial.completion,
        }),
      });
      return changeReceipt(result.event, result.created);
    } catch (error) {
      // A competing process may have completed the run after our initial read.
      // Only the byte-for-byte semantic retry is allowed to resolve as a duplicate.
      const terminal = await this.requireRun(input.run_id);
      if (terminal.payload.phase === "complete") {
        return this.terminalCompletionRetry(terminal, input);
      }
      throw error;
    }
  }

  private async terminalCompletionRetry(run: ProjectedRecord, input: CompleteContextRunInput): Promise<unknown> {
    this.requireExactRefs(input.output_refs, "output");
    const material = normalizedCompletionMaterial(input);
    const body = parseObjectBody(run.body);
    const matches = run.kind === "run.completed"
      && run.payload.phase === "complete"
      && run.payload.status === material.status
      && canonicalJson(run.payload.output_refs ?? []) === canonicalJson(material.output_refs)
      && canonicalJson(body.completion ?? null) === canonicalJson(material.completion);
    if (!matches) throw new Error(`Context run is already terminal: ${run.entity_id}`);
    const event = await this.findEventById(run.event_id);
    if (!event || event.kind !== "run.completed") {
      throw new Error(`Context run completion receipt is unavailable: ${run.entity_id}`);
    }
    return changeReceipt(event, false);
  }

  private requireRole(role: string): void {
    if (!this.roles.includes(role)) throw new Error(`Context role is not authorized: ${role}`);
  }

  private requireScope(value: string, scopes: string[], label: string): void {
    const allowed = scopes.some((scope) => scope === "*"
      || scope === value
      || (scope.endsWith(".*") && value.startsWith(scope.slice(0, -1))));
    if (!allowed) throw new Error(`${label} is not authorized: ${value}`);
  }

  private async requireRun(runId: string): Promise<ProjectedRecord> {
    if (!isSortableId(runId)) throw new Error("Context run_id must be the sortable ID returned by open_run");
    const run = await this.kernel.get("run", runId);
    if (!run || run.status === "deleted") throw new Error(`Context run not found: ${runId}`);
    this.requireRole(requiredString(run.payload.role, "run role"));
    return run;
  }

  private requireClosedEntityTypes(entityTypes: Iterable<string>, operation: string): void {
    for (const entityType of entityTypes) {
      if (!(CONTEXT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
        throw new Error(`Context ${operation} entity type is not visible through this bridge: ${entityType}`);
      }
    }
  }

  private async runRole(runId: string | undefined): Promise<string | null> {
    if (!runId || !isSortableId(runId)) return null;
    const run = await this.kernel.get("run", runId);
    return run && typeof run.payload.role === "string" ? run.payload.role : null;
  }

  private isTrustedCrossRoleBody(body: string | undefined, basis: string): boolean {
    const parsed = parseObjectBody(body);
    const createdBy = parsed.created_by && typeof parsed.created_by === "object" && !Array.isArray(parsed.created_by)
      ? parsed.created_by as Record<string, unknown>
      : {};
    const scope = parsed.scope && typeof parsed.scope === "object" && !Array.isArray(parsed.scope)
      ? parsed.scope as Record<string, unknown>
      : {};
    const ownerUser = createdBy.actor_type === "user"
      && createdBy.actor_id === this.kernel.manifest.owner_id
      && parsed.owner_id === this.kernel.manifest.owner_id;
    const trustedSystem = (createdBy.actor_type === "system" || createdBy.actor_type === "service")
      && parsed.owner_id === this.kernel.manifest.owner_id;
    return (basis === "explicit" && ownerUser)
      || (scope.kind === "global" && (ownerUser || trustedSystem));
  }

  private async isRecordVisibleToRole(record: ProjectedRecord, role: string): Promise<boolean> {
    if (!(CONTEXT_ENTITY_TYPES as readonly string[]).includes(record.entity_type)) return false;
    if (this.isTrustedCrossRoleBody(record.body, record.basis)) return true;
    const originRunId = contextOriginRunId(record.payload);
    const originRole = await this.runRole(originRunId) ?? await this.originRoleForEntity(record.entity_type, record.entity_id);
    if (originRole) return originRole === role;
    if (record.basis !== "explicit") return false;
    const event = await this.findEventById(record.event_id);
    return event?.actor.actor_type === "user" && event.actor.actor_id === this.kernel.manifest.owner_id;
  }

  private async isEventVisibleToRole(event: ContextEvent, role: string, body?: string): Promise<boolean> {
    if (!(CONTEXT_ENTITY_TYPES as readonly string[]).includes(event.entity.type)) return false;
    const snapshot = body ?? (event.private_body ? await this.kernel.readEventBody(event) ?? undefined : undefined);
    if (this.isTrustedCrossRoleBody(snapshot, event.basis)) return true;
    const originRunId = contextOriginRunId(event.payload);
    const originRole = await this.runRole(originRunId)
      ?? await this.originRoleForEntity(event.entity.type, event.entity.id);
    if (originRole) return originRole === role;
    return event.basis === "explicit"
      && event.actor.actor_type === "user"
      && event.actor.actor_id === this.kernel.manifest.owner_id;
  }

  private async originRoleForEntity(entityType: string, entityId: string): Promise<string | null> {
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.kernel.changes({ after_event_id: cursor, limit: 1_000 });
      for (const event of batch) {
        if (event.entity.type !== entityType || event.entity.id !== entityId) continue;
        const runId = contextOriginRunId(event.payload);
        const role = await this.runRole(runId);
        if (role) return role;
      }
      if (batch.length === 0 || batch.length < 1_000) return null;
      cursor = batch.at(-1)!.event_id;
    }
  }

  private async findEntityEvent(
    entityType: string,
    entityId: string,
    revision: number,
  ): Promise<ContextEvent | null> {
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.kernel.changes({ after_event_id: cursor, limit: 1_000 });
      const found = batch.find((event) => event.entity.type === entityType
        && event.entity.id === entityId
        && event.entity.revision === revision);
      if (found) return found;
      if (batch.length === 0 || batch.length < 1_000) return null;
      cursor = batch.at(-1)!.event_id;
    }
  }

  private async findEventById(eventId: string): Promise<ContextEvent | null> {
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.kernel.changes({ after_event_id: cursor, limit: 1_000 });
      const found = batch.find((event) => event.event_id === eventId);
      if (found) return found;
      if (batch.length === 0 || batch.length < 1_000) return null;
      cursor = batch.at(-1)!.event_id;
    }
  }

  private async requireHistoricalEntityVersion(
    ref: ContextEntityRef,
    role: string,
    label: string,
  ): Promise<{ event: ContextEvent; body: string; entity: LedgerEntity }> {
    if (ref.revision === undefined) throw new Error(`Context ${label} historical revision is missing`);
    const event = await this.findEntityEvent(ref.entity_type, ref.entity_id, ref.revision);
    if (!event || event.tombstone) {
      throw new Error(`Context ${label} historical reference not found: ${ref.entity_type}:${ref.entity_id}@${ref.revision}`);
    }
    const body = await this.kernel.readEventBody(event);
    if (!body) {
      throw new Error(`Context ${label} historical snapshot is erased or unavailable: ${ref.entity_type}:${ref.entity_id}@${ref.revision}`);
    }
    if (!await this.isEventVisibleToRole(event, role, body)) {
      throw new Error(`Context ${label} historical reference is not visible to run role ${role}: ${ref.entity_type}:${ref.entity_id}@${ref.revision}`);
    }
    if (canonicalJson(JSON.parse(body) as unknown) !== body) {
      throw new Error(`Context ${label} historical snapshot is not canonical JSON: ${ref.entity_type}:${ref.entity_id}@${ref.revision}`);
    }
    const validation = validateLedgerEntity(JSON.parse(body) as unknown);
    if (!validation.ok) {
      throw new Error(`Context ${label} historical snapshot is invalid: ${formatValidationIssues(validation.issues)}`);
    }
    if (
      validation.value.entity_type !== ref.entity_type
      || validation.value.entity_id !== ref.entity_id
      || validation.value.revision !== ref.revision
    ) {
      throw new Error(`Context ${label} historical snapshot binding mismatch: ${ref.entity_type}:${ref.entity_id}@${ref.revision}`);
    }
    return { event, body, entity: validation.value };
  }

  private async requireEntityRefs(refs: ContextEntityRef[], label: string, role: string): Promise<void> {
    for (const ref of refs) {
      this.requireClosedEntityTypes([ref.entity_type], `${label} reference`);
      const record = await this.kernel.get(ref.entity_type, ref.entity_id);
      if (!record || record.status === "deleted") {
        throw new Error(`Context ${label} reference not found: ${ref.entity_type}:${ref.entity_id}`);
      }
      if (ref.revision !== undefined && ref.revision !== record.revision) {
        const historical = await this.requireHistoricalEntityVersion(ref, role, label);
        this.requireRecordHash(ref, historical.entity.record_hash, label);
      } else if (!await this.isRecordVisibleToRole(record, role)) {
        throw new Error(`Context ${label} reference is not visible to run role ${role}: ${ref.entity_type}:${ref.entity_id}`);
      } else {
        this.requireRecordHash(ref, protocolRecordHash(record), label);
      }
    }
  }

  private async requireCurrentEntityRefs(
    refs: ContextEntityRef[],
    label: string,
    role: string,
  ): Promise<void> {
    await this.requireEntityRefs(refs, label, role);
    for (const ref of refs) {
      const current = await this.kernel.get(ref.entity_type, ref.entity_id);
      if (!current || current.status === "deleted") {
        throw new Error(`Context ${label} reference is not an active current record: ${ref.entity_type}:${ref.entity_id}`);
      }
      if (ref.revision !== undefined && ref.revision !== current.revision) {
        throw new Error(
          `Context ${label} references must name the current revision; use get_entity for history: ${ref.entity_type}:${ref.entity_id}@${ref.revision}`,
        );
      }
    }
  }

  private requireRecordHash(ref: ContextEntityRef, actual: string | undefined, label: string): void {
    if (ref.record_hash === undefined) return;
    if (!actual || ref.record_hash !== actual) {
      throw new Error(`Context ${label} reference record_hash mismatch: ${ref.entity_type}:${ref.entity_id}`);
    }
  }

  private requireExactRefs(refs: ContextEntityRef[], label: string): void {
    for (const ref of refs) {
      if (ref.revision === undefined || ref.record_hash === undefined) {
        throw new Error(
          `Context ${label} references require exact revision and record_hash: ${ref.entity_type}:${ref.entity_id}`,
        );
      }
    }
  }

  private requireContextBudget(run: ProjectedRecord, requested: number): void {
    const bounds = run.payload.bounds && typeof run.payload.bounds === "object" && !Array.isArray(run.payload.bounds)
      ? run.payload.bounds as Record<string, JsonValue>
      : {};
    const configured = bounds.context_budget_tokens;
    const maximum = typeof configured === "number" && Number.isSafeInteger(configured)
      ? configured
      : DEFAULT_CONTEXT_TOKENS;
    if (requested > maximum) {
      throw new Error(`Context token budget exceeds open_run bound of ${maximum}`);
    }
  }

  private async requireSemanticRefs(semantic: Record<string, unknown>, role: string): Promise<void> {
    const refs = collectEntityRefs(semantic);
    await this.requireEntityRefs(refs, "entity payload", role);
    const humanSeeds = Array.isArray(semantic.human_seed_refs)
      ? semantic.human_seed_refs.filter(isEntityRefShape)
      : [];
    for (const ref of humanSeeds) {
      const record = await this.kernel.get(ref.entity_type, ref.entity_id);
      if (
        !record
        || record.status === "deleted"
        || record.basis !== "explicit"
        || !this.isTrustedCrossRoleBody(record.body, record.basis)
      ) {
        throw new Error(`Human seed reference is not explicit user context: ${ref.entity_type}:${ref.entity_id}`);
      }
    }
  }

  private async buildCanonicalEntity(input: {
    entityType: LedgerEntityType;
    entityId: string;
    revision: number;
    occurredAt: string;
    basis: "observed" | "inferred";
    semantic: Record<string, unknown>;
    provenance: ContextProvenanceRef[];
    retention: RetentionPolicy;
  }): Promise<LedgerEntity> {
    const semantic = JSON.parse(canonicalJson(input.semantic)) as Record<string, unknown>;
    for (const field of RESERVED_ENTITY_FIELDS) {
      if (Object.hasOwn(semantic, field)) {
        throw new Error(`Canonical entity field is gateway-owned and cannot be supplied: ${field}`);
      }
    }
    const confidence = typeof semantic._confidence === "number" ? semantic._confidence : undefined;
    delete semantic._confidence;
    enforceProposalSemantics(input.entityType, semantic, this.actor, input.occurredAt);

    let previous: LedgerEntity | undefined;
    if (input.revision > 1) {
      const record = await this.kernel.get(input.entityType, input.entityId);
      if (!record || record.status === "deleted" || !record.body) {
        throw new Error(`Cannot revise missing canonical entity: ${input.entityType}:${input.entityId}`);
      }
      const parsed = JSON.parse(record.body) as unknown;
      const validation = validateLedgerEntity(parsed);
      if (!validation.ok) {
        throw new Error(`Stored canonical entity is invalid: ${formatValidationIssues(validation.issues)}`);
      }
      previous = validation.value;
      if (previous.revision + 1 !== input.revision) {
        throw new Error(`Canonical entity revision conflict: expected ${previous.revision + 1}, received ${input.revision}`);
      }
    }

    const occurredAt = new Date(Date.parse(input.occurredAt)).toISOString();
    const refs = input.provenance.map((entry) => ({
      entity_type: entry.ref.entity_type,
      entity_id: entry.ref.entity_id,
      ...(entry.ref.revision === undefined ? {} : { revision: entry.ref.revision }),
    }));
    const explicitRefs: typeof refs = [];
    for (const ref of refs) {
      const record = await this.kernel.get(ref.entity_type, ref.entity_id);
      if (record?.basis === "explicit") explicitRefs.push(ref);
    }
    const provenance: RecordProvenance = {
      basis: input.basis,
      evidence_refs: refs.filter((ref) => ref.entity_type === "evidence_item") as RecordProvenance["evidence_refs"],
      human_seed_refs: explicitRefs,
      derived_from_refs: refs,
      external_refs: input.provenance.map((entry) => ({
        provider: "context_kernel",
        kind: entry.relation,
        external_id: `${entry.ref.entity_type}:${entry.ref.entity_id}`,
        ...(entry.locator ? { uri: entry.locator } : {}),
        ...(entry.observed_at ? { observed_at: entry.observed_at } : {}),
      })),
      ...(input.basis === "inferred" ? { confidence: confidence ?? 0.5 } : {}),
      recorded_at: occurredAt,
    };
    const candidate = sealEntity({
      ...semantic,
      schema: ENTITY_SCHEMAS[input.entityType],
      entity_type: input.entityType,
      entity_id: input.entityId,
      owner_id: this.kernel.manifest.owner_id,
      revision: input.revision,
      created_at: previous?.created_at ?? occurredAt,
      updated_at: occurredAt,
      created_by: previous?.created_by ?? this.actor,
      last_modified_by: this.actor,
      provenance,
      retention: input.retention,
    } as Omit<LedgerEntity, "record_hash">) as LedgerEntity;
    const validation = validateLedgerEntity(candidate);
    if (!validation.ok) {
      throw new Error(`Canonical ${input.entityType} validation failed: ${formatValidationIssues(validation.issues)}`);
    }
    return validation.value;
  }

  private requireRunRole(run: ProjectedRecord, role: string): void {
    if (run.payload.role !== role) throw new Error(`Run belongs to ${String(run.payload.role)}, not ${role}`);
  }

  private requireRunWritable(run: ProjectedRecord): void {
    if (run.payload.phase === "complete") {
      throw new Error(`Context run is already terminal: ${run.entity_id}`);
    }
  }

  private async buildPack(
    tokenBudget: number,
    goal: string,
    role: string,
    includeRefs: ContextEntityRef[],
  ): Promise<ContextPack> {
    const raw = await this.kernel.assembleContextPack({
      entity_types: [...CONTEXT_ENTITY_TYPES],
      max_items: 200,
      max_chars: MAX_CONTEXT_CHARS,
      include_scratch: true,
    });
    return this.focusPack(raw, tokenBudget, goal, role, includeRefs);
  }

  private async packEnvelope(
    pack: ContextPack,
    runId: string,
    role: string,
    goal: string,
    tokenBudget: number,
    includeRefs: ContextEntityRef[],
  ): Promise<Record<string, unknown>> {
    if (!pack.watermark.last_event_id) {
      throw new Error("Context Pack cannot be issued without a ledger watermark");
    }
    const watermarkEvent = await this.findEventById(pack.watermark.last_event_id);
    if (!watermarkEvent || watermarkEvent.event_hash !== pack.watermark.last_event_hash) {
      throw new Error("Context Pack watermark is unavailable or mismatched");
    }
    const protocolPack = buildProtocolContextPack({
      source_pack: pack,
      ledger_id: this.kernel.manifest.workspace_id,
      owner_id: this.kernel.manifest.owner_id,
      run_id: runId,
      purpose: goal,
      agent_role: role,
      token_budget: tokenBudget,
      requested_refs: includeRefs,
      assembled_at: watermarkEvent.recorded_at,
      capabilities: this.authority().operations,
    });
    const receipt = makeContextPackReceipt(
      protocolPack,
      await this.kernel.signContextPackReceipt(canonicalJson(protocolPack)),
    );
    const exactRefs = protocolPack.trace.filter((trace) => includeRefs.some((ref) => (
      ref.entity_type === trace.ref.entity_type
      && ref.entity_id === trace.ref.entity_id
      && (ref.revision === undefined || ref.revision === trace.ref.revision)
      && (ref.record_hash === undefined || ref.record_hash === trace.ref.record_hash)
    )));
    return {
      context_pack_id: protocolPack.pack_id,
      context_pack_hash: protocolPack.pack_hash,
      run_id: runId,
      role,
      goal,
      derived: true,
      ...pack,
      protocol_pack: protocolPack,
      context_pack_receipt: receipt,
      requested_ref_trace: exactRefs,
      requested_refs_missing: includeRefs.filter((ref) => !exactRefs.some((trace) => (
        ref.entity_type === trace.ref.entity_type
        && ref.entity_id === trace.ref.entity_id
        && (ref.revision === undefined || ref.revision === trace.ref.revision)
        && (ref.record_hash === undefined || ref.record_hash === trace.ref.record_hash)
      ))),
    };
  }

  private async isPackItemVisibleToRole(item: ContextPackItem, role: string): Promise<boolean> {
    if (!(CONTEXT_ENTITY_TYPES as readonly string[]).includes(item.entity_type)) return false;
    if (this.isTrustedCrossRoleBody(item.body, item.basis)) return true;
    const runId = contextOriginRunId(item.payload);
    return (await this.runRole(runId)) === role;
  }

  private async focusPack(
    raw: ContextPack,
    tokenBudget: number,
    goal: string,
    role: string,
    includeRefs: ContextEntityRef[],
  ): Promise<ContextPack> {
    const goalTokens = focusTokens(goal);
    const requested = new Set(includeRefs.map((ref) => `${ref.entity_type}\u0000${ref.entity_id}`));
    const maxItems = Math.min(40, Math.max(6, Math.floor(tokenBudget / 384)));
    const maxChars = Math.min(MAX_CONTEXT_CHARS, tokenBudget * 4);
    const runRoles = new Map<string, string | null>();
    const roleForRun = async (runId: string | undefined): Promise<string | null> => {
      if (!runId) return null;
      if (runRoles.has(runId)) return runRoles.get(runId) ?? null;
      const run = await this.kernel.get("run", runId);
      const runRole = run && typeof run.payload.role === "string" ? run.payload.role : null;
      runRoles.set(runId, runRole);
      return runRole;
    };

    type Candidate = {
      kind: "durable" | "scratch";
      basis: "explicit" | "observed" | "inferred" | "system" | "scratch";
      item: ContextPackItem | ScratchCue;
      key: string;
      score: number;
      chars: number;
      occurredAt: string;
    };
    const candidates: Candidate[] = [];
    const purposeOmissions: PackOmission[] = [];
    const visibleDurable = new Map<string, {
      basis: "explicit" | "observed" | "inferred" | "system";
      item: ContextPackItem;
      key: string;
      overlap: number;
      roleMatch: boolean;
      forced: boolean;
      chars: number;
    }>();
    for (const basis of ["explicit", "observed", "inferred", "system"] as const) {
      for (const item of raw.context[basis]) {
        if (!await this.isPackItemVisibleToRole(item, role)) continue;
        const key = `${item.entity_type}\u0000${item.entity_id}`;
        const overlap = tokenOverlap(goalTokens, canonicalJson(item));
        const runId = contextOriginRunId(item.payload);
        const roleMatch = (await roleForRun(runId)) === role;
        const forced = requested.has(key);
        visibleDurable.set(key, {
          basis,
          item,
          key,
          overlap,
          roleMatch,
          forced,
          chars: canonicalJson(item).length,
        });
      }
    }

    // Relevance is graph-aware. A purpose-matched Place or Selection is not
    // useful if its exact supporting Evidence and Thread disappear from the
    // pack. Closure is limited to already role-visible records and exact
    // current revisions, so a provenance edge never becomes a cross-role read
    // or a historical-revision substitution.
    const relevanceScore = new Map<string, number>();
    const queue: string[] = [];
    for (const record of visibleDurable.values()) {
      if (!record.forced && record.basis !== "explicit" && record.overlap === 0) continue;
      const score = (record.forced ? 10_000 : 0)
        + record.overlap * 100
        + (record.roleMatch ? 25 : 0)
        + (record.basis === "explicit" ? 20 : record.basis === "observed" ? 8 : record.basis === "inferred" ? 3 : 0);
      relevanceScore.set(record.key, score);
      queue.push(record.key);
    }
    for (let index = 0; index < queue.length; index += 1) {
      const parentKey = queue[index]!;
      const parent = visibleDurable.get(parentKey)!;
      const parentScore = relevanceScore.get(parentKey)!;
      for (const ref of packDependencyRefs(parent.item)) {
        const dependencyKey = `${ref.entity_type}\u0000${ref.entity_id}`;
        const dependency = visibleDurable.get(dependencyKey);
        if (!dependency || (ref.revision !== undefined && ref.revision !== dependency.item.revision)) continue;
        const dependencyScore = Math.max(1, parentScore - 10);
        if ((relevanceScore.get(dependencyKey) ?? -1) >= dependencyScore) continue;
        const firstVisit = !relevanceScore.has(dependencyKey);
        relevanceScore.set(dependencyKey, dependencyScore);
        if (firstVisit) queue.push(dependencyKey);
      }
    }

    for (const record of visibleDurable.values()) {
      const score = relevanceScore.get(record.key);
      if (score === undefined) {
        purposeOmissions.push({
          entity_type: record.item.entity_type,
          entity_id: record.item.entity_id,
          reason: "query_mismatch",
        });
        continue;
      }
        candidates.push({
          kind: "durable",
          basis: record.basis,
          item: record.item,
          key: record.key,
          score,
          chars: record.chars,
          occurredAt: record.item.occurred_at,
        });
    }
    for (const cue of raw.context.scratch) {
      const runId = typeof cue.metadata.run_id === "string" ? cue.metadata.run_id : undefined;
      const roleMatch = (await roleForRun(runId)) === role;
      if (!roleMatch) continue;
      const overlap = tokenOverlap(goalTokens, cue.cue);
      if (overlap === 0) {
        purposeOmissions.push({ entity_type: "scratch", entity_id: cue.id, reason: "query_mismatch" });
        continue;
      }
      candidates.push({
        kind: "scratch",
        basis: "scratch",
        item: cue,
        key: `scratch\u0000${cue.id}`,
        score: overlap * 100 + (roleMatch ? 25 : 0) + 6,
        chars: canonicalJson(cue).length,
        occurredAt: cue.created_at,
      });
    }
    candidates.sort((left, right) => right.score - left.score
      || right.occurredAt.localeCompare(left.occurredAt)
      || left.key.localeCompare(right.key));
    const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
    const dependencyClosedGroup = (root: Candidate): Candidate[] | null => {
      const group: Candidate[] = [];
      const visited = new Set<string>();
      const stack = [root];
      while (stack.length > 0) {
        const candidate = stack.pop()!;
        if (visited.has(candidate.key)) continue;
        visited.add(candidate.key);
        group.push(candidate);
        if (candidate.kind !== "durable") continue;

        const item = candidate.item as ContextPackItem;
        for (const ref of packDependencyRefs(item)) {
          const dependency = candidateByKey.get(`${ref.entity_type}\u0000${ref.entity_id}`);
          if (!dependency || dependency.kind !== "durable") return null;
          const dependencyItem = dependency.item as ContextPackItem;
          if (ref.revision !== undefined && ref.revision !== dependencyItem.revision) return null;
          if (
            ref.record_hash !== undefined
            && ref.record_hash !== protocolRecordHashFromItem(dependencyItem)
          ) return null;
          stack.push(dependency);
        }
      }
      return group.sort((left, right) => right.score - left.score
        || right.occurredAt.localeCompare(left.occurredAt)
        || left.key.localeCompare(right.key));
    };
    const roots = candidates.filter((candidate) => {
      if (candidate.kind === "scratch") return true;
      const record = visibleDurable.get(candidate.key);
      return record !== undefined
        && (record.forced || record.basis === "explicit" || record.overlap > 0);
    });

    const context: ContextPack["context"] = {
      explicit: [],
      observed: [],
      inferred: [],
      system: [],
      scratch: [],
    };
    const selected = new Set<string>();
    let selectedChars = 0;
    for (const root of roots) {
      const group = dependencyClosedGroup(root);
      if (!group) continue;
      const additions = group.filter((candidate) => !selected.has(candidate.key));
      const groupChars = additions.reduce((sum, candidate) => sum + candidate.chars, 0);
      if (selected.size + additions.length > maxItems || selectedChars + groupChars > maxChars) continue;
      for (const candidate of additions) {
        selected.add(candidate.key);
        selectedChars += candidate.chars;
        if (candidate.kind === "scratch") context.scratch.push(candidate.item as ScratchCue);
        else context[candidate.basis as "explicit" | "observed" | "inferred" | "system"]
          .push(candidate.item as ContextPackItem);
      }
    }

    const focusOmissions = candidates
      .filter((candidate) => !selected.has(candidate.key))
      .map((candidate) => candidate.kind === "scratch"
        ? { entity_type: "scratch", entity_id: (candidate.item as ScratchCue).id, reason: "item_limit" as const }
        : {
            entity_type: (candidate.item as ContextPackItem).entity_type,
            entity_id: (candidate.item as ContextPackItem).entity_id,
            reason: "item_limit" as const,
          });
    const visibleRawOmissions: PackOmission[] = [];
    for (const omission of raw.omissions) {
      if (!omission.entity_type || !omission.entity_id) continue;
      if (!(CONTEXT_ENTITY_TYPES as readonly string[]).includes(omission.entity_type)) continue;
      const record = await this.kernel.get(omission.entity_type, omission.entity_id);
      if (record && await this.isRecordVisibleToRole(record, role)) visibleRawOmissions.push(omission);
    }
    const allOmissions = [...visibleRawOmissions, ...purposeOmissions, ...focusOmissions];
    const omissions = allOmissions.slice(0, 256);
    const omissionReasons = [
      "query_mismatch",
      "entity_type_filter",
      "basis_filter",
      "deleted",
      "missing_private_body",
      "item_limit",
      "character_limit",
      "scratch_expired",
    ] as const;
    const withoutHash: Omit<ContextPack, "pack_hash"> = {
      ...raw,
      constraints: {
        ...raw.constraints,
        query: goalTokens.length > 0 ? goalTokens.join(" ") : null,
        max_items: maxItems,
        max_chars: maxChars,
      },
      context,
      trace: raw.trace.filter((entry) => selected.has(`${entry.entity_type}\u0000${entry.entity_id}`)),
      omissions,
      omission_summary: {
        total: allOmissions.length,
        shown: omissions.length,
        by_reason: Object.fromEntries(omissionReasons.map((reason) => [
          reason,
          allOmissions.filter((entry) => entry.reason === reason).length,
        ])) as ContextPack["omission_summary"]["by_reason"],
      },
      selected_items: selected.size,
      selected_chars: selectedChars,
    };
    return { ...withoutHash, pack_hash: sha256(canonicalJson(withoutHash)) };
  }

  private async readVisibleChanges(
    afterEventId: string | undefined,
    requestedTypes: string[],
    limit: number,
    role: string,
  ): Promise<{ events: ContextEvent[]; cursor: string | null; scanned: number }> {
    const types = new Set(requestedTypes.length > 0 ? requestedTypes : CONTEXT_ENTITY_TYPES);
    for (const type of types) {
      if (!(CONTEXT_ENTITY_TYPES as readonly string[]).includes(type)) {
        throw new Error(`Context change entity type is not visible through this bridge: ${type}`);
      }
    }
    const visible: ContextEvent[] = [];
    let cursor = afterEventId;
    let scanned = 0;
    while (visible.length < limit) {
      const batchLimit = Math.min(1_000, Math.max(50, (limit - visible.length) * 2));
      const batch = await this.kernel.changes({ after_event_id: cursor, limit: batchLimit });
      if (batch.length === 0) break;
      for (const event of batch) {
        cursor = event.event_id;
        scanned += 1;
        if (types.has(event.entity.type) && await this.isEventVisibleToRole(event, role)) visible.push(event);
        if (visible.length === limit) break;
      }
      if (visible.length === limit || batch.length < batchLimit) break;
    }
    return { events: visible, cursor: cursor ?? null, scanned };
  }
}

function changeReceipt(event: ContextEvent, created: boolean): Record<string, unknown> {
  return {
    accepted: true,
    duplicate: !created,
    event_id: event.event_id,
    sequence: event.sequence,
    entity: {
      entity_type: event.entity.type,
      entity_id: event.entity.id,
      revision: event.entity.revision,
    },
    basis: event.basis,
    event_hash: event.event_hash,
  };
}

function jsonValue(value: unknown): JsonValue {
  return JSON.parse(canonicalJson(value)) as JsonValue;
}

function requiredString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} is missing`);
  return value;
}

function parseObjectBody(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function protocolRecordHash(record: ProjectedRecord): string | undefined {
  const body = parseObjectBody(record.body);
  return typeof body.record_hash === "string" ? body.record_hash : undefined;
}

function protocolRecordHashFromItem(item: ContextPackItem): string | undefined {
  const body = parseObjectBody(item.body);
  return typeof body.record_hash === "string" ? body.record_hash : undefined;
}

/**
 * Context selection is provenance-closed. These are the semantic support edges
 * that make a selected record defensible. Lineage-only `supersedes` pointers
 * are intentionally excluded: history is retrieved explicitly with get_entity
 * and must never force an old revision into a current Context Pack.
 */
function packDependencyRefs(item: ContextPackItem): ContextEntityRef[] {
  const body = parseObjectBody(item.body);
  const support: unknown[] = [body.provenance];
  switch (item.entity_type) {
    case "conversation":
      support.push(body.human_seed_refs, body.outcome);
      break;
    case "decision":
      support.push(body.target_refs);
      break;
    case "thread":
      support.push(body.claims, body.context_refs);
      break;
    case "selection_run":
      support.push(body.candidates);
      break;
    case "place":
      support.push(body.thread_ref, body.selection_run_ref);
      break;
    case "draft":
      support.push(body.source_refs, body.human_seed_refs, body.place_ref);
      break;
    case "feedback_signal":
      support.push(body.target_ref);
      break;
    default:
      break;
  }
  return collectEntityRefs(support).filter((ref) => !(
    ref.entity_type === item.entity_type && ref.entity_id === item.entity_id
  ));
}

function protocolHash(hash: string): string {
  return hash.startsWith("sha256:") ? hash : `sha256:${hash}`;
}

function contextOriginRunId(payload: Record<string, JsonValue>): string | undefined {
  if (typeof payload.origin_run_id === "string") return payload.origin_run_id;
  return typeof payload.run_id === "string" ? payload.run_id : undefined;
}

function dedupeByEntity<T extends { entity_type: string; entity_id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.entity_type}\u0000${item.entity_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown };
    if (!Number.isSafeInteger(parsed.offset) || Number(parsed.offset) < 0) throw new Error("invalid offset");
    return Number(parsed.offset);
  } catch {
    throw new Error("Invalid Context Kernel search cursor");
  }
}

function kernelIdempotency(namespace: string, value: string): string {
  return `${namespace}-${sha256(value)}`;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function deterministicScratchId(observedAt: number, material: string): string {
  return deterministicSortableId("scratch", observedAt, material);
}

function deterministicEntityId(occurredAt: number, material: string): string {
  return deterministicSortableId("ent", occurredAt, material);
}

function deterministicSortableId(prefix: string, occurredAt: number, material: string): string {
  if (!Number.isSafeInteger(occurredAt) || occurredAt < 0) {
    throw new TypeError("ID timestamp must be a valid non-negative timestamp");
  }
  let cursor = BigInt(occurredAt);
  let timestamp = "";
  for (let index = 0; index < 10; index += 1) {
    timestamp = CROCKFORD[Number(cursor & 31n)] + timestamp;
    cursor >>= 5n;
  }
  return `${prefix}_${timestamp}${sha256(material).slice(0, 16).toUpperCase()}`;
}

function assertScratchRetryMatches(
  existing: {
    cue: string;
    created_at: string;
    expires_at: string;
    basis: string;
    metadata: Record<string, JsonValue>;
  },
  requested: {
    cue: string;
    created_at: string;
    basis: string;
    metadata: Record<string, JsonValue>;
  },
  expiresAt: number,
): void {
  const matches = existing.cue === requested.cue
    && existing.created_at === new Date(Date.parse(requested.created_at)).toISOString()
    && existing.expires_at === new Date(expiresAt).toISOString()
    && existing.basis === requested.basis
    && canonicalJson(existing.metadata) === canonicalJson(requested.metadata);
  if (!matches) throw new Error("Scratch cue idempotency conflict: cue_id was reused with different content");
}

function evidenceText(content: Record<string, unknown>, key: string): string | undefined {
  const value = content[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function evidenceRetention(
  evidenceClass: string,
  retentionClass: string,
  expiresAt: string | undefined,
): RetentionPolicy {
  const classification = retentionClass === "local_private"
    ? "private"
    : retentionClass === "hub_eligible" && evidenceClass === "public_source"
      ? "public"
      : "eligible_shared";
  const replication = retentionClass === "hub_eligible" ? "eligible" : "local_only";
  return {
    classification,
    mode: expiresAt ? "ttl" : "durable",
    replication,
    body_storage: "encrypted_object",
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  };
}

function defaultProposalRetention(
  entityType: string,
  semantic: Record<string, unknown>,
): RetentionPolicy {
  const expiresAt = entityType === "place" && typeof semantic.expires_at === "string"
    ? semantic.expires_at
    : undefined;
  return {
    classification: "private",
    mode: expiresAt ? "ttl" : "durable",
    replication: "local_only",
    body_storage: "encrypted_object",
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  };
}

function structuralProvenance(provenance: ContextProvenanceRef[]): JsonValue {
  return provenance.map((entry) => ({
    ref: {
      entity_type: entry.ref.entity_type,
      entity_id: entry.ref.entity_id,
      ...(entry.ref.revision === undefined ? {} : { revision: entry.ref.revision }),
    },
    relation: entry.relation,
  }));
}

function normalizedCompletionMaterial(input: CompleteContextRunInput): {
  run_id: string;
  status: CompleteContextRunInput["status"];
  output_refs: Array<{
    entity_type: string;
    entity_id: string;
    revision: number;
    record_hash: string;
  }>;
  completion: {
    summary: string;
    completed_steps: string[];
    remaining_steps: string[];
    blocker: string | null;
  };
} {
  return {
    run_id: input.run_id,
    status: input.status,
    output_refs: input.output_refs.map((ref) => ({
      entity_type: ref.entity_type,
      entity_id: ref.entity_id,
      revision: ref.revision!,
      record_hash: ref.record_hash!,
    })),
    completion: {
      summary: input.summary,
      completed_steps: input.completed_steps,
      remaining_steps: input.remaining_steps,
      blocker: input.blocker ?? null,
    },
  };
}

function collectEntityRefs(value: unknown): ContextEntityRef[] {
  const refs: ContextEntityRef[] = [];
  const seen = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (isEntityRefShape(candidate)) {
      const key = `${candidate.entity_type}\u0000${candidate.entity_id}\u0000${candidate.revision ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push(candidate);
      }
    }
    if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (candidate && typeof candidate === "object") Object.values(candidate).forEach(visit);
  };
  visit(value);
  return refs;
}

function isEntityRefShape(value: unknown): value is ContextEntityRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.entity_type === "string"
    && typeof candidate.entity_id === "string"
    && (candidate.revision === undefined || Number.isSafeInteger(candidate.revision));
}

function enforceProposalSemantics(
  entityType: LedgerEntityType,
  semantic: Record<string, unknown>,
  actor: ActorRef,
  occurredAt: string,
): void {
  if (entityType === "context_statement" && (semantic.basis !== "inferred" || semantic.status !== "proposed")) {
    throw new Error("Agent context statements must have basis inferred and status proposed");
  }
  if (entityType === "place" && semantic.status !== "proposed") {
    throw new Error("Agent Places must begin with status proposed");
  }
  if (entityType === "draft" && semantic.status !== "working" && semantic.status !== "ready") {
    throw new Error("Agent drafts may have only working or ready status");
  }
  if (entityType === "feedback_signal") {
    if (semantic.recorded_by !== undefined && canonicalJson(semantic.recorded_by) !== canonicalJson(actor)) {
      throw new Error("Feedback recorded_by must match the authenticated bridge actor");
    }
    const normalizedOccurredAt = new Date(Date.parse(occurredAt)).toISOString();
    if (
      semantic.recorded_at !== undefined
      && new Date(Date.parse(String(semantic.recorded_at))).toISOString() !== normalizedOccurredAt
    ) {
      throw new Error("Feedback recorded_at must match the event occurred_at timestamp");
    }
    semantic.recorded_by = actor;
    semantic.recorded_at = normalizedOccurredAt;
  }
}

function formatValidationIssues(issues: Array<{ path: string; message: string }>): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

const FOCUS_STOPWORDS = new Set([
  "about", "after", "again", "against", "could", "current", "from", "have", "into", "just",
  "more", "one", "only", "other", "should", "that", "their", "there", "these", "they", "this",
  "through", "useful", "want", "what", "when", "where", "which", "with", "would", "your",
]);

function focusTokens(goal: string): string[] {
  const tokens = goal.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return [...new Set(tokens.filter((token) => token.length >= 3 && !FOCUS_STOPWORDS.has(token)))].sort();
}

function tokenOverlap(tokens: string[], value: string): number {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-US");
  return tokens.filter((token) => normalized.includes(token)).length;
}
