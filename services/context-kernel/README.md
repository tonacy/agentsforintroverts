# Context Kernel

A dependency-light, local-first context service that any agent harness can use. The filesystem is canonical and user-owned; SQLite is a disposable search accelerator.

## Guarantees

- One immutable event per file, committed with create-only filesystem operations.
- Create-only and derived commits fsync their files and containing directories where the host filesystem supports directory fsync.
- Globally unique, lexically time-sortable event and entity IDs.
- Idempotent writes and expected-revision compare-and-swap conflicts.
- Free-form human content is AES-256-GCM ciphertext outside the immutable ledger. A tombstone deletes the ciphertext and retains only structural hashes and references.
- Tombstones are terminal, and deletion invalidates/rebuilds plaintext projections and SQLite so stale decrypted text cannot survive in derived surfaces.
- Opening reconciles interrupted deletion: it erases bodies for tombstoned entities, removes unreferenced encrypted objects and abandoned private-object temporaries, invalidates stale SQLite, and rebuilds redacted projections before returning.
- Replay produces deterministic JSON and human-readable Markdown.
- SQLite/FTS5 is rebuilt from the ledger through the system `sqlite3` executable with `shell: false`; rebuild-and-search holds a cross-process workspace lock so concurrent harnesses cannot invalidate each other's reads.
- Append, projection, and SQLite mutation locks bind release to a random token and inode; stale recovery checks PID liveness and never steals from a live recorded owner.
- Context packs are deterministic and bounded, with a ledger watermark, hash, selection trace, omission details/counts, and separate explicit/observed/inferred sections.
- Scratch cues expire no later than 24 hours after actual receipt, reject material future dating, never enter the ledger, and never replicate through the protocol adapter.
- Ordinary agents cannot write explicit, confirmed, approved, or executed state, or revise/correct/delete an existing explicit user record.
- Malformed supersession, closed kind/entity mismatches, and writes after a run reaches `phase: complete` are rejected before commit; an exact terminal retry still resolves through its idempotency receipt.
- User-originated writes must match the workspace owner ID. Closed protocol entities require an encrypted, sealed canonical snapshot bound to the local actor, owner, authority, basis, ID, and revision.
- Raw URLs, locators, excerpts, and other common text-bearing payload fields are rejected from immutable structural events. Put deletable source material in `body` and retain only hashes and opaque references in `payload`/`source_refs`.

The local storage envelopes intentionally use `afi.context_kernel_event.v1` and `afi.context_kernel_pack.v1`. They are not falsely presented as the richer protocol contracts. `toProtocolLedgerEvents` creates, validates, and replay-checks canonical `afi.ledger_event.v1` values after a caller supplies a complete protocol entity snapshot. Local operational and generic entity types are excluded from that projection.

## Workspace

```text
context-workspace.json          owner and portable layout
.secrets/context.key           local AES key (0600)
ledger/events/YYYY/MM/DD/*.json immutable structural events
ledger/idempotency/*.json      retry receipts
objects/private/*.enc          erasable encrypted bodies
projections/context.{json,md}  deterministic derived views
projections/entities/**        per-record JSON and Markdown
scratch/*.json                 TTL-only uncertain cues
cache/context.sqlite3          rebuildable FTS5 cache
```

Initialization does not change permissions on an existing caller-owned root. Kernel-owned private children are mode `0700`; the key and created files are mode `0600`.

## Public API

```ts
const { kernel } = await initializeContextWorkspace(path, { owner_id: "user-tony" });
const opened = await ContextKernel.open(path);

await kernel.change(input);               // append with idempotency + CAS
await kernel.correct(input);              // append a superseding revision
await kernel.delete(input);               // tombstone + retry-safe body erasure
await kernel.pruneExpiredEntities();      // TTL tombstones + derived cleanup
await kernel.readEventBody(event);        // trusted protocol diagnostics/export
await kernel.get(entityType, entityId);    // current projection
await kernel.changes({ after_event_id });  // immutable change stream
await kernel.search({ query, limit });     // FTS5; empty array is a valid outcome
await kernel.replay();                     // deterministic JSON/Markdown rebuild
await kernel.rebuildIndex();               // rebuild disposable SQLite cache
await kernel.assembleContextPack(options);
await kernel.addScratch(cue);
await kernel.listScratch({ now });
await kernel.pruneScratch({ now });
await kernel.checkpointRun(input);
await kernel.completeRun(input);
```

Use `body` for all free-form human text. `payload` is structural metadata and rejects common text-bearing fields. For `evidence_item`, `context_statement`, `conversation`, `decision`, `thread`, `selection_run`, `place`, `draft`, and `feedback_signal`, `body` must be canonical JSON for a valid sealed entity snapshot. Generic local types remain available for operational records such as `run`.

The lock implementation is dependency-free and designed for cooperating local processes. It is not an OS advisory lock, so it cannot make an actively malicious process that directly replaces lock paths safe; use normal private-directory permissions and do not let untrusted processes write inside the workspace.

`payload.expires_at` marks a durable record for erasure without silently rewriting canonical history. `pruneExpiredEntities()` appends a system tombstone, erases the encrypted objects, and rebuilds derived surfaces. The embedding harness is responsible for scheduling that prune call.

## CLI

```sh
node dist/src/cli.js init --workspace /path/to/context --input '{"owner_id":"user-tony"}'
node dist/src/cli.js change --workspace /path/to/context --input-file change.json
node dist/src/cli.js search --workspace /path/to/context --input '{"query":"publishing"}'
node dist/src/cli.js pack --workspace /path/to/context --input '{"max_items":20,"max_chars":24000}'
node dist/src/cli.js prune-expired --workspace /path/to/context
```

Run `node dist/src/cli.js --help` for the command list. Every command returns JSON on stdout and structured errors on stderr.

## Build and test

Node 20+ and a system SQLite build with FTS5 are required.

```sh
npm --prefix packages/protocol run build
npm --prefix services/context-kernel test
```

The kernel has no third-party runtime dependencies. The repository-local protocol package must be built first because closed-entity writes validate against it at runtime.
