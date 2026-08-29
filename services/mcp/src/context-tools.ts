import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  CONTEXT_KERNEL_OPERATIONS,
  type ContextKernelAuthority,
  type ContextKernelGateway,
  type ContextKernelOperation,
} from "./types.js";

export const CONTEXT_TOOL_NAMES = CONTEXT_KERNEL_OPERATIONS;

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const internalWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const timestampSchema = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)),
  "Must be an RFC 3339 timestamp",
);

const payloadHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const httpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Source doors must use HTTP or HTTPS");

const jsonObjectSchema = z.record(z.string(), z.unknown());

const entityRefSchema = z.object({
  entity_type: z.string().min(1).max(128),
  entity_id: z.string().min(1).max(256),
  revision: z.number().int().min(1).optional(),
  record_hash: payloadHashSchema.optional(),
});

const provenanceSchema = z.object({
  ref: entityRefSchema,
  relation: z.string().min(1).max(128),
  locator: z.string().min(1).max(2_048).optional(),
  excerpt: z.string().min(1).max(4_000).optional(),
  observed_at: timestampSchema.optional(),
});

function structured(result: unknown): Record<string, unknown> {
  return result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : { value: result };
}

function textPreview(label: string, result: unknown): string {
  const json = JSON.stringify(result, null, 2);
  const preview = json.length > 6_000 ? `${json.slice(0, 6_000)}\n…` : json;
  return `${label}\n${preview}`;
}

async function resultOf(label: string, operation: () => Promise<unknown>) {
  try {
    const result = await operation();
    return {
      structuredContent: structured(result),
      content: [{ type: "text" as const, text: textPreview(label, result) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `${label} failed: ${message}` }],
    };
  }
}

function ordinaryAgentAuthority(gateway: ContextKernelGateway): ContextKernelAuthority {
  const authority = gateway.authority();
  if (
    authority.actor_type !== "agent"
    || authority.user_confirmation !== false
    || authority.approval !== false
    || authority.execution !== false
  ) {
    throw new Error("The ordinary agent bridge requires agent-only authority with confirmation, approval, and execution disabled");
  }
  return authority;
}

function requireOperation(
  gateway: ContextKernelGateway,
  operation: ContextKernelOperation,
): ContextKernelAuthority {
  const authority = ordinaryAgentAuthority(gateway);
  if (!authority.operations.includes(operation)) {
    throw new Error(`Context Kernel operation is not authorized for this bridge: ${operation}`);
  }
  return authority;
}

function scopeMatches(value: string, scopes: string[]): boolean {
  return scopes.some((scope) => scope === "*"
    || scope === value
    || (scope.endsWith(".*") && value.startsWith(scope.slice(0, -1))));
}

const forbiddenAuthorityEvent = /(?:^|\.)(?:confirmed|approved|approval_decided|executed|execution_receipt_recorded|delivered|read|sent|published|merged|deployed)$/;

function requireEventKind(authority: ContextKernelAuthority, kind: string): void {
  if (forbiddenAuthorityEvent.test(kind) || /(?:^|\.)(?:approval|execution)(?:\.|$)/.test(kind)) {
    throw new Error(`Agent bridges cannot append confirmation, approval, or execution events: ${kind}`);
  }
  if (!scopeMatches(kind, authority.allowed_event_kinds)) {
    throw new Error(`Context event kind is not authorized for this bridge: ${kind}`);
  }
}

const forbiddenHumanEvidenceClasses = new Set([
  "human_capture",
  "confirmed_human_capture",
  "human_decision",
  "approval_receipt",
]);

function requireEvidenceAuthority(
  authority: ContextKernelAuthority,
  evidenceClass: string,
  retentionClass: string,
): void {
  if (forbiddenHumanEvidenceClasses.has(evidenceClass)) {
    throw new Error(`Agent bridges cannot record user-confirmed evidence: ${evidenceClass}`);
  }
  if (!scopeMatches(evidenceClass, authority.allowed_evidence_classes)) {
    throw new Error(`Evidence class is not authorized for this bridge: ${evidenceClass}`);
  }
  if (!scopeMatches(retentionClass, authority.allowed_retention_classes)) {
    throw new Error(`Retention class is not authorized for this bridge: ${retentionClass}`);
  }
}

