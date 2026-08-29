import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HubClient } from "./hub-client.js";
import { LocalContextGateway } from "./local-context-gateway.js";
import { createQuietDeskServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const contextGateway = config.contextRoot
    ? await LocalContextGateway.open({
        root: config.contextRoot,
        actorId: config.contextActorId ?? "local-agent",
        roles: config.contextRoles ?? ["afi.daily-conversation", "afi.common-ground"],
      })
    : undefined;
  const server = createQuietDeskServer(new HubClient(config), contextGateway);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`Quiet Desk MCP failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
