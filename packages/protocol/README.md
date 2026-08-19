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
