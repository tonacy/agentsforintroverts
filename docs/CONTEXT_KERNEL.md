# Context Kernel v0

The Context Kernel is the harness-agnostic memory layer for Agents for
Introverts. It lets Codex, another MCP client, a CLI, or a future app see the
same current context without letting any of those harnesses silently decide what
the person believes.

## The decision

The filesystem is canonical. Obsidian is an optional reader. SQLite is a
disposable index. Quiet Hub may eventually replicate eligible records, but it is
not the primary copy of personal context.

```text
outside observations ─┐
work artifacts ───────┼──> local create-only ledger ──> JSON/Markdown projections
daily conversation ───┘              │                           │
                                     ├──> Context Pack ──> any agent harness
ephemeral browser/history cues ──────┘       │
       (scratch, maximum 24h)                └──> SQLite FTS5 (rebuildable)

agent proposal ──> inferred
public evidence ─> observed
trusted user surface ─> explicit
```

The three durable bases are deliberately different:

- `explicit` is a user-originated statement or a change bound to recorded user
  confirmation.
- `observed` is minimized evidence with provenance.
- `inferred` is an agent interpretation or proposal. Repetition never promotes
  it to explicit context.

Scratch cues are uncertain navigation or recall hints. They do not enter the
ledger, are not citable, are not replicated, and expire within 24 hours.

## What is implemented

`services/context-kernel` provides the direct TypeScript API and a JSON CLI.
`services/mcp` exposes the same ordinary-agent operations over STDIO or
authenticated Streamable HTTP when a workspace is configured.

The direct API and CLI are trusted owner/administrator surfaces. Their caller-
supplied actor labels are audit metadata, not authentication. Interchangeable
agents must use the MCP bridge, whose process configuration supplies the actor
identity, roles, and bounded operation set. Possession of the workspace and its
encryption key is equivalent to local owner access.

The durable loop is:

1. record minimized outside evidence and user-authorized inside context;
2. open a bounded run and assemble a role- and purpose-focused Context Pack at
   a named watermark;
3. search or drill into only the records the agent needs;
4. record an observed or inferred proposal, selection result, Thread, Place, or
   draft;
5. let the trusted owner API/CLI confirm, correct, reject, or delete it (a
   dedicated confirmation UI remains an activation gate); and
6. refresh from the ledger cursor so another harness sees the same correction.

`open_run` fixes the role, goal, and maximum context budget for the life of the
run. `assemble_context` cannot replace that purpose or exceed the bound. It
returns both the local selection and an `afi.context_pack.v1` receipt whose MAC
is derived from the workspace key. `refresh_context` authenticates that receipt
and its run, role, owner, purpose, requested references, and exact watermark;
an opaque pack ID or a self-consistent rehash is not sufficient. If a requested
exact revision has since changed or been deleted, refresh fails explicitly and
the harness must assemble a new pack with current references.

The protocol includes canonical entities for Evidence, Context Statements,
Conversations and Outcomes, Decisions, Threads, Selection Runs, Places, Drafts,
Feedback, Context Packs, and Scratch Cues. A Selection Run may explicitly
record `none_worth_recommending`; the system has no content quota.

## Storage and privacy

One structural event is written per immutable file. Events use sortable IDs,
monotonic revisions, idempotency keys, sequence numbers, and a previous-event
hash chain. Free-form `body` text is stored as an AES-256-GCM object outside the
ledger. Closed context entities must carry a canonical protocol snapshot in
that encrypted body; the storage boundary validates its type, ID, revision,
owner, actor, basis, record hash, and semantic authority. Operational `run`
records remain a separate local lifecycle type and are excluded from protocol
projection.

A tombstone is terminal: it erases every body object for that entity,
invalidates plaintext projections and SQLite immediately, and rebuilds only
from the redacted current state. TTL records use the same tombstone path when
the MCP bridge opens or `prune-expired` runs. Immutable history keeps structural
hashes and references, but provenance excerpts are not copied into its plaintext
payload.

The generated Markdown/JSON projections contain decrypted current text so a
person and an agent can read it. The entire workspace must therefore remain on
an encrypted, access-controlled volume; encryption of body objects protects the
immutable history and makes deletion possible, but it is not a substitute for
device security.

The local storage schemas are `afi.context_kernel_event.v1` and
`afi.context_kernel_pack.v1`. They are intentionally distinct from the richer
provider-neutral `afi.ledger_event.v1` and `afi.context_pack.v1` contracts. The
explicit protocol adapter constructs, validates, and replay-checks those rich
contracts rather than giving two different shapes the same schema name. A
portable protocol export is a current-active view: once an entity is deleted,
all portable events for that entity are omitted because its encrypted snapshots
no longer exist. The local structural tombstone remains the minimal deletion
audit record.

## Initialize a private workspace

