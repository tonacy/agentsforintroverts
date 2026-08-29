#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [toolName, rawArguments = "{}"] = process.argv.slice(2);

if (!toolName || toolName === "--help" || toolName === "help") {
  process.stdout.write(`Usage:
  node scripts/call-context-tool.mjs list
  node scripts/call-context-tool.mjs <tool-name> '<json>'
  node scripts/call-context-tool.mjs <tool-name> @/absolute/input.json

QUIET_CONTEXT_ROOT must point to an initialized Context Kernel workspace.
`);
  process.exit(0);
}

const environment = Object.fromEntries(
  Object.entries(process.env).filter((entry) => typeof entry[1] === "string"),
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(serviceRoot, "dist/stdio.js")],
  cwd: serviceRoot,
  env: environment,
  stderr: "inherit",
});
const client = new Client(
  { name: "afi-context-cli-harness", version: "0.1.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  if (toolName === "list") {
    const result = await client.listTools();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const inputText = rawArguments.startsWith("@")
      ? await readFile(resolve(rawArguments.slice(1)), "utf8")
      : rawArguments;
    const input = JSON.parse(inputText);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("Tool arguments must be a JSON object");
    }
    const result = await client.callTool({ name: toolName, arguments: input });
    process.stdout.write(`${JSON.stringify(result.structuredContent ?? result, null, 2)}\n`);
    if (result.isError) process.exitCode = 1;
  }
} finally {
  await client.close().catch(() => undefined);
}