const scratchCueSchema = z.object({
  run_id: z.string().min(1).max(256),
  cue_id: z.string().min(1).max(256),
  cue_class: z.string().min(1).max(128),
  minimized_cue: z.string().min(1).max(4_000),
  observed_at: timestampSchema,
  expires_at: timestampSchema,
  source_scope: z.string().min(1).max(512).optional(),
  metadata: jsonObjectSchema.optional(),
}).superRefine((value, context) => {
  const observed = Date.parse(value.observed_at);
  const expires = Date.parse(value.expires_at);
  if (expires <= observed) {
    context.addIssue({ code: "custom", path: ["expires_at"], message: "Scratch cues must expire after they are observed" });
  } else if (expires - observed > 24 * 60 * 60 * 1_000) {
    context.addIssue({ code: "custom", path: ["expires_at"], message: "Scratch cues may live for at most 24 hours" });
  }
});

export function registerContextKernelTools(
  server: McpServer,
  gateway: ContextKernelGateway,
): void {
  server.registerTool("context_capabilities", {
    title: "List Context Kernel capabilities",
    description: "Discover the current Context Kernel resources, roles, event scopes, and hard authority boundaries available to this agent bridge.",
    inputSchema: z.object({}),
    annotations: readAnnotations,
  }, async () => resultOf("Context Kernel capabilities", async () => {
    const authority = requireOperation(gateway, "context_capabilities");
    return {
      kernel: await gateway.capabilities(),
      bridge: {
        actor_type: authority.actor_type,
        roles: authority.roles,
        operations: authority.operations,
        allowed_event_kinds: authority.allowed_event_kinds,
        allowed_evidence_classes: authority.allowed_evidence_classes,
        allowed_cue_classes: authority.allowed_cue_classes,
        allowed_retention_classes: authority.allowed_retention_classes,
        user_confirmation: false,
        approval: false,
        execution: false,
      },
    };
  }));

  server.registerTool("open_run", {
    title: "Open Context Kernel run",
    description: "Open an idempotent, bounded agent run under one authorized role. Actor identity and authority come from the bridge connection, not the caller.",
    inputSchema: z.object({
      role: z.string().min(1).max(128),
      goal: z.string().min(1).max(8_000),
      trigger: z.string().min(1).max(128).optional(),
      idempotency_key: z.string().min(1).max(512),
      bounds: z.object({
        max_iterations: z.number().int().min(1).max(10_000).optional(),
        context_budget_tokens: z.number().int().min(256).max(1_000_000).optional(),
        source_limit: z.number().int().min(0).max(10_000).optional(),
        deadline_at: timestampSchema.optional(),
      }),
      metadata: jsonObjectSchema.optional(),
    }),
    annotations: internalWriteAnnotations,
  }, async (input) => resultOf("Opened Context Kernel run", async () => {
    const authority = requireOperation(gateway, "open_run");
    if (!scopeMatches(input.role, authority.roles)) {
      throw new Error(`Context role is not authorized for this bridge: ${input.role}`);
    }
    return gateway.openRun(input);
  }));

  server.registerTool("record_scratch_cue", {
    title: "Record ephemeral context cue",
    description: "Record one minimized, non-citable run-local cue with a maximum 24-hour lifetime. It must not enter the durable ledger or Quiet Hub.",
    inputSchema: scratchCueSchema,
    annotations: internalWriteAnnotations,
  }, async (input) => resultOf(`Recorded ephemeral cue ${input.cue_id}`, async () => {
    const authority = requireOperation(gateway, "record_scratch_cue");
    if (!scopeMatches(input.cue_class, authority.allowed_cue_classes)) {
      throw new Error(`Scratch cue class is not authorized for this bridge: ${input.cue_class}`);
    }
    return gateway.recordScratchCue(input);
  }));

  server.registerTool("record_evidence", {
    title: "Record durable context evidence",
    description: "Record minimized durable evidence with provenance and retention. content_hash must bind the exact canonical JSON content object. User-confirmed captures, decisions, approvals, and execution proof are intentionally unavailable here.",
    inputSchema: z.object({
      run_id: z.string().min(1).max(256),
      evidence_id: z.string().min(1).max(256),
      evidence_class: z.string().min(1).max(128),
      occurred_at: timestampSchema,
      captured_at: timestampSchema,
      content_hash: payloadHashSchema,
      content: jsonObjectSchema,
      retention_class: z.string().min(1).max(128),
      expires_at: timestampSchema.optional(),
      source_url: httpUrlSchema.optional(),
      external_id: z.string().min(1).max(512).optional(),
      provenance: z.array(provenanceSchema).max(1_000).default([]),
    }),
    annotations: internalWriteAnnotations,
  }, async (input) => resultOf(`Recorded evidence ${input.evidence_id}`, async () => {
    const authority = requireOperation(gateway, "record_evidence");
    requireEvidenceAuthority(authority, input.evidence_class, input.retention_class);
    return gateway.recordEvidence(input);
  }));

  server.registerTool("assemble_context", {
    title: "Assemble runtime context",
    description: "Build a bounded, revision-bound Context Pack for one goal at a deterministic ledger watermark. The pack is a projection, not new truth.",
    inputSchema: z.object({
      run_id: z.string().min(1).max(256),
      role: z.string().min(1).max(128),
      goal: z.string().min(1).max(8_000),
      token_budget: z.number().int().min(256).max(1_000_000),
      include_refs: z.array(entityRefSchema).max(1_000).optional(),
      after_event_id: z.string().min(1).max(256).optional(),
    }),
    annotations: readAnnotations,
  }, async (input) => resultOf("Assembled Context Pack", async () => {
    const authority = requireOperation(gateway, "assemble_context");
    if (!scopeMatches(input.role, authority.roles)) {
      throw new Error(`Context role is not authorized for this bridge: ${input.role}`);
    }
    return gateway.assembleContext(input);
  }));

  server.registerTool("refresh_context", {
    title: "Refresh runtime context",
    description: "Refresh a prior Context Pack from a ledger cursor. The full workspace-authenticated receipt returned by assemble_context is required so another process can verify the old run, purpose, role, requested references, and pack identity.",
    inputSchema: z.object({
      run_id: z.string().min(1).max(256),
      context_pack_id: z.string().min(1).max(256),
      previous_context_pack_receipt: jsonObjectSchema,
      after_event_id: z.string().min(1).max(256).optional(),
      token_budget: z.number().int().min(256).max(1_000_000).optional(),
    }),
    annotations: readAnnotations,
  }, async (input) => resultOf(`Refreshed Context Pack ${input.context_pack_id}`, async () => {
    requireOperation(gateway, "refresh_context");
    return gateway.refreshContext(input);
  }));

  server.registerTool("search_entities", {
    title: "Search context entities",
    description: "Search visible Context Kernel entities and return revision-bound previews suitable for selective drill-down.",
    inputSchema: z.object({
      run_id: z.string().min(1).max(256),
      query: z.string().min(1).max(8_000),
      entity_types: z.array(z.string().min(1).max(128)).max(100).optional(),
      statuses: z.array(z.string().min(1).max(128)).max(100).optional(),
      limit: z.number().int().min(1).max(100).default(30),
      cursor: z.string().min(1).max(1_024).optional(),
    }),
    annotations: readAnnotations,
  }, async (input) => resultOf("Context entity search", async () => {
    requireOperation(gateway, "search_entities");
    return gateway.searchEntities(input);
  }));

  server.registerTool("get_entity", {
    title: "Get context entity",
    description: "Read one visible canonical entity at an exact or current revision with its provenance and lifecycle state.",
    inputSchema: z.object({
      run_id: z.string().min(1).max(256),
      ref: entityRefSchema,
    }),
    annotations: readAnnotations,
  }, async (input) => resultOf(`Context entity ${input.ref.entity_id}`, async () => {
    requireOperation(gateway, "get_entity");
    return gateway.getEntity(input);
  }));

  server.registerTool("append_context_event", {
    title: "Append proposed context event",
    description: "Append one authorized canonical proposal with compare-and-swap revision and provenance. Call context_capabilities for each kind's entity type and required payload. This cannot confirm user context, approve, execute, publish, merge, or deploy.",
    inputSchema: z.object({
      run_id: z.string().min(1).max(256),
      event_id: z.string().min(1).max(256),
      idempotency_key: z.string().min(1).max(512),
      kind: z.string().min(1).max(256),
      entity: z.object({
        entity_type: z.string().min(1).max(128),
        entity_id: z.string().min(1).max(256),
        expected_revision: z.number().int().min(0).optional(),
      }),
      occurred_at: timestampSchema,
      payload: jsonObjectSchema,
      provenance: z.array(provenanceSchema).max(1_000).default([]),
    }),
    annotations: internalWriteAnnotations,
  }, async (input) => resultOf(`Appended proposed context event ${input.event_id}`, async () => {
    const authority = requireOperation(gateway, "append_context_event");
    requireEventKind(authority, input.kind);
    return gateway.appendContextEvent(input);
  }));

  server.registerTool("get_changes", {
    title: "Get Context Kernel changes",
    description: "Read visible canonical changes after a ledger cursor for long-lived runs and cross-harness refresh.",
    inputSchema: z.object({
      run_id: z.string().min(1).max(256),
      after_event_id: z.string().min(1).max(256).optional(),
      entity_types: z.array(z.string().min(1).max(128)).max(100).optional(),
      limit: z.number().int().min(1).max(1_000).default(100),
      cursor: z.string().min(1).max(1_024).optional(),
    }),
    annotations: readAnnotations,
  }, async (input) => resultOf("Context Kernel changes", async () => {
    requireOperation(gateway, "get_changes");
    return gateway.getChanges(input);
  }));

  server.registerTool("checkpoint_run", {
    title: "Checkpoint Context Kernel run",
    description: "Persist bounded resumable progress without claiming that the run or any external action completed.",
    inputSchema: z.object({
      run_id: z.string().min(1).max(256),
      checkpoint_id: z.string().min(1).max(256),
      completed_steps: z.array(z.string().min(1).max(2_000)).max(1_000),
      remaining_steps: z.array(z.string().min(1).max(2_000)).max(1_000),
      next_step: z.string().min(1).max(4_000).optional(),
      state: jsonObjectSchema.optional(),
      expected_run_revision: z.number().int().min(0).optional(),
    }),
    annotations: internalWriteAnnotations,
  }, async (input) => resultOf(`Checkpointed Context Kernel run ${input.run_id}`, async () => {
    requireOperation(gateway, "checkpoint_run");
    return gateway.checkpointRun(input);
  }));

  server.registerTool("complete_context_run", {
    title: "Complete Context Kernel run",
    description: "Explicitly close a Context Kernel run as completed, partial, or failed. Completion does not imply approval, execution, delivery, merge, or deployment.",
    inputSchema: z.object({
      run_id: z.string().min(1).max(256),
      status: z.enum(["completed", "partial", "failed"]),
      summary: z.string().min(1).max(8_000),
      output_refs: z.array(entityRefSchema).max(1_000).default([]),
      completed_steps: z.array(z.string().min(1).max(2_000)).max(1_000),
      remaining_steps: z.array(z.string().min(1).max(2_000)).max(1_000),
      blocker: z.string().min(1).max(8_000).optional(),
    }),
    annotations: internalWriteAnnotations,
  }, async (input) => resultOf(`Context Kernel run ${input.run_id} ${input.status}`, async () => {
    requireOperation(gateway, "complete_context_run");
    return gateway.completeContextRun(input);
  }));
}
