import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HubClient } from "./hub-client.js";
import { createQuietDeskServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createQuietDeskServer(new HubClient(config));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`Quiet Desk MCP failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