Choose a path outside this repository and outside any automatically public or
shared folder. The command creates the directory, a local encryption key, the
ledger, projections, scratch area, and disposable cache.

```bash
npm --prefix packages/protocol run build
npm --prefix services/context-kernel run build

node services/context-kernel/dist/src/cli.js init \
  --workspace "/absolute/private/path/Quiet Desk" \
  --input '{"owner_id":"tony"}'
```

The initializer does not change permissions on an existing parent directory.
Kernel-owned directories are mode `0700`; files and the key are mode `0600`.
Back up `.secrets/context.key` with the workspace using an encrypted backup. A
ledger without that key cannot decrypt its private bodies.

## Connect an agent harness

Set these variables in the trusted process that launches the MCP bridge:

```text
QUIET_CONTEXT_ROOT=/absolute/private/path/Quiet Desk
QUIET_CONTEXT_AGENT_ID=codex-local
QUIET_CONTEXT_ROLES=afi.daily-conversation,afi.common-ground
```

Then build and start the local STDIO bridge:

```bash
npm --prefix services/mcp run build
npm --prefix services/mcp run start:stdio
```

For manual inspection or harness testing, the included MCP client spawns the
same STDIO server and invokes one real tool:

```bash
QUIET_CONTEXT_ROOT="/absolute/private/path/Quiet Desk" \
  npm --prefix services/mcp run call:context -- context_capabilities '{}'
```

With `QUIET_CONTEXT_ROOT` absent, the original Hub/feed MCP surface remains
unchanged and context tools are not registered. With it present, the bridge adds
these primitives:

- discovery/lifecycle: `context_capabilities`, `open_run`, `checkpoint_run`,
  `complete_context_run`;
- reads: `assemble_context`, `refresh_context`, `search_entities`, `get_entity`,
  `get_changes`;
- bounded writes: `record_scratch_cue`, `record_evidence`,
  `append_context_event`.

Actor identity, roles, and scopes come from the bridge configuration. MCP input
cannot supply a user actor, confirmation, approval, or execution authority. The
kernel repeats the authority check at its storage boundary, including owner-ID
matching, canonical kind/entity binding, per-run role matching, and preventing
an agent from overwriting an existing explicit user record. The originating run
role is immutable across revisions, so another role cannot take ownership of a
shared entity by revising it. Evidence hashes bind the exact canonical JSON
`content` object. Filtered cursors advance past
nonmatching events instead of stalling behind them. A completed run is read-only:
it can still assemble, refresh, search, and inspect context, but it cannot add
scratch, evidence, proposals, or checkpoints. `context_capabilities` publishes
the shared nested shapes, enums, and count/reference invariants required to
construct each proposal without validator-driven guessing.

SQLite rebuild-and-search is protected by a cross-process workspace lock. Two
agent processes may search the same workspace concurrently without one removing
the disposable database while the other is reading it; the ledger remains the
source of truth and the index can always be rebuilt. The dependency-free lock is
a cooperative local-process lock with PID, token, and inode ownership checks; it
is not a formal OS advisory-lock proof against a malicious process replacing the
lock pathname, and crash/power-loss testing remains a production-hardening gate.

Context Packs retain a small explicit baseline, then rank observed, inferred,
and scratch items by the run role, stated goal, requested exact references,
recency, and the caller's item/character budget. Selected records keep exact
revision/event traces; exclusions are counted. Provenance dependencies are
selected atomically with their parent: if a current cited record cannot fit the
same budget, the parent is omitted instead of returning an unsupported claim.

## Obsidian

The workspace can eventually be opened directly as an Obsidian vault; no
second copy is needed. For v0, treat generated projections as read-only.
Automatic capture of a hand edit as a new ledger event and conflict-preserving
file watching are not implemented yet. Editing a projection today will be
overwritten by the next replay.

Keep community plugins disabled until each plugin's read and network behavior
has been reviewed. Do not combine multiple synchronization systems. Exclude the
SQLite cache and temporary files from sync.

## Proof and remaining activation gates

Automated tests cover canonical validation, authority attacks, idempotent and
concurrent writes, stale revisions, correction, deletion and body erasure,
terminal tombstones, immediate plaintext-cache invalidation, durable TTL expiry,
deterministic replay, purpose-focused Context Pack parity, absolute scratch
expiry, SQLite search and zero results, concurrent cross-harness search, cursor
progress, terminal-run write denial, CLI round trips, MCP routing, complete
proposal-contract discovery, signed cross-process refresh receipts, coherent
receipt-forgery rejection, exact-ref refresh staleness, role-origin isolation,
budget-pressure provenance closure, and two independent harness instances
observing the same user correction.

This does not prove live X, LinkedIn, browser-history, email, or calendar
collection. It does not configure a publisher, sync eligible events to Quiet
Hub, ingest Obsidian edits, connect the Mac app, merge a pull request, deploy a
service, or perform an external action. Those remain separate activation gates.
