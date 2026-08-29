# Connect Codex and Grok

Do this only after reviewing the synthetic Threads projection, its source
Activity, and the security boundaries. Start with dedicated test sources and
read-only scopes.

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

## Optional local Context Kernel

Initialize the private workspace using
[`CONTEXT_KERNEL.md`](./CONTEXT_KERNEL.md), then give each trusted bridge a
server-side agent identity and bounded roles:

```text
QUIET_CONTEXT_ROOT=/absolute/private/path/Quiet Desk
QUIET_CONTEXT_AGENT_ID=codex-local
QUIET_CONTEXT_ROLES=afi.daily-conversation,afi.common-ground
```

These values grant ordinary-agent context authority only. No MCP caller can
replace the configured identity with a user actor or add confirmation, approval,
publishing, merge, deployment, or execution authority. Omit
`QUIET_CONTEXT_ROOT` to retain the legacy Hub/feed-only tool surface.

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
  "QUIET_CONTEXT_ROOT",
  "QUIET_CONTEXT_AGENT_ID",
  "QUIET_CONTEXT_ROLES",
]
default_tools_approval_mode = "writes"
```

Restart the Codex host and inspect `/mcp`. Read tools can run without the write
secret; `observe_source`, feed, proposal, feedback, and completion tools fail
closed when `QUIET_HUB_SECRET` is absent. `list_capabilities` reports Hub
reachability and internal-write configuration separately; neither proves that a
live outside source adapter exists. `context_capabilities` is registered only
when the configured local workspace opens successfully.

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

1. Start one persistent Quiet Hub and connect the Codex bridge with read access.
   Call `list_capabilities` and keep the result as evidence; a health response is
   not a public-source connection.
2. Enable only the internal signing credential needed for `observe_source`.
   Record the bounded public bootstrap corpus and verify each returned event ID,
   source door, capture time, and content hash. A source observation must have no
   feed IDs before a separate distillation.
3. Open a Context Kernel run, record one fresh user-originated daily capture
   through a trusted user surface, and assemble a bounded Context Pack. Do not
   substitute connected activity for the person's account of the day.
4. Assemble `afi.daily-conversation`. Verify that it has no `proposal_only` tool,
   then run the readiness gate against the exact bounded corpus. A partial run is
   correct if the public-source collector, runtime context, or human capture is
   missing.
5. Allow the role to create or update at most three internal Place projections.
   Confirm every factual claim resolves to an observed source and every fit
   resolves to confirmed context. Choosing a Place authorizes no external action.
6. Implement the read-only Context Kernel projection for the Mac app; its
   bundled objects remain synthetic until that adapter exists.
7. Only after the public loop survives real daily use, add one private source at
   a time with a dedicated read-only scope. Inbox, calendar, and social accounts
   are separate grants, not one activation step.
8. Enable `propose_action` only for draft-capable roles after reviewing the exact
   human-handoff approval screen. Do not add an external executor until approval,
   idempotency, provider acknowledgement, and delivery evidence are independently tested.

Official references used for this bridge shape:

- OpenAI: https://developers.openai.com/plugins/build/mcp-server
- Codex MCP configuration: https://learn.chatgpt.com/docs/extend/mcp
- xAI custom connectors: https://docs.x.ai/grok/connectors
- xAI remote MCP tools: https://docs.x.ai/developers/tools/remote-mcp
