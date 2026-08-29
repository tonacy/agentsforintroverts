# Quiet Desk history architecture

Status: Context Kernel v0 implemented; edit watching and replication remain future gates

Quiet Desk needs memory without turning a person's computer into an
autobiography written by surveillance. The durable system should preserve
human-confirmed history and inspectable public evidence while allowing raw
browser and activity traces to disappear.

## Decision

The canonical archive is a private, portable Quiet Desk directory made of plain
Markdown and JSON. Obsidian may open that directory as an editor and navigation
surface, but it is not the database, synchronization authority, or required
runtime. Quiet Hub may replicate eligible events and serve projections, but it
is never the only copy.

This keeps the practice usable without Obsidian, a network connection, a Hub
deployment, or a particular agent provider.

```text
ephemeral browser/history cues
             | human confirmation or public revalidation
             v
  local create-only event ledger  <---- user edits in Quiet Desk/Obsidian
             |
             +----> Markdown/JSON projections (human-readable current state)
             +----> SQLite index (rebuildable search and joins)
             +----> eligible-event replica in Quiet Hub
```

## Four layers

### 1. Ephemeral observation layer

Browser state, authenticated-feed cues, and current-day Computer History cues
exist only for the bounded run. They are never written to the durable ledger or
Hub. If a temporary debugging artifact is unavoidable, it expires within 24
hours. The rules for promotion are in
[`SOURCE_AND_RETENTION_POLICY.md`](./SOURCE_AND_RETENTION_POLICY.md).

### 2. Local immutable ledger

The low-level TypeScript API and JSON CLI are trusted local administration
surfaces, not an authentication boundary. Ordinary interchangeable agents use
the MCP adapter, which fixes identity and role in the launching process and
exposes only bounded proposal operations.

The implemented local ledger stores one event per file:

```text
Quiet Desk/
  ledger/
    events/
      2026/
        08/
          20/
            01J...-human.capture.confirmed.json
            01J...-source.public_observed.json
```

Each file is created once with an exclusive, atomic write and is never edited.
At minimum an event contains:

- schema version and globally unique, time-sortable event ID;
- occurred-at and recorded-at timestamps with timezone;
- actor and provider identity;
- event kind and entity ID;
- minimized payload or references to eligible local records;
- source references and evidence class;
- canonical payload hash; and
- optional `supersedes_event_id` for corrections or tombstones.

An edit, correction, withdrawal, or deletion is a new event. A projector applies
those events deterministically and hides withdrawn material from current views
without rewriting history. File creation should use a temporary sibling,
`fsync`, and an atomic rename; the destination must fail if it already exists.

One-event-per-file is deliberately simple to inspect, back up, hash, and recover.
It also avoids concurrent appends to a single JSONL file. A future compaction may
bundle old events for backup, but the bundle is derived and must not replace the
originals until its hashes and recovery path are verified.

### 3. Human-readable projections

The folders people edit today remain current-state projections:

- `daily/` and `captures/` for confirmed human accounts;
- `sources/` for minimized, revalidated public evidence;
- `context/` for revisioned statements and their basis;
- `threads/` and `places/` for durable discourse and timely openings;
- `drafts/` and `publications/` for human-seeded expression and receipts;
- `runs/` for explicit completed, partial, or failed outcomes; and
- `preferences/` for source, channel, and retention choices.

Every projection carries the last applied event ID. Projectors write a temporary
file and atomically replace the projection. A future hand-edit watcher must
capture a supported edit as a new `document.revised` event before projections
advance. That watcher is not part of v0, so generated projections are currently
read-only and a replay will overwrite manual changes. When implemented, an
ambiguous conflict must preserve both versions and ask the user rather than
choosing one silently.

### 4. Rebuildable index and optional replica

A local SQLite database provides full-text search, joins, and fast current-state
queries. It contains no unique truth: deleting it and replaying the local event
files must rebuild the same projections. Store the database under a generated
cache directory and exclude it from synchronization and source control. Rebuild
and query are one cross-process locked operation, so concurrent agent harnesses
cannot remove the database underneath another reader.

Quiet Hub is an optional replica and multi-agent coordination surface. Upload
only events whose evidence class and consent make them Hub eligible. In the
current system this excludes authenticated-feed cues, Computer History cues,
confirmed private daily captures, and private personal context. A successful Hub
write is provider acknowledgement, not proof that the local archive is backed up.

## Obsidian's role

Obsidian is a good optional interface because it works directly on Markdown,
supports links between days, Threads, Places, and people, and leaves files
portable. The recommended setup is to open the Quiet Desk directory itself as a
vault. Do not maintain a second Obsidian copy.

Before enabling it:

- keep community plugins disabled by default and review every plugin that could
  read or transmit the vault;
- choose one synchronization system, not overlapping iCloud, Obsidian Sync,
  Git auto-commit, and file-provider sync;
- enable full-disk encryption and an encrypted backup;
- exclude the SQLite index and temporary files from sync; and
- test conflict recovery with a disposable copy before mobile editing.

Obsidian metadata such as workspace layout is convenience state. Product
semantics must live in portable frontmatter, Markdown, JSON schemas, and ledger
events rather than plugin-specific databases.

## Identity and evidence boundaries

The archive keeps these classes separate:

1. `explicit`: Tony's confirmed words or decision;
2. `observed`: a minimized, revalidated public fact;
3. `inferred`: an agent interpretation awaiting confirmation; and
4. `ephemeral_cue`: navigation or recall material that cannot enter the ledger.

An inference may cite evidence but cannot become an explicit statement through
repetition. A Computer History cue can prompt a question; it cannot create a
first-person sentence. An authenticated social item can prompt public
revalidation; it cannot become a source merely because the browser displayed it.

## Backup, recovery, and deletion

- Keep the working archive on an encrypted local volume.
- Maintain at least one encrypted backup that preserves create-only event files.
- Test recovery by rebuilding the SQLite index and projections from an archive
  copy, not merely by checking that backup files exist.
- Treat sync as availability, not backup.
- Represent a user deletion as a tombstone event and remove the content from all
  projections, indexes, caches, and eligible replicas; keep only the minimum
  non-sensitive deletion proof required for audit.
- Treat provider-neutral protocol export as a current-active view after
  deletion: omit the deleted entity's portable history while retaining the
  local structural tombstone.
- Never require the Hub to restore the local archive.

## Delivery sequence

1. Continue the manual practice in the portable Quiet Desk workspace. **Ready.**
2. Implement the create-only local event writer and schema validation. **Done.**
3. Add deterministic Markdown/JSON projectors and replay tests. **Done.**
4. Add the disposable, rebuildable SQLite search index. **Done.**
5. Add a conflict-preserving edit watcher before treating Obsidian as an editor.
6. Open the same directory in Obsidian only after plugin and sync review.
7. Add selective Hub replication after per-evidence-class consent and deletion
   behavior are implemented and tested.

Offline rebuild, correction, deletion, encrypted-body erasure, concurrent CAS,
and cross-harness Context Pack parity are tested. Edit-conflict ingestion is not;
until that watcher exists, the ledger remains the source of truth and automated
synchronization remains optional.
