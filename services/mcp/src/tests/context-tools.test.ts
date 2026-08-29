import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CONTEXT_TOOL_NAMES,
  createQuietDeskServer,
  TOOL_NAMES,
} from "../server.js";
import {
  CONTEXT_KERNEL_OPERATIONS,
  type ContextKernelAuthority,
  type ContextKernelGateway,
  type QuietDeskGateway,
} from "../types.js";

function hubGateway(): QuietDeskGateway {
  const ok = async () => ({ ok: true });
  return {
    connectionState: () => ({ internalWriteConfigured: true }),
    health: async () => ({ status: "ok" }),
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

function agentAuthority(overrides: Partial<ContextKernelAuthority> = {}): ContextKernelAuthority {
  return {
    actor_type: "agent",
    roles: ["afi.daily-conversation"],
    operations: [...CONTEXT_KERNEL_OPERATIONS],
    allowed_event_kinds: [
      "context.statement.proposed",
      "conversation.outcome.proposed",
      "place.proposed",
    ],
    allowed_evidence_classes: ["public_source", "work_artifact"],
    allowed_cue_classes: ["authenticated_feed", "computer_history"],
    allowed_retention_classes: ["local_private", "local_portable", "hub_eligible"],
    user_confirmation: false,
    approval: false,
    execution: false,
    ...overrides,
  };
}

function contextGateway(
  calls: Array<{ method: string; input?: unknown }> = [],
  authority = agentAuthority(),
): ContextKernelGateway {
  const called = (method: string) => async (input?: unknown) => {
    calls.push({ method, ...(input === undefined ? {} : { input }) });
    return { method, accepted: true };
  };
  return {
    authority: () => authority,
    capabilities: called("capabilities"),
    openRun: called("openRun"),
    recordScratchCue: called("recordScratchCue"),
    recordEvidence: called("recordEvidence"),
    assembleContext: called("assembleContext"),
    refreshContext: called("refreshContext"),
    searchEntities: called("searchEntities"),
    getEntity: called("getEntity"),
    appendContextEvent: called("appendContextEvent"),
    getChanges: called("getChanges"),
    checkpointRun: called("checkpointRun"),
    completeContextRun: called("completeContextRun"),
  };
}

async function connectedClient(context: ContextKernelGateway) {
  const server = createQuietDeskServer(hubGateway(), context);
  const client = new Client({ name: "context-kernel-test", version: "1.0.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

test("optional Context Kernel injection preserves legacy tools and exposes exact harness-neutral parity", async () => {
  const { client, server } = await connectedClient(contextGateway());
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();

  assert.deepEqual(names, [...TOOL_NAMES, ...CONTEXT_TOOL_NAMES].sort());
  assert.equal(new Set(CONTEXT_TOOL_NAMES).size, CONTEXT_TOOL_NAMES.length);
  assert.equal(CONTEXT_TOOL_NAMES.some((name) => /confirm|approv|execut/.test(name)), false);
  assert.equal(listed.tools.find((tool) => tool.name === "assemble_context")?.annotations?.readOnlyHint, true);
  assert.equal(listed.tools.find((tool) => tool.name === "append_context_event")?.annotations?.openWorldHint, false);

  const capabilities = await client.callTool({ name: "context_capabilities", arguments: {} });
  assert.equal(capabilities.isError, undefined);
  assert.deepEqual((capabilities.structuredContent as { bridge: unknown }).bridge, {
    actor_type: "agent",
    roles: ["afi.daily-conversation"],
    operations: [...CONTEXT_KERNEL_OPERATIONS],
    allowed_event_kinds: [
      "context.statement.proposed",
      "conversation.outcome.proposed",
      "place.proposed",
    ],
    allowed_evidence_classes: ["public_source", "work_artifact"],
    allowed_cue_classes: ["authenticated_feed", "computer_history"],
    allowed_retention_classes: ["local_private", "local_portable", "hub_eligible"],
    user_confirmation: false,
    approval: false,
    execution: false,
  });

  await client.close();
  await server.close();
});

test("context tool catalog, prompt, capability map, and MCP metadata retain parity", async () => {
  const repoRoot = resolve(process.cwd(), "../..");
  const catalog = JSON.parse(await readFile(resolve(repoRoot, "agents/tool-catalog.json"), "utf8")) as {
    context_tools: Array<{ name: string }>;
  };
  const prompt = await readFile(resolve(repoRoot, "agents/prompts/base.md"), "utf8");
  const map = await readFile(resolve(repoRoot, "agents/capability-map.md"), "utf8");

  assert.deepEqual(catalog.context_tools.map((tool) => tool.name), [...CONTEXT_TOOL_NAMES]);
  for (const name of CONTEXT_TOOL_NAMES) {
    assert.match(prompt, new RegExp(`\\b${name}\\b`));
    assert.match(map, new RegExp(`\\b${name}\\b`));
  }
});

test("every context primitive delegates through the narrow gateway contract", async () => {
  const calls: Array<{ method: string; input?: unknown }> = [];
  const { client, server } = await connectedClient(contextGateway(calls));
  const timestamp = "2026-08-23T12:00:00.000Z";
  const entityRef = { entity_type: "context_statement", entity_id: "ctx_01", revision: 1 };

  const invocations: Array<{ name: string; arguments: Record<string, unknown> }> = [
    { name: "context_capabilities", arguments: {} },
    {
      name: "open_run",
      arguments: {
        role: "afi.daily-conversation",
        goal: "Hold today's bounded conversation",
        trigger: "manual",
        idempotency_key: "open/run_01",
        bounds: { max_iterations: 20, context_budget_tokens: 20_000, source_limit: 12 },
      },
    },
    {
      name: "record_scratch_cue",
      arguments: {
        run_id: "run_01",
        cue_id: "cue_01",
        cue_class: "computer_history",
        minimized_cue: "Several projects may have been active today.",
        observed_at: timestamp,
        expires_at: "2026-08-24T11:59:59.000Z",
      },
    },
    {
      name: "record_evidence",
      arguments: {
        run_id: "run_01",
        evidence_id: "evd_01",
        evidence_class: "public_source",
        occurred_at: timestamp,
        captured_at: timestamp,
        content_hash: `sha256:${"a".repeat(64)}`,
        content: { excerpt: "A minimized public observation." },
        retention_class: "hub_eligible",
        source_url: "https://example.test/source/1",
        external_id: "source-1",
        provenance: [],
      },
    },
    {
      name: "assemble_context",
      arguments: {
        run_id: "run_01",
        role: "afi.daily-conversation",
        goal: "Find a genuine meeting point",
        token_budget: 20_000,
        include_refs: [entityRef],
      },
    },
    {
      name: "refresh_context",
      arguments: {
        run_id: "run_01",
        context_pack_id: "pack_01",
        previous_context_pack_receipt: { schema: "afi.context_pack_receipt.v1" },
        after_event_id: "evt_01",
      },
    },
    {
      name: "search_entities",
      arguments: { run_id: "run_01", query: "publishing without feeds", entity_types: ["place"], limit: 10 },
    },
    {
      name: "get_entity",
      arguments: { run_id: "run_01", ref: entityRef },
    },
    {
      name: "append_context_event",
      arguments: {
        run_id: "run_01",
        event_id: "evt_02",
        idempotency_key: "run_01/evt_02",
        kind: "context.statement.proposed",
        entity: { entity_type: "context_statement", entity_id: "ctx_02", expected_revision: 0 },
        occurred_at: timestamp,
        payload: { statement: "Publishing should remain separate from discovery." },
        provenance: [],
      },
    },
    {
      name: "get_changes",
      arguments: { run_id: "run_01", after_event_id: "evt_01", entity_types: ["context_statement"], limit: 100 },
    },
    {
      name: "checkpoint_run",
      arguments: {
        run_id: "run_01",
        checkpoint_id: "checkpoint_01",
        completed_steps: ["outside review"],
        remaining_steps: ["human calibration"],
        next_step: "Ask for calibration",
      },
    },
    {
      name: "complete_context_run",
      arguments: {
        run_id: "run_01",
        status: "partial",
        summary: "Outside context is ready; human calibration remains.",
        output_refs: [entityRef],
        completed_steps: ["outside review"],
        remaining_steps: ["human calibration"],
        blocker: "Awaiting the person's words",
      },
    },
  ];

  for (const invocation of invocations) {
    const result = await client.callTool(invocation);
    assert.equal(result.isError, undefined, `${invocation.name} should delegate successfully`);
  }

  assert.deepEqual(calls.map((call) => call.method), [
    "capabilities",
    "openRun",
    "recordScratchCue",
    "recordEvidence",
    "assembleContext",
    "refreshContext",
    "searchEntities",
    "getEntity",
    "appendContextEvent",
    "getChanges",
    "checkpointRun",
    "completeContextRun",
  ]);

  await client.close();
  await server.close();
});

test("agent bridge rejects human authority, durable human capture, and approval events before the gateway", async () => {
  const calls: Array<{ method: string; input?: unknown }> = [];
  const authority = agentAuthority({
    allowed_event_kinds: ["action.approval_decided", "context.statement.confirmed"],
    allowed_evidence_classes: ["human_capture"],
  });
  const { client, server } = await connectedClient(contextGateway(calls, authority));
  const timestamp = "2026-08-23T12:00:00.000Z";

  const humanEvidence = await client.callTool({
    name: "record_evidence",
    arguments: {
      run_id: "run_01",
      evidence_id: "evd_human",
      evidence_class: "human_capture",
      occurred_at: timestamp,
      captured_at: timestamp,
      content_hash: `sha256:${"b".repeat(64)}`,
      content: { words: "This must be confirmed through a user-only surface." },
      retention_class: "local_private",
      provenance: [],
    },
  });
  assert.equal(humanEvidence.isError, true);

  for (const kind of ["action.approval_decided", "context.statement.confirmed"]) {
    const result = await client.callTool({
      name: "append_context_event",
      arguments: {
        run_id: "run_01",
        event_id: `evt_${kind}`,
        idempotency_key: `run_01/${kind}`,
        kind,
        entity: { entity_type: "context_statement", entity_id: "ctx_01", expected_revision: 1 },
        occurred_at: timestamp,
        payload: {},
        provenance: [],
      },
    });
    assert.equal(result.isError, true);
  }

  assert.deepEqual(calls, []);
  await client.close();
  await server.close();
});

test("scratch cues cannot outlive the 24-hour ephemeral boundary", async () => {
  const calls: Array<{ method: string; input?: unknown }> = [];
  const { client, server } = await connectedClient(contextGateway(calls));
  const result = await client.callTool({
    name: "record_scratch_cue",
    arguments: {
      run_id: "run_01",
      cue_id: "cue_too_long",
      cue_class: "computer_history",
      minimized_cue: "A current-day recall cue.",
      observed_at: "2026-08-23T00:00:00.000Z",
      expires_at: "2026-08-24T00:00:00.001Z",
    },
  });

  assert.equal(result.isError, true);
  assert.deepEqual(calls, []);
  await client.close();
  await server.close();
});
