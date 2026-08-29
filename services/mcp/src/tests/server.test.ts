import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createQuietDeskServer, TOOL_NAMES } from "../server.js";
import type { QuietDeskGateway } from "../types.js";

function gateway(): QuietDeskGateway {
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

test("MCP exposes the complete provider-neutral capability surface", async () => {
  const server = createQuietDeskServer(gateway());
  const client = new Client({ name: "quiet-desk-test", version: "1.0.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [...TOOL_NAMES].sort());
  assert.equal(listed.tools.find((tool) => tool.name === "list_feed_items")?.annotations?.readOnlyHint, true);
  assert.equal(listed.tools.find((tool) => tool.name === "propose_action")?.annotations?.openWorldHint, false);
  assert.equal(listed.tools.some((tool) => /approve|execute/.test(tool.name)), false);

  const capabilities = await client.callTool({ name: "list_capabilities", arguments: {} });
  assert.equal(capabilities.isError, undefined);
  const capabilityJson = JSON.stringify(capabilities.structuredContent);
  assert.match(capabilityJson, /"reachable":true/);
  assert.match(capabilityJson, /"internal_write":\{"available":true,"configured":true,"verified":false/);
  assert.match(capabilityJson, /"execute":false/);

  await client.close();
  await server.close();
});

test("list_capabilities distinguishes unreachable Hub and unconfigured internal writes", async () => {
  const unavailableGateway = gateway();
  unavailableGateway.connectionState = () => ({ internalWriteConfigured: false });
  unavailableGateway.health = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8787");
  };

  const server = createQuietDeskServer(unavailableGateway);
  const client = new Client({ name: "quiet-desk-test", version: "1.0.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const capabilities = await client.callTool({ name: "list_capabilities", arguments: {} });
  assert.equal(capabilities.isError, undefined);
  const capabilityJson = JSON.stringify(capabilities.structuredContent);
  assert.match(capabilityJson, /"reachable":false/);
  assert.match(capabilityJson, /ECONNREFUSED/);
  assert.match(capabilityJson, /"internal_write":\{"available":false,"configured":false/);
  assert.match(capabilityJson, /QUIET_HUB_SECRET is not configured/);
  assert.match(capabilityJson, /"observe":false/);

  await client.close();
  await server.close();
});

test("observe_source preserves minimized provenance and returns the complete Hub receipt", async () => {
  let observed: Parameters<QuietDeskGateway["observeSource"]>[0] | undefined;
  const observingGateway = gateway();
  observingGateway.observeSource = async (input) => {
    observed = input;
    return {
      accepted: true,
      schema: "afi.event.v1",
      event_id: "event-source-1",
      run_id: "run-source-1",
      duplicate: false,
      accepted_at: "2026-08-20T16:31:00.000Z",
    };
  };

  const server = createQuietDeskServer(observingGateway);
  const client = new Client({ name: "quiet-desk-test", version: "1.0.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const sourceArguments = {
    run_id: "run-source-1",
    agent_key: "afi.daily-conversation",
    sequence: 1,
    trigger: "source_event",
    source_item_id: "source-web-1",
    external_id: "https://example.test/posts/1",
    kind: "web",
    url: "https://example.test/posts/1",
    title: "A public conversation",
    author: "Example Author",
    excerpt: "A bounded excerpt retained as source material.",
    metadata: { publication: "Example", tags: ["agents", "discourse"] },
    captured_at: "2026-08-20T16:30:00.000Z",
    content_hash: `sha256:${"b".repeat(64)}`,
  };
  const result = await client.callTool({ name: "observe_source", arguments: sourceArguments });

  assert.equal(result.isError, undefined);
  assert.deepEqual(observed, sourceArguments);
  assert.deepEqual(result.structuredContent, {
    accepted: true,
    schema: "afi.event.v1",
    event_id: "event-source-1",
    run_id: "run-source-1",
    duplicate: false,
    accepted_at: "2026-08-20T16:31:00.000Z",
  });
  assert.equal("summary" in observed!, false);
  assert.equal("interpretation" in observed!, false);

  await client.close();
  await server.close();
});

test("tool catalog, system prompt, and MCP metadata retain action parity", async () => {
  const repoRoot = resolve(process.cwd(), "../..");
  const catalog = JSON.parse(await readFile(resolve(repoRoot, "agents/tool-catalog.json"), "utf8")) as {
    tools: Array<{ name: string }>;
  };
  const prompt = await readFile(resolve(repoRoot, "agents/prompts/base.md"), "utf8");
  const map = await readFile(resolve(repoRoot, "agents/capability-map.md"), "utf8");

  assert.deepEqual(catalog.tools.map((tool) => tool.name).sort(), [...TOOL_NAMES].sort());
  for (const name of TOOL_NAMES) {
    assert.match(prompt, new RegExp(`\\b${name}\\b`));
    assert.match(map, new RegExp(`\\b${name}\\b`));
  }
});

test("write tools reject non-HTTP source doors before reaching the hub", async () => {
  let publishCalls = 0;
  const guardedGateway = gateway();
  guardedGateway.publishFeedItem = async () => {
    publishCalls += 1;
    return { ok: true };
  };

  const server = createQuietDeskServer(guardedGateway);
  const client = new Client({ name: "quiet-desk-test", version: "1.0.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const result = await client.callTool({
    name: "publish_feed_item",
    arguments: {
      run_id: "run-unsafe-url",
      agent_key: "afi.inbox",
      sequence: 1,
      feed_item_id: "feed-unsafe-url",
      headline: "Untrusted source link",
      summary: "This request must fail before ingestion.",
      why_it_matters: "Source doors are user-openable.",
      lane: "needs_you",
      confidence: 1,
      claims: [{
        claim_id: "claim-unsafe-url",
        kind: "security",
        text: "The embedded source uses an unsafe scheme.",
        source_refs: ["source-unsafe-url"],
      }],
      sources: [{
        source_item_id: "source-unsafe-url",
        external_id: "external-unsafe-url",
        kind: "email",
        url: "javascript:alert(1)",
        captured_at: "2026-08-19T03:00:00.000Z",
        content_hash: `sha256:${"a".repeat(64)}`,
      }],
    },
  });

  assert.equal(result.isError, true);
  assert.equal(publishCalls, 0);

  await client.close();
  await server.close();
});
