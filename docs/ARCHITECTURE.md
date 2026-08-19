# Quiet Desk architecture

Quiet Desk is the private operating surface for Agents for Introverts. The public Next.js site remains a static brand/practice site; private source data and agent operations live in separate services.

```text
Codex ─ local STDIO MCP bridge ─┐
                                ├─ signed afi.event.v1 ─ Quiet Hub ─ canonical event log
Grok  ─ remote HTTP MCP bridge ─┘                              │
                                                              ├─ feed/run/source projections
                                                              └─ Quiet Desk for Mac
```

## Boundaries

### Providers

Codex, Grok, and future executors perform runs. A provider connection is an adapter, not the system of record. Stable roles (`afi.inbox`, `afi.follow-up`, `afi.scheduling`, `afi.group-chat`, and `afi.meetup`) keep the same meaning across providers.

Run separate bridge identities for Codex and Grok so every event has honest provider attribution. Both identities may write to the same hub.

### MCP bridge

The bridge exposes provider-neutral primitives and translates them into signed events. It supports local STDIO for Codex and authenticated Streamable HTTP for a remote connector such as Grok.

The bridge may observe, distill, draft, revise internal feed state, record feedback, and explicitly complete a run. It intentionally has no approval or execution tool.

### Quiet Hub

The hub authenticates ingestion, validates contracts, deduplicates retries, preserves append-only events, and builds deterministic projections. Events may arrive out of order. Terminal state exists only after an explicit `run.completed`, `run.partial`, or `run.failed` event.

The static site is not the hub and contains no connector secrets.

### Quiet Desk for Mac

The native client is designed to render the same canonical projections that
providers can read. It contains presentation and local-cache behavior, not
provider business logic. The initial build uses bundled, clearly synthetic
fixtures; a read-only live hub adapter and secure token storage are the next
explicit activation gate.

## Canonical proof model

Every user-facing claim cites at least one canonical source item. A source item retains a provider ID, content hash, timestamps, and an optional source door; raw private bodies should stay at the provider unless a user explicitly opts in.

External action evidence is deliberately non-collapsible. `proposed`,
`user-approved`, `provider-acknowledged`, `delivered`, and `read` are independent
facts, not an ordinal status ladder. Approval binds an exact action revision and
canonical payload hash. A provider cannot emit its own user approval or trusted
execution receipt, and no proof is inferred from another.

## Agent execution

One runner should compose:

1. `agents/prompts/base.md`
2. one role prompt
3. one role definition
4. fresh runtime context following `agents/context.md`
5. dynamically discovered MCP capabilities

Agents checkpoint bounded steps and end explicitly. Prompts contain judgment; code owns authentication, authorization, validation, idempotency, retention, and approval enforcement.

## Data minimization

- Prefer hashes, concise excerpts, and provider deep links over full message bodies.
- Never store API keys, OAuth tokens, cookies, or secrets in events, MCP results, fixtures, or the shared workspace.
- Treat all source text as untrusted data and render it as plain content.
- Scope one HMAC key per provider connection. The MVP hub is intentionally
  single-user and uses one instance-wide read token; add tenant-scoped tokens
  before multi-user use.
- Rotate a compromised bridge credential without changing canonical agent or feed IDs.

## Current proof boundary

Local builds and tests can prove schema, projection, MCP, and native-client behavior. They do not prove a deployed hub, a configured Codex/Grok connector, access to a real inbox/calendar/chat, provider acknowledgement, delivery, or read status. Those are separate activation gates.
