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
    health: async () => ({ status: "ok" }),
    listFeed: ok,
    getFeedItem: ok,
    listSources: ok,
    getSource: ok,
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
  assert.match(JSON.stringify(capabilities.structuredContent), /"execute":false/);

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
        content_hash: "a".repeat(64),
      }],
    },
  });

  assert.equal(result.isError, true);
  assert.equal(publishCalls, 0);

  await client.close();
  await server.close();
});
