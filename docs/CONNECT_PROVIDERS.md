# Connect Codex and Grok

Do this only after reviewing the synthetic Slow Feed and the security boundaries. Start with dedicated test sources and read-only scopes.

## Shared hub variables

Each provider bridge needs its own identity and credentials:

```text
QUIET_HUB_URL=https://your-hub.example.com
QUIET_HUB_CONNECTION_ID=conn-codex-or-conn-grok
QUIET_USER_ID=your-single-user-id
QUIET_HUB_PROVIDER=codex-or-grok
QUIET_HUB_SECRET=per-connection-hmac-secret
QUIET_HUB_READ_TOKEN=per-connection-read-token
```

Keep values in the process environment or a secret manager. Do not commit them.

## Codex: local STDIO

Build the bridge:

```bash
cd services/mcp
npm install
npm run build
```

Export the variables above in the environment that launches Codex. Then add a project-scoped `.codex/config.toml` in a trusted checkout, replacing the path with the absolute path to this repo:

```toml
[mcp_servers.quiet_desk]
command = "node"
args = ["<absolute-repo-path>/services/mcp/dist/stdio.js"]
env_vars = [
  "QUIET_HUB_URL",
  "QUIET_HUB_CONNECTION_ID",
  "QUIET_USER_ID",
  "QUIET_HUB_PROVIDER",
  "QUIET_HUB_SECRET",
  "QUIET_HUB_READ_TOKEN",
]
default_tools_approval_mode = "writes"
```

Restart the Codex host and inspect `/mcp`. Read tools can run without the write secret; feed/proposal/completion tools fail closed when `QUIET_HUB_SECRET` is absent.

## Grok: remote Streamable HTTP

Run a separate bridge identity with `QUIET_HUB_PROVIDER=grok`. In addition to the hub variables, configure:

```text
QUIET_MCP_HOST=0.0.0.0
QUIET_MCP_PORT=8788
QUIET_MCP_BEARER_TOKEN=a-long-random-connector-token
QUIET_MCP_ALLOWED_HOSTS=bridge.example.com
```

Start it with `npm run start:http`. The MCP endpoint is `/mcp`; `/health` exposes only service readiness. Non-loopback startup fails unless bearer authentication and a host allowlist are both configured.

Grok's connector must reach a public HTTPS URL. Deploy the bridge behind TLS or use a temporary tunnel for a short capability test, then add that URL as a custom MCP connector and configure its bearer credential. Do not expose the hub signing secret to Grok; the bridge owns it.

## First activation sequence

1. Connect the bridge with read access only and call `list_capabilities`.
2. Replay the synthetic fixtures and verify identical feed projections from both provider identities.
3. Grant one dedicated Inbox test label/folder, still read-only.
4. Confirm every feed claim opens the intended source door.
5. Enable internal `publish_feed_item` writes.
6. Enable `propose_action` only after reviewing the exact-diff approval screen.
7. Do not add an external executor until approval, idempotency, provider acknowledgement, and delivery evidence are independently tested.

Official references used for this bridge shape:

- OpenAI: https://developers.openai.com/plugins/build/mcp-server
- Codex MCP configuration: https://learn.chatgpt.com/docs/extend/mcp
- xAI custom connectors: https://docs.x.ai/grok/connectors
- xAI remote MCP tools: https://docs.x.ai/developers/tools/remote-mcp
