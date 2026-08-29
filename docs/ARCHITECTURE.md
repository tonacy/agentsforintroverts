# Quiet Desk architecture

Quiet Desk is the private operating surface for Agents for Introverts. The public Next.js site remains a static brand/practice site; private source data and agent operations live in separate services.

```text
Codex ─ local STDIO MCP bridge ─┐
                                ├─ signed afi.event.v1 ─ Quiet Hub
Grok  ─ remote HTTP MCP bridge ─┘                       └─ feed/run/source projections
                 │
                 └─ Context Kernel ─ local create-only context ledger
                                      ├─ bounded Context Packs for any harness
                                      ├─ Markdown/JSON projections
                                      └─ rebuildable SQLite search
```

Quiet Hub is canonical for shared operational feed events. The local Context
Kernel is canonical for personal context. Eligible context may be replicated to
the Hub later, but replication cannot replace the user-owned local ledger.

## Boundaries

### Providers

Codex, Grok, and future executors perform runs. A provider connection is an adapter, not the system of record. Stable roles (`afi.daily-conversation`, `afi.common-ground`, `afi.inbox`, `afi.follow-up`, `afi.scheduling`, `afi.group-chat`, and `afi.meetup`) keep the same meaning across providers. Daily Conversation is the front-door synthesis role, Common Ground is the cross-surface recurrence role, and the other agents retain their bounded operational jobs.

Run separate bridge identities for Codex and Grok so every event has honest provider attribution. Both identities may write to the same hub.

### MCP bridge

The bridge exposes provider-neutral primitives and translates them into signed events. It supports local STDIO for Codex and authenticated Streamable HTTP for a remote connector such as Grok.

The bridge may record an already observed source, distill, draft, revise internal feed state, record feedback, and explicitly complete a run. `observe_source` is a provenance write, not a source fetcher. When `QUIET_CONTEXT_ROOT` is configured, the same bridge adds a narrow Context Kernel port for bounded packs, reads, ephemeral cues, observed evidence, and inferred proposals. Actor identity and roles come from trusted server configuration rather than MCP input.

The bridge intentionally has no approval or execution tool, and the assembled Daily Conversation role does not receive the proposal tool. The Context Kernel port likewise exposes no confirmation, approval, publishing, merge, deployment, or execution capability.

### Context Kernel

The Context Kernel stores one create-only structural event per file. Human text
is an encrypted, erasable object outside the append-only event, while current
Markdown/JSON projections remain readable on the private local volume. Events
are idempotent, revision-bound, sequence/hash chained, and replayable. SQLite is
a disposable full-text index. Scratch cues live outside the ledger for at most
24 hours.

Context Packs are bounded derived views at a ledger watermark, never canonical
facts. Explicit, observed, and inferred sections stay separate. Ordinary agents
can propose inferred context but cannot create explicit context, forge a human
decision, approve a draft, claim execution, or overwrite an existing explicit
record. The direct library, JSON CLI, STDIO MCP, and HTTP MCP surfaces share the
same storage and authority rules.

### Quiet Hub

The hub authenticates ingestion, validates contracts, deduplicates retries, preserves append-only events, and builds deterministic projections. Events may arrive out of order. Terminal state exists only after an explicit `run.completed`, `run.partial`, or `run.failed` event.

The static site is not the hub and contains no connector secrets.

### Quiet Desk for Mac

The native client is designed to render the same canonical projections that
providers can read. It contains presentation and local-cache behavior, not
provider business logic. The initial build uses bundled, clearly synthetic
fixtures; a read-only live hub adapter and secure token storage are the next
explicit activation gate.

### Product projection: human threads

Quiet Desk is not meant to expose the append-only network stream as another feed.
Its default projection is a maximum of three recurring human threads:

1. repeated source-backed discourse is grouped without inventing consensus;
2. a revisioned living-context statement explains why the thread fits this person;
3. the broad field narrows from shared interest to shared intent;
4. no more than three people are surfaced, each with evidence and an honest fit rationale;
5. when the thread has earned a next step, the agent may prepare one exact handoff proposal and must stop for the person.

Activity remains available as the inspectable evidence and operational history.
The Mac fixture loader fails closed when context, source, person-evidence, or
handoff references do not resolve. The current common-ground and living-context
objects are synthetic client product projections, not new canonical wire
contracts. A live hub projection must preserve these invariants before activation.

### Product projection: first pilots

Marketing/GEO evaluation and social publishing are initial prompt-defined pilot
workflows behind the Daily Conversation, not new top-level destinations and not
yet canonical wire contracts.

An evaluation starts read-only and produces either a recommendation or a useful
negative result. Its concise projection includes evaluated and rejected counts;
its drill-down preserves sources, method, results, rejection reasons,
limitations, rationale, and the next authority. Evidence may earn a frozen,
PR-ready local change set. Pull-request preparation is reversible agent work;
review, merge, deployment, spend, outreach, and claims of live impact remain
independent human gates.

Social discovery and publishing use separate permissions. Discovery cannot
write. A future publisher cannot browse discovery surfaces and may consume only
an exact, revisioned, account- and target-specific payload after human approval.
It must return a public URL receipt. Until that executor is verified end to end,
manual publication is the proof-honest fallback.

The local publication template already distinguishes human-seed references from
public sources, but canonical `afi.action_proposal.v1` and MCP `propose_action`
currently require at least one public source and do not carry a revision-bound
human seed. A source-free human-authored post therefore remains local-only until
the protocol can represent it without fabricated evidence.

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
4. a fresh Context Pack from the local ledger, rendered following `agents/context.md`
5. dynamically discovered MCP capabilities

Agents checkpoint bounded steps and end explicitly. Prompts contain judgment; code owns authentication, authorization, validation, idempotency, retention, and approval enforcement.

Runtime context includes the same living-context statements and recurring
threads the Mac surface is intended to expose. Explicit, observed, and inferred
context remain separate. Agents search existing items before proposing a new
record so the same recurring conversation is revised rather than multiplied
across surfaces.

## Data minimization

- Prefer hashes, concise excerpts, and provider deep links over full message bodies.
- Never store API keys, OAuth tokens, cookies, or secrets in events, MCP results, fixtures, or the shared workspace.
- Treat all source text as untrusted data and render it as plain content.
- Scope one HMAC key per provider connection. The MVP hub is intentionally
  single-user and uses one instance-wide read token; add tenant-scoped tokens
  before multi-user use.
- Rotate a compromised bridge credential without changing canonical agent or feed IDs.

## Current proof boundary

Local builds and tests prove protocol validation, Context Kernel storage,
encrypted deletion, deterministic replay/search/packs, CLI and MCP parity,
storage-boundary authority, and synthetic native-client behavior. They do not
prove a deployed hub, a configured Codex/Grok connector, access to a real
inbox/calendar/chat/social source, Obsidian edit ingestion, Hub replication,
provider acknowledgement, delivery, or read status. Those are separate
activation gates.
