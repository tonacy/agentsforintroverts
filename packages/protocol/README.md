# AFI Protocol v1

Dependency-free TypeScript contracts for running Agents for Introverts through
different model providers while retaining one event, feed, approval, and proof
model.

## Non-negotiable invariants

- Every envelope uses `schema: "afi.event.v1"`; `kind` remains an open string.
  Its security-bound ingress identity is `producer { connection_id, provider,
  external_agent_id? }`, while its external run identity is
  `run { external_id, agent_key, trigger? }`.
- A run becomes terminal only through `run.completed`, `run.partial`, or
  `run.failed`.
- Every feed claim cites at least one exact member of `FeedItem.sources`.
- Envelope sources are rich `EmbeddedSourceInput` records. Feed items and
  proposals cite them through canonical `SourceReference.source_item_id`; the
  source ID sets must match for known publish/proposal events.
- `SourceReference.source_item_id` targets the AFI-owned
  `SourceItem.source_item_id`; provider-native identity lives separately in
  `SourceItem.external_id`.
- An approval binds `action_id`, `revision`, and the exact canonical payload
  SHA-256. Only the proposal owner acting as a user can approve.
- `ActionProposal.rationale` is required user-facing context outside the
  provider payload hash; changing it requires a new proposal revision.
- Proposed, approved, provider acknowledged, delivered, and read are separate
  proof artifacts. No later status is inferred from an earlier one.
- Duplicate event IDs, duplicate idempotency keys, duplicate sequence numbers,
  and sequence gaps fail closed. Out-of-order replay input is sorted by sequence
  and reported by the projection.

## Canonical event data

| Event kind | `data` |
| --- | --- |
| `run.started` | `{ status: "running" }` |
| `run.completed` | `{ status: "completed", summary, output_ids }` |
| `run.partial` | `{ status: "partial", summary, completed_steps, remaining_steps, checkpoint }` |
| `run.failed` | `{ status: "failed", error, checkpoint? }` |
| `feed.item.published` | `{ feed_item }` |
| `feed.item.updated` | `{ feed_item, previous_revision }` |
| `feed.item.withdrawn` | `{ feed_item_id, feed_item_revision, reason, withdrawn_by }` |
| `action.proposed` | `{ proposal }` |
| `action.approval_decided` | `{ decision }` |
| `action.execution_receipt.recorded` | `{ receipt }` |
| `feedback.recorded` | `{ feedback_id, feed_item_id, feedback_kind, value, recorded_by }` |

JSON Schema is exported at `./schema` and runtime invariants are implemented by
the validators and projections exported from the package root.

## Product projection boundary

The Quiet Desk Mac client may project canonical feed and source records into
higher-level **human threads**: recurring discourse matched to revisioned
personal context, narrowed toward at most three people, and optionally linked to
one exact handoff proposal. Protocol v1 deliberately does not treat recurrence as
consensus or mint this product view as a new authority record.

Every thread claim must still resolve to exact canonical source evidence. Living
context must preserve whether a statement was explicit, observed, or inferred.
Any external handoff remains an ordinary `ActionProposal`, so proposed, approved,
provider acknowledged, delivered, and read retain their independent proof rules.
The current Mac implementation demonstrates this projection with clearly
synthetic fixtures; a canonical live thread/context contract is a later protocol
decision, not an implied capability of v1.

## Context Kernel protocol

The package now also exports the harness-neutral `afi.ledger_event.v1` contract.
It preserves durable Evidence Items, Context Statements, Conversation Outcomes,
Decisions, Threads, Selection Runs, Places, Drafts, and Feedback Signals as
revisioned entity snapshots in an append-only SHA-256 event chain.

`ContextPack` and `ScratchCue` are deliberately outside `LedgerEntity`:

- a Context Pack is a derived, hashed view compiled for one purpose and ledger
  watermark;
- a Scratch Cue is uncertain, expiring input which cannot become durable merely
  because an agent observed it.

Use `sealEntity`, `buildLedgerMutationEvent`, `buildLedgerTombstoneEvent`, and
`projectLedgerEvents` at storage boundaries. `validateContextStatementAuthority` and
`evaluateContextStatementAuthority` prevent agents from silently asserting
explicit user context. Explicit statements must be user-originated or bind a
recorded user confirmation. A confirmation binds the exact revision and hash of
an earlier active `Decision` which targets the authorized entity. Corrections and deletion are new ledger events;
historical events are never overwritten, and a tombstone carries no entity body.

The Context Kernel JSON Schema is exported at `./context-schema`.
