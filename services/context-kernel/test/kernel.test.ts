import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, readdir, rm, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { withFileLock } from "../src/file-lock.js";
import { syncDirectory, writeCreateOnly } from "../src/io.js";
import {
  ContextKernel,
  ContextKernelError,
  canonicalJson,
  initializeContextWorkspace,
  isSortableId,
  newId,
  sha256,
  toProtocolLedgerEvents,
  type ActorRef,
  type ChangeInput,
} from "../src/index.js";

const USER: ActorRef = { actor_id: "user-tony", actor_type: "user" };
const AGENT: ActorRef = { actor_id: "agent-desk", actor_type: "agent" };
const T0 = "2026-08-23T10:00:00.000Z";
const T1 = "2026-08-23T10:01:00.000Z";
const T2 = "2026-08-23T10:02:00.000Z";
const execFileAsync = promisify(execFile);

test("workspace initialization preserves caller root permissions and sortable IDs are monotonic", async (t) => {
  const parent = await makeTemp(t);
  const root = join(parent, "existing-root");
  await mkdir(root);
  await chmod(root, 0o755);
  const before = (await stat(root)).mode & 0o777;
  const initialized = await initializeContextWorkspace(root, {
    owner_id: "user-tony",
    created_at: T0,
  });
  assert.equal(initialized.created, true);
  assert.equal((await stat(root)).mode & 0o777, before);
  assert.ok(isSortableId(initialized.manifest.workspace_id));
  const first = newId("evt", 1_000);
  const second = newId("evt", 1_000);
  const third = newId("evt", 999);
  assert.ok(isSortableId(first));
  assert.ok(first < second);
  assert.ok(second < third);
  assert.notEqual(first, second);
});

test("create-only commits preserve the winner and sync their containing directory", async (t) => {
  const root = await makeTemp(t);
  const target = join(root, "durable-create-only.txt");
  await writeCreateOnly(target, "first");
  await syncDirectory(root);
  await assert.rejects(writeCreateOnly(target, "second"), hasCode("ALREADY_EXISTS"));
  assert.equal(await readFile(target, "utf8"), "first");
  assert.deepEqual((await readdir(root)).filter((name) => name.startsWith(".tmp_")), []);
});

test("correction uses CAS and deterministic replay projects only the latest private body", async (t) => {
  const { kernel } = await makeKernel(t);
  const created = await kernel.change(change({
    idempotency_key: "create-preference",
    body: "I prefer calm, direct explanations.",
    occurred_at: T0,
  }));
  const entityId = created.event.entity.id;
  assert.ok(isSortableId(entityId));
  const corrected = await kernel.correct(change({
    idempotency_key: "correct-preference",
    entity_id: entityId,
    expected_revision: 1,
    kind: "context.corrected",
    body: "I prefer concise explanations with drill-down available.",
    occurred_at: T1,
  }));
  assert.equal(corrected.event.entity.revision, 2);
  assert.equal(corrected.event.supersedes_event_id, created.event.event_id);
  const current = await kernel.get(created.event.entity.type, entityId);
  assert.equal(current?.revision, 2);
  assert.equal(current?.body, "I prefer concise explanations with drill-down available.");
  assert.equal(current?.body_state, "present");
  await assert.rejects(
    kernel.correct(change({
      idempotency_key: "stale-correction",
      entity_id: entityId,
      expected_revision: 1,
      kind: "context.corrected",
      body: "stale",
      occurred_at: T2,
    })),
    hasCode("REVISION_CONFLICT"),
  );
});

test("malformed supersession is rejected before the immutable ledger advances", async (t) => {
  const { kernel } = await makeKernel(t);
  const created = await kernel.change(change({ idempotency_key: "supersession-create", occurred_at: T0 }));
  await assert.rejects(
    kernel.correct(change({
      idempotency_key: "supersession-poison-attempt",
      entity_id: created.event.entity.id,
      expected_revision: 1,
      kind: "context.corrected",
      supersedes_event_id: newId("evt"),
      body: "This must never commit.",
      occurred_at: T1,
    })),
    hasCode("SUPERSESSION_CONFLICT"),
  );
  assert.equal((await kernel.changes()).length, 1);
  const replay = await kernel.replay({ writeProjections: false });
  assert.equal(replay.watermark.event_count, 1);
  assert.equal(replay.records[0]?.revision, 1);
});

test("idempotency returns the original event and rejects key reuse with different input", async (t) => {
  const { kernel } = await makeKernel(t);
  const input = change({ idempotency_key: "idempotent-create", body: "one", occurred_at: T0 });
  const first = await kernel.change(input);
  const second = await kernel.change(input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.event.event_id, first.event.event_id);
  assert.equal((await kernel.changes()).length, 1);
  await assert.rejects(
    kernel.change({ ...input, body: "different" }),
    hasCode("IDEMPOTENCY_CONFLICT"),
  );
  await assert.rejects(
    kernel.change(change({ idempotency_key: "duplicate-event-id", event_id: first.event.event_id })),
    hasCode("EVENT_ID_CONFLICT"),
  );
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "duplicate-entity-id",
      entity_type: "local_evidence",
      entity_id: first.event.entity.id,
    })),
    hasCode("ENTITY_ID_CONFLICT"),
  );
  const concurrentInput = change({ idempotency_key: "concurrent-idempotency", body: "same request" });
  const concurrent = await Promise.all(Array.from({ length: 5 }, () => kernel.change(concurrentInput)));
  assert.equal(concurrent.filter((result) => result.created).length, 1);
  assert.equal(new Set(concurrent.map((result) => result.event.event_id)).size, 1);
  assert.equal((await kernel.changes()).length, 2);
});

test("file locks never steal from live owners or unlink a replacement owner", async (t) => {
  const { kernel } = await makeKernel(t);
  const lockPath = join(kernel.paths.locks, "adversarial.lock");
  const old = new Date(Date.now() - 60_000);
  const options = {
    timeout_ms: 40,
    stale_ms: 1,
    poll_ms: 5,
    busy_code: "TEST_BUSY",
    busy_message: "test lock remained owned",
  };

  await writeFile(lockPath, `${canonicalJson({ token: "live-owner", pid: process.pid, acquired_at: T0 })}\n`);
  await utimes(lockPath, old, old);
  await assert.rejects(withFileLock(lockPath, options, async () => undefined), hasCode("TEST_BUSY"));
  assert.match(await readFile(lockPath, "utf8"), /live-owner/);
  await unlink(lockPath);

  await withFileLock(lockPath, options, async () => {
    await unlink(lockPath);
    await writeFile(lockPath, `${canonicalJson({ token: "replacement-owner", pid: process.pid, acquired_at: T1 })}\n`);
  });
  assert.match(await readFile(lockPath, "utf8"), /replacement-owner/);
  await unlink(lockPath);

  await writeFile(lockPath, `${canonicalJson({ token: "abandoned-owner", pid: -1, acquired_at: T0 })}\n`);
  await utimes(lockPath, old, old);
  let recovered = false;
  await withFileLock(lockPath, options, async () => { recovered = true; });
  assert.equal(recovered, true);
  await assert.rejects(stat(lockPath), { code: "ENOENT" });
});

test("event time cannot claim observation before occurrence", async (t) => {
  const { kernel } = await makeKernel(t);
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "recorded-before-occurred",
      occurred_at: T1,
      recorded_at: T0,
    })),
    hasCode("INVALID_TIMESTAMP_ORDER"),
  );
  assert.equal((await kernel.changes()).length, 0);
});

test("change cursors fail closed instead of silently replaying from the beginning", async (t) => {
  const { kernel } = await makeKernel(t);
  await kernel.change(change({ idempotency_key: "cursor-seed", occurred_at: T0 }));
  await assert.rejects(
    kernel.changes({ after_event_id: newId("evt") }),
    hasCode("CURSOR_NOT_FOUND"),
  );
});

test("deletion erases ciphertext while immutable one-event files retain no human capture text", async (t) => {
  const { kernel, root } = await makeKernel(t);
  const secret = "A private lived-experience erasablexyz sentence.";
  const created = await kernel.change(change({
    idempotency_key: "private-create",
    body: secret,
    occurred_at: T0,
  }));
  const bodyRef = created.event.private_body!;
  const objectPath = join(root, "objects", "private", `${bodyRef.object_id}.enc`);
  assert.equal(await kernel.readEventBody(created.event), secret);
  assert.equal((await readFile(objectPath, "utf8")).includes(secret), false);
  const eventFilesBefore = await filesUnder(join(root, "ledger", "events"));
  assert.equal(eventFilesBefore.length, 1);
  assert.equal((await readFile(eventFilesBefore[0], "utf8")).includes(secret), false);

  await kernel.rebuildIndex();
  const indexedBefore = await execFileAsync("sqlite3", [
    kernel.paths.sqlite,
    `SELECT body FROM records WHERE entity_id='${created.event.entity.id}';`,
  ]);
  assert.equal(indexedBefore.stdout.trim(), secret);

  const deleted = await kernel.delete({
    entity_type: created.event.entity.type,
    entity_id: created.event.entity.id,
    expected_revision: 1,
    idempotency_key: "private-delete",
    actor: USER,
    occurred_at: T1,
    reason_code: "user_request",
  });
  await assert.rejects(readFile(objectPath), { code: "ENOENT" });
  assert.equal(await kernel.readEventBody(created.event), null);
  assert.equal(await kernel.readEventBody(deleted.event), null);
  const indexedAfter = await execFileAsync("sqlite3", [
    kernel.paths.sqlite,
    `SELECT body FROM records WHERE entity_id='${created.event.entity.id}';`,
  ]);
  assert.equal(indexedAfter.stdout.trim(), "");
  const ftsAfter = await execFileAsync("sqlite3", [
    kernel.paths.sqlite,
    "SELECT count(*) FROM records_fts WHERE records_fts MATCH 'erasablexyz';",
  ]);
  assert.equal(ftsAfter.stdout.trim(), "0");
  assert.deepEqual(await kernel.search({ query: "erasablexyz", include_deleted: true }), []);
  const eventFilesAfter = await filesUnder(join(root, "ledger", "events"));
  assert.equal(eventFilesAfter.length, 2);
  assert.equal((await Promise.all(eventFilesAfter.map((path) => readFile(path, "utf8")))).join("\n").includes(secret), false);
  const current = await kernel.get(created.event.entity.type, created.event.entity.id);
  assert.equal(current?.status, "deleted");
  assert.equal(current?.body_state, "deleted");
  assert.equal(current?.body, undefined);
});

test("immutable events reject raw locators and retain no deletable source text", async (t) => {
  const { kernel, root } = await makeKernel(t);
  const secretUrl = "https://private.example.test/posts/delete-me";
  const secretExcerpt = "A short deletable source excerpt.";
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "raw-payload-locator",
      payload: { provenance: [{ locator: secretUrl }] },
    })),
    hasCode("PRIVATE_TEXT_REQUIRED"),
  );
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "raw-source-ref-url",
      source_refs: [{ source: "web", external_id: "post-1", url: secretUrl }],
    })),
    hasCode("PRIVATE_TEXT_REQUIRED"),
  );
  const created = await kernel.change(change({
    idempotency_key: "encrypted-source-text",
    payload: { source_url_hash: `sha256:${sha256(secretUrl)}` },
    source_refs: [{ source: "web", external_id: "post-1" }],
    body: `${secretUrl}\n${secretExcerpt}`,
  }));
  await kernel.delete({
    entity_type: created.event.entity.type,
    entity_id: created.event.entity.id,
    expected_revision: 1,
    idempotency_key: "encrypted-source-text-delete",
    actor: USER,
    reason_code: "user_request",
  });
  const ledgerText = (await Promise.all((await filesUnder(join(root, "ledger")))
    .map((path) => readFile(path, "utf8")))).join("\n");
  assert.equal(ledgerText.includes(secretUrl), false);
  assert.equal(ledgerText.includes(secretExcerpt), false);
});

test("projection mutation lock prevents a stale writer from surviving deletion", async (t) => {
  const { kernel, root } = await makeKernel(t);
  const secret = "Projection race secret that must be redacted.";
  const created = await kernel.change(change({ idempotency_key: "projection-race-create", body: secret }));
  const lockPath = join(kernel.paths.locks, "projections.lock");
  let entered!: () => void;
  let release!: () => void;
  const enteredLock = new Promise<void>((resolve) => { entered = resolve; });
  const releaseLock = new Promise<void>((resolve) => { release = resolve; });
  const holder = withFileLock(lockPath, {
    timeout_ms: 5_000,
    stale_ms: 120_000,
    busy_code: "PROJECTION_BUSY",
    busy_message: "projection test lock busy",
  }, async () => {
    entered();
    await releaseLock;
    await writeFile(join(root, "projections", "context.md"), secret);
  });
  await enteredLock;
  let deletionSettled = false;
  const deletion = kernel.delete({
    entity_type: created.event.entity.type,
    entity_id: created.event.entity.id,
    expected_revision: 1,
    idempotency_key: "projection-race-delete",
    actor: USER,
    reason_code: "user_request",
  }).then((result) => { deletionSettled = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(deletionSettled, false);
  release();
  await holder;
  await deletion;
  const projectionText = (await Promise.all((await filesUnder(join(root, "projections")))
    .map((path) => readFile(path, "utf8")))).join("\n");
  assert.equal(projectionText.includes(secret), false);
});

test("opening reconciles tombstoned, orphaned, and stale plaintext artifacts", async (t) => {
  const { kernel, root } = await makeKernel(t);
  const secret = "Crash-window plaintext must not survive reopening.";
  const created = await kernel.change(change({ idempotency_key: "reconcile-create", body: secret }));
  const objectPath = join(root, "objects", "private", `${created.event.private_body!.object_id}.enc`);
  const encrypted = await readFile(objectPath);
  await kernel.delete({
    entity_type: created.event.entity.type,
    entity_id: created.event.entity.id,
    expected_revision: 1,
    idempotency_key: "reconcile-delete",
    actor: USER,
    reason_code: "user_request",
  });

  // Simulate crashes before ciphertext erasure, temporary-object cleanup, and
  // derived invalidation by restoring each artifact after the normal delete.
  await writeFile(objectPath, encrypted);
  const orphanEncryptedPath = join(root, "objects", "private", `${newId("body")}.enc`);
  await writeFile(orphanEncryptedPath, encrypted);
  const orphanPath = join(root, "objects", "private", `.${newId("tmp")}`);
  await writeFile(orphanPath, encrypted);
  await writeFile(join(root, "projections", "context.md"), secret);
  await execFileAsync("sqlite3", [
    kernel.paths.sqlite,
    `UPDATE records SET body='${secret}' WHERE entity_id='${created.event.entity.id}';`,
  ]);

  const reopened = await ContextKernel.open(root);
  await assert.rejects(stat(objectPath), { code: "ENOENT" });
  await assert.rejects(stat(orphanEncryptedPath), { code: "ENOENT" });
  await assert.rejects(stat(orphanPath), { code: "ENOENT" });
  await assert.rejects(stat(reopened.paths.sqlite), { code: "ENOENT" });
  const projectionText = (await Promise.all((await filesUnder(join(root, "projections")))
    .map((path) => readFile(path, "utf8")))).join("\n");
  assert.equal(projectionText.includes(secret), false);
  assert.deepEqual(await reopened.search({ query: "Crash-window" }), []);
});

test("encrypted body reads fail closed on authenticated-object tampering", async (t) => {
  const { kernel, root } = await makeKernel(t);
  const created = await kernel.change(change({
    idempotency_key: "private-integrity",
    body: "Authenticated private context",
  }));
  const objectPath = join(
    root,
    "objects",
    "private",
    `${created.event.private_body!.object_id}.enc`,
  );
  const envelope = JSON.parse(await readFile(objectPath, "utf8")) as Record<string, unknown>;
  envelope.ciphertext = Buffer.from("tampered ciphertext", "utf8").toString("base64");
  await writeFile(objectPath, `${canonicalJson(envelope)}\n`, "utf8");
  await assert.rejects(
    kernel.readEventBody(created.event),
    hasCode("OBJECT_INTEGRITY_ERROR"),
  );
});

test("workspace-key Context Pack receipts authenticate stateless cross-process refresh", async (t) => {
  const { kernel } = await makeKernel(t);
  const payload = canonicalJson({
    schema: "afi.context_pack.v1",
    pack_id: `pack_${"a".repeat(64)}`,
    run_id: "run_receipt_test",
    purpose: "Bounded daily conversation",
  });
  const mac = await kernel.signContextPackReceipt(payload);
  assert.match(mac, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal(await kernel.signContextPackReceipt(payload), mac);
  assert.equal(await kernel.verifyContextPackReceipt(payload, mac), true);
  assert.equal(
    await kernel.verifyContextPackReceipt(
      canonicalJson({ ...JSON.parse(payload), purpose: "Caller-rebound purpose" }),
      mac,
    ),
    false,
  );
  assert.equal(await kernel.verifyContextPackReceipt(payload, `hmac-sha256:${"0".repeat(64)}`), false);
  await assert.rejects(
    kernel.signContextPackReceipt('{"z":1,"a":2}'),
    hasCode("RECEIPT_PAYLOAD_INVALID"),
  );
});

test("a tombstone is terminal and ordinary APIs cannot resurrect or overwrite it", async (t) => {
  const { kernel } = await makeKernel(t);
  const created = await kernel.change(change({ idempotency_key: "terminal-create" }));
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "direct-tombstone-bypass",
      entity_id: created.event.entity.id,
      expected_revision: 1,
      tombstone: true,
    })),
    hasCode("AUTHORITY_DENIED"),
  );
  await kernel.delete({
    entity_type: created.event.entity.type,
    entity_id: created.event.entity.id,
    expected_revision: 1,
    idempotency_key: "terminal-delete",
    actor: USER,
  });
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "terminal-revision",
      entity_id: created.event.entity.id,
      expected_revision: 2,
    })),
    hasCode("ENTITY_TOMBSTONED"),
  );
  await assert.rejects(
    kernel.correct(change({
      idempotency_key: "terminal-correction",
      entity_id: created.event.entity.id,
      expected_revision: 2,
      kind: "context.corrected",
    })),
    hasCode("ENTITY_TOMBSTONED"),
  );
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "terminal-recreate",
      entity_id: created.event.entity.id,
      expected_revision: 0,
    })),
    hasCode("ENTITY_TOMBSTONED"),
  );
  assert.equal((await kernel.changes()).length, 2);
});

test("replay is deterministic and rebuilds human-readable JSON and Markdown projections", async (t) => {
  const { kernel, root } = await makeKernel(t);
  await kernel.change(change({ idempotency_key: "replay-a", body: "Alpha", occurred_at: T0 }));
  await kernel.change(change({
    idempotency_key: "replay-b",
    body: "Beta",
    basis: "observed",
    actor: AGENT,
    occurred_at: T1,
  }));
  const first = await kernel.replay({ writeProjections: true });
  await rm(join(root, "projections"), { recursive: true, force: true });
  const second = await kernel.replay({ writeProjections: true });
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(await readFile(join(root, "projections", "context.json"), "utf8"), `${canonicalJson(second)}\n`);
  const markdown = await readFile(join(root, "projections", "context.md"), "utf8");
  assert.match(markdown, /# Context projection/);
  assert.match(markdown, /Alpha/);
  assert.equal(second.watermark.sequence, 2);
});

test("scratch cues expire, never enter the ledger, and reject TTLs above 24 hours", async (t) => {
  const { kernel } = await makeKernel(t);
  const before = (await kernel.changes()).length;
  const cue = await kernel.addScratch({
    cue: "The browser trail may indicate a fragmented day.",
    basis: "observed",
    ttl_ms: 60_000,
  });
  assert.ok(isSortableId(cue.id));
  assert.ok(Date.parse(cue.recorded_at) <= Date.parse(cue.expires_at));
  assert.ok(Date.parse(cue.expires_at) - Date.parse(cue.recorded_at) <= 24 * 60 * 60 * 1_000);
  assert.equal((await kernel.listScratch()).length, 1);
  const expiredAt = new Date(Date.parse(cue.expires_at) + 1).toISOString();
  assert.equal((await kernel.listScratch({ now: expiredAt })).length, 0);
  const second = await kernel.addScratch({ cue: "Second ephemeral cue", ttl_ms: 60_000 });
  const pruned = await kernel.pruneScratch({
    now: new Date(Date.parse(second.expires_at) + 1).toISOString(),
  });
  assert.deepEqual(pruned.removed, [second.id]);
  assert.equal((await kernel.changes()).length, before);
  await assert.rejects(
    kernel.addScratch({ cue: "too durable", ttl_ms: 24 * 60 * 60 * 1_000 + 1 }),
    /24 hours/,
  );
  await assert.rejects(
    kernel.addScratch({
      cue: "future-dated",
      created_at: new Date(Date.now() + 10 * 60 * 1_000).toISOString(),
      ttl_ms: 1_000,
    }),
    hasCode("SCRATCH_FUTURE_TIMESTAMP"),
  );
  const nearFuture = await kernel.addScratch({
    cue: "near-future but bounded",
    created_at: new Date(Date.now() + 4 * 60 * 1_000).toISOString(),
    ttl_ms: 24 * 60 * 60 * 1_000,
  });
  assert.ok(Date.parse(nearFuture.expires_at) <= Date.parse(nearFuture.recorded_at) + 24 * 60 * 60 * 1_000);
});

test("explicit user writes are bound to the workspace owner without blocking agents", async (t) => {
  const { kernel } = await makeKernel(t);
  const intruder: ActorRef = { actor_id: "user-intruder", actor_type: "user" };
  await assert.rejects(
    kernel.change(change({ idempotency_key: "intruder-create", actor: intruder })),
    hasCode("OWNER_AUTHORITY_MISMATCH"),
  );
  assert.equal((await kernel.changes()).length, 0);
  const ownerRecord = await kernel.change(change({ idempotency_key: "owner-create" }));
  await assert.rejects(
    kernel.delete({
      entity_type: ownerRecord.event.entity.type,
      entity_id: ownerRecord.event.entity.id,
      expected_revision: 1,
      idempotency_key: "intruder-delete",
      actor: intruder,
    }),
    hasCode("OWNER_AUTHORITY_MISMATCH"),
  );
  assert.notEqual(await kernel.readEventBody(ownerRecord.event), null);
  const observed = await kernel.change(change({
    idempotency_key: "owner-agent-observed",
    actor: AGENT,
    basis: "observed",
    entity_type: "local_evidence",
  }));
  assert.equal(observed.event.actor.actor_type, "agent");
});

test("expired entities are durably tombstoned by an explicit prune event", async (t) => {
  const { kernel } = await makeKernel(t);
  const pastExpiry = new Date(Date.now() - 60_000).toISOString();
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
  const expired = await kernel.change(change({
    idempotency_key: "expiry-past",
    body: "expirablesecret should leave every derived surface",
    payload: { expires_at: pastExpiry, category: "temporary" },
  }));
  const future = await kernel.change(change({
    idempotency_key: "expiry-future",
    body: "future record remains",
    payload: { expires_at: futureExpiry, category: "temporary" },
  }));
  await kernel.rebuildIndex();
  const result = await kernel.pruneExpiredEntities();
  assert.equal(result.pruned.length, 1);
  assert.equal(result.pruned[0].entity_id, expired.event.entity.id);
  assert.equal((await kernel.changes()).length, 3);
  const expiryEvent = (await kernel.changes()).at(-1)!;
  assert.equal(expiryEvent.kind, "context.expired");
  assert.equal(expiryEvent.tombstone, true);
  assert.equal(expiryEvent.actor.actor_type, "system");
  assert.equal((await kernel.get(expired.event.entity.type, expired.event.entity.id))?.status, "deleted");
  assert.equal((await kernel.get(future.event.entity.type, future.event.entity.id))?.status, "active");
  assert.equal(await kernel.readEventBody(expired.event), null);
  assert.deepEqual(await kernel.search({ query: "expirablesecret", include_deleted: true }), []);
  assert.equal((await kernel.pruneExpiredEntities()).pruned.length, 0);
  assert.equal((await kernel.changes()).length, 3);
  await assert.rejects(
    kernel.change(change({ idempotency_key: "bad-expiry", payload: { expires_at: "not-a-date" } })),
    /payload\.expires_at/,
  );
});

test("context packs are deterministic, bounded, traced, and keep authority bases separate", async (t) => {
  const { kernel } = await makeKernel(t);
  await kernel.change(change({ idempotency_key: "pack-explicit", body: "A human priority", occurred_at: T0 }));
  await kernel.change(change({
    idempotency_key: "pack-observed",
    body: "An observed outside signal",
    basis: "observed",
    actor: AGENT,
    occurred_at: T1,
  }));
  await kernel.change(change({
    idempotency_key: "pack-inferred",
    body: "A cautious inference",
    basis: "inferred",
    actor: AGENT,
    occurred_at: T2,
  }));
  const input = { max_items: 10, max_chars: 10_000, now: T2 };
  const first = await kernel.assembleContextPack(input);
  const second = await kernel.assembleContextPack(input);
  assert.equal(first.schema, "afi.context_kernel_pack.v1");
  assert.equal(first.pack_hash, second.pack_hash);
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(first.context.explicit.length, 1);
  assert.equal(first.context.observed.length, 1);
  assert.equal(first.context.inferred.length, 1);
  assert.equal(first.trace.length, 3);
  assert.equal(first.watermark.sequence, 3);
  const bounded = await kernel.assembleContextPack({ max_items: 1, max_chars: 10_000 });
  assert.equal(bounded.selected_items, 1);
  assert.ok(bounded.omissions.some((entry) => entry.reason === "item_limit"));
});

test("SQLite FTS search and zero-result outcomes are explicit and stable", async (t) => {
  const { kernel, root } = await makeKernel(t);
  await kernel.change(change({ idempotency_key: "search-create", body: "Gutenberg made publishing composable.", occurred_at: T0 }));
  const index = await kernel.rebuildIndex();
  assert.equal(index.indexed, 1);
  const hits = await kernel.search({ query: "Gutenberg publishing" });
  assert.equal(hits.length, 1);
  assert.match(hits[0].snippet, /Gutenberg/i);
  assert.deepEqual(await kernel.search({ query: "definitely-no-such-context" }), []);
  const emptyPack = await kernel.assembleContextPack({ query: "definitely-no-such-context" });
  assert.equal(emptyPack.selected_items, 0);
  assert.deepEqual(emptyPack.context.explicit, []);
  assert.ok(emptyPack.omissions.some((entry) => entry.reason === "query_mismatch"));
  assert.match(emptyPack.pack_hash, /^[a-f0-9]{64}$/);

  const secondHarness = await ContextKernel.open(root);
  const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => (
    (index % 2 === 0 ? kernel : secondHarness).search({ query: "Gutenberg publishing" })
  )));
  assert.ok(concurrent.every((result) => result.length === 1));
});

test("agent authority is fail-closed while observed and inferred proposals remain writable", async (t) => {
  const { kernel } = await makeKernel(t);
  await assert.rejects(
    kernel.change(change({ idempotency_key: "agent-explicit", actor: AGENT, basis: "explicit" })),
    hasCode("AUTHORITY_DENIED"),
  );
  const observed = await kernel.change(change({
    idempotency_key: "agent-observed",
    actor: AGENT,
    basis: "observed",
    body: "A cautiously observed signal",
  }));
  assert.equal(observed.event.basis, "observed");
  const explicit = await kernel.change(change({
    idempotency_key: "user-explicit-protected",
    body: "A confirmed user preference",
  }));
  await assert.rejects(
    kernel.correct(change({
      idempotency_key: "agent-overwrite-explicit",
      actor: AGENT,
      basis: "inferred",
      entity_id: explicit.event.entity.id,
      expected_revision: 1,
      kind: "context.corrected",
      body: "Agent replacement",
    })),
    hasCode("AUTHORITY_DENIED"),
  );
  assert.equal((await kernel.get(explicit.event.entity.type, explicit.event.entity.id))?.body, "A confirmed user preference");
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "agent-approved",
      actor: AGENT,
      basis: "inferred",
      payload: { status: "approved" },
    })),
    hasCode("AUTHORITY_DENIED"),
  );
});

test("run checkpoints resume by revision and completion is explicit", async (t) => {
  const { kernel } = await makeKernel(t);
  const runId = ContextKernel.newRunId();
  await kernel.checkpointRun({
    run_id: runId,
    idempotency_key: "run-checkpoint",
    expected_revision: 0,
    actor: AGENT,
    summary: "Sources inspected",
    state: { completed_steps: 2 },
    occurred_at: T0,
  });
  const completion = {
    run_id: runId,
    idempotency_key: "run-complete",
    expected_revision: 1,
    actor: AGENT,
    status: "completed" as const,
    summary: "Context pack assembled",
    output_refs: ["pack:latest"],
    occurred_at: T1,
  };
  const completed = await kernel.completeRun(completion);
  const retry = await kernel.completeRun(completion);
  assert.equal(completed.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.event.event_id, completed.event.event_id);
  const run = await kernel.get("run", runId);
  assert.equal(run?.revision, 2);
  assert.equal(run?.payload.status, "completed");
  assert.equal(run?.body_state, "present");
  await assert.rejects(kernel.checkpointRun({
    run_id: runId,
    idempotency_key: "run-checkpoint-after-terminal",
    expected_revision: 2,
    actor: AGENT,
    summary: "Must not reopen",
    occurred_at: T2,
  }), hasCode("RUN_TERMINAL"));
  await assert.rejects(kernel.change({
    idempotency_key: "raw-run-change-after-terminal",
    actor: AGENT,
    kind: "run.checkpointed",
    basis: "inferred",
    entity_type: "run",
    entity_id: runId,
    expected_revision: 2,
    payload: { phase: "checkpoint" },
    body: canonicalJson({ summary: "raw reopen" }),
    occurred_at: T2,
  }), hasCode("RUN_TERMINAL"));
  assert.equal((await kernel.changes()).length, 2);
});

test("closed protocol event kinds are bound to their entity type before append", async (t) => {
  const { kernel } = await makeKernel(t);
  await assert.rejects(kernel.change(change({
    idempotency_key: "wrong-closed-kind",
    kind: "draft.prepared",
    entity_type: "decision",
    entity_id: ContextKernel.newEntityId(),
  })), hasCode("KIND_ENTITY_MISMATCH"));
  assert.equal((await kernel.changes()).length, 0);

  const entityId = ContextKernel.newEntityId();
  const entity = evidenceEntity({
    entity_id: entityId,
    actor: USER,
    basis: "explicit",
    content: "Generic lifecycle kinds remain valid for trusted canonical writes.",
  });
  const accepted = await kernel.change(change({
    idempotency_key: "generic-lifecycle-closed-entity",
    kind: "context.created",
    entity_type: "evidence_item",
    entity_id: entityId,
    body: canonicalJson(entity),
  }));
  assert.equal(accepted.created, true);
});

test("closed protocol entity writes require a canonical encrypted snapshot bound to owner, revision, actor, and authority", async (t) => {
  const { kernel, root } = await makeKernel(t);
  const missingInputId = ContextKernel.newEntityId();
  const missingInputEntity = evidenceEntity({
    entity_id: missingInputId,
    actor: USER,
    basis: "explicit",
    content: "Caller id is required",
  });
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "protocol-missing-input-id",
      entity_type: "evidence_item",
      body: canonicalJson(missingInputEntity),
    })),
    hasCode("PROTOCOL_ENTITY_ID_REQUIRED"),
  );

  const missingBodyId = ContextKernel.newEntityId();
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "protocol-missing-body",
      entity_type: "evidence_item",
      entity_id: missingBodyId,
      body: undefined,
    })),
    hasCode("PROTOCOL_ENTITY_BODY_REQUIRED"),
  );

  const noncanonicalId = ContextKernel.newEntityId();
  const noncanonicalEntity = evidenceEntity({
    entity_id: noncanonicalId,
    actor: USER,
    basis: "explicit",
    content: "Whitespace must not alter the canonical snapshot",
  });
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "protocol-not-canonical",
      entity_type: "evidence_item",
      entity_id: noncanonicalId,
      body: JSON.stringify(noncanonicalEntity, null, 2),
    })),
    hasCode("PROTOCOL_ENTITY_NOT_CANONICAL"),
  );

  const invalidHashId = ContextKernel.newEntityId();
  const invalidHashEntity = {
    ...evidenceEntity({
      entity_id: invalidHashId,
      actor: USER,
      basis: "explicit",
      content: "Original hash input",
    }),
    content: "Changed after sealing",
  };
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "protocol-invalid-hash",
      entity_type: "evidence_item",
      entity_id: invalidHashId,
      body: canonicalJson(invalidHashEntity),
    })),
    hasCode("PROTOCOL_ENTITY_INVALID"),
  );

  const wrongOwnerId = ContextKernel.newEntityId();
  const wrongOwnerEntity = evidenceEntity({
    entity_id: wrongOwnerId,
    actor: USER,
    basis: "explicit",
    content: "Wrong owner",
    owner_id: "user-intruder",
  });
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "protocol-wrong-owner",
      entity_type: "evidence_item",
      entity_id: wrongOwnerId,
      body: canonicalJson(wrongOwnerEntity),
    })),
    hasCode("PROTOCOL_ENTITY_BINDING_MISMATCH"),
  );

  const wrongRevisionId = ContextKernel.newEntityId();
  const wrongRevisionEntity = evidenceEntity({
    entity_id: wrongRevisionId,
    actor: USER,
    basis: "explicit",
    content: "Wrong revision",
    revision: 2,
  });
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "protocol-wrong-revision",
      entity_type: "evidence_item",
      entity_id: wrongRevisionId,
      body: canonicalJson(wrongRevisionEntity),
    })),
    hasCode("PROTOCOL_ENTITY_BINDING_MISMATCH"),
  );

  const wrongActorId = ContextKernel.newEntityId();
  const wrongActorEntity = evidenceEntity({
    entity_id: wrongActorId,
    actor: { actor_id: "user-intruder", actor_type: "user" },
    basis: "explicit",
    content: "Wrong actor",
  });
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "protocol-wrong-actor",
      entity_type: "evidence_item",
      entity_id: wrongActorId,
      body: canonicalJson(wrongActorEntity),
    })),
    hasCode("PROTOCOL_ENTITY_BINDING_MISMATCH"),
  );

  const unauthorizedAgentId = ContextKernel.newEntityId();
  const unauthorizedAgentEntity = contextStatementEntity({
    entity_id: unauthorizedAgentId,
    actor: AGENT,
    basis: "inferred",
    status: "active",
  });
  await assert.rejects(
    kernel.change(change({
      idempotency_key: "protocol-agent-active-inference",
      actor: AGENT,
      basis: "inferred",
      entity_type: "context_statement",
      entity_id: unauthorizedAgentId,
      body: canonicalJson(unauthorizedAgentEntity),
    })),
    hasCode("PROTOCOL_ENTITY_AUTHORITY_DENIED"),
  );

  const proposedAgentId = ContextKernel.newEntityId();
  const proposedAgentEntity = contextStatementEntity({
    entity_id: proposedAgentId,
    actor: AGENT,
    basis: "inferred",
    status: "proposed",
  });
  const proposed = await kernel.change(change({
    idempotency_key: "protocol-agent-proposal",
    actor: AGENT,
    basis: "inferred",
    entity_type: "context_statement",
    entity_id: proposedAgentId,
    body: canonicalJson(proposedAgentEntity),
  }));
  assert.equal(proposed.event.actor.actor_type, "agent");

  const validId = ContextKernel.newEntityId();
  const secret = "Valid canonical encrypted snapshot secretxyz";
  const validEntity = evidenceEntity({
    entity_id: validId,
    actor: USER,
    basis: "explicit",
    content: secret,
  });
  const valid = await kernel.change(change({
    idempotency_key: "protocol-valid-canonical",
    entity_type: "evidence_item",
    entity_id: validId,
    body: canonicalJson(validEntity),
  }));
  assert.ok(valid.event.private_body);
  assert.equal(await kernel.readEventBody(valid.event), canonicalJson(validEntity));
  const eventFiles = await filesUnder(join(root, "ledger", "events"));
  const immutableLedger = (await Promise.all(eventFiles.map((path) => readFile(path, "utf8")))).join("\n");
  assert.equal(immutableLedger.includes(secret), false);
  assert.equal((await kernel.changes()).length, 2);
});

test("protocol adapter emits afi.ledger_event.v1 that passes protocol validation", async (t) => {
  const { kernel } = await makeKernel(t);
  await kernel.change(change({
    idempotency_key: "protocol-local-only",
    body: "Harness-local context is not misrepresented as a protocol entity",
    occurred_at: T0,
  }));
  const entityId = ContextKernel.newEntityId();
  const entity = evidenceEntity({
    entity_id: entityId,
    actor: USER,
    basis: "explicit",
    content: "Private evidence body",
  });
  await kernel.change(change({
    idempotency_key: "protocol-evidence",
    entity_type: "evidence_item",
    entity_id: entityId,
    body: canonicalJson(entity),
    occurred_at: T0,
  }));
  const events = await kernel.changes();
  const adapted = toProtocolLedgerEvents({
    manifest: kernel.manifest,
    events,
    resolve_entity: () => entity,
  });
  assert.equal(adapted.length, 1);
  assert.equal(adapted[0].schema, "afi.ledger_event.v1");
  assert.equal(adapted[0].operation, "created");
  assert.match(String(adapted[0].event_hash), /^sha256:[a-f0-9]{64}$/);
  const protocol = await import(new URL("../../../../packages/protocol/dist/index.js", import.meta.url).href) as {
    validateLedgerEvent(value: unknown): { ok: boolean; issues?: unknown[] };
    projectLedgerEvents(values: unknown[]): { applied_event_ids: string[] };
  };
  const validation = protocol.validateLedgerEvent(adapted[0]);
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  assert.deepEqual(protocol.projectLedgerEvents(adapted).applied_event_ids, [events[1].event_id]);

  await kernel.delete({
    idempotency_key: "protocol-evidence-delete",
    entity_type: "evidence_item",
    entity_id: entityId,
    expected_revision: 1,
    actor: USER,
    reason_code: "user_request",
    occurred_at: T1,
  });
  const afterDeletion = toProtocolLedgerEvents({
    manifest: kernel.manifest,
    events: await kernel.changes(),
    resolve_entity: () => {
      throw new Error("Deleted protocol snapshots must never be resolved");
    },
  });
  assert.deepEqual(afterDeletion, []);
});

test("CLI initializes, changes, and searches a workspace using JSON-only I/O", async (t) => {
  const root = await makeTemp(t);
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  const initialized = await execFileAsync(process.execPath, [
    cli,
    "init",
    "--workspace",
    root,
    "--input",
    JSON.stringify({ owner_id: "user-tony", created_at: T0 }),
  ]);
  assert.equal(JSON.parse(initialized.stdout).created, true);
  const changed = await execFileAsync(process.execPath, [
    cli,
    "change",
    "--workspace",
    root,
    "--input",
    JSON.stringify(change({ idempotency_key: "cli-create", body: "CLI searchable context" })),
  ]);
  assert.equal(JSON.parse(changed.stdout).created, true);
  const searched = await execFileAsync(process.execPath, [
    cli,
    "search",
    "--workspace",
    root,
    "--input",
    JSON.stringify({ query: "searchable" }),
  ]);
  assert.equal(JSON.parse(searched.stdout).length, 1);
});

test("separate CLI processes serialize append and projection mutations", async (t) => {
  const root = await makeTemp(t);
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  await execFileAsync(process.execPath, [
    cli,
    "init",
    "--workspace",
    root,
    "--input",
    JSON.stringify({ owner_id: "user-tony", created_at: T0 }),
  ]);
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => execFileAsync(process.execPath, [
    cli,
    "change",
    "--workspace",
    root,
    "--input",
    JSON.stringify(change({
      idempotency_key: `cross-process-${index}`,
      body: `Worker ${index} durable context`,
      occurred_at: T0,
    })),
  ])));
  assert.ok(results.every((result) => JSON.parse(result.stdout).created === true));
  const retryInput = JSON.stringify(change({
    idempotency_key: "cross-process-shared-retry",
    body: "One event across retrying processes",
    occurred_at: T1,
  }));
  const retries = await Promise.all(Array.from({ length: 6 }, () => execFileAsync(process.execPath, [
    cli,
    "change",
    "--workspace",
    root,
    "--input",
    retryInput,
  ])));
  assert.equal(retries.filter((result) => JSON.parse(result.stdout).created === true).length, 1);
  const kernel = await ContextKernel.open(root);
  const events = await kernel.changes();
  assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const projected = JSON.parse(await readFile(join(root, "projections", "context.json"), "utf8")) as {
    watermark: { event_count: number; last_event_hash: string };
  };
  assert.equal(projected.watermark.event_count, 9);
  assert.equal(projected.watermark.last_event_hash, events.at(-1)?.event_hash);
});

function change(overrides: Partial<ChangeInput> = {}): ChangeInput {
  return {
    idempotency_key: "change-default",
    actor: USER,
    kind: "context.created",
    basis: "explicit",
    entity_type: "local_context",
    expected_revision: 0,
    payload: { category: "preference" },
    body: "A context statement",
    ...overrides,
  };
}

function evidenceEntity(input: {
  entity_id: string;
  actor: ActorRef;
  basis: "explicit" | "observed" | "inferred";
  content: string;
  owner_id?: string;
  revision?: number;
}): Record<string, never> & Record<string, unknown> {
  const withoutHash = {
    schema: "afi.evidence_item.v1",
    entity_type: "evidence_item",
    entity_id: input.entity_id,
    owner_id: input.owner_id ?? "user-tony",
    revision: input.revision ?? 1,
    created_at: T0,
    updated_at: T0,
    created_by: input.actor,
    last_modified_by: input.actor,
    provenance: {
      basis: input.basis,
      evidence_refs: [],
      human_seed_refs: [],
      derived_from_refs: [],
      external_refs: [],
      recorded_at: T0,
    },
    retention: {
      classification: "private",
      mode: "durable",
      replication: "local_only",
      body_storage: "encrypted_object",
    },
    evidence_kind: "human_capture",
    title: "Private capture",
    summary: "Body stored out of line",
    captured_at: T0,
    content: input.content,
    metadata: {},
  };
  return sealProtocolEntity(withoutHash);
}

function contextStatementEntity(input: {
  entity_id: string;
  actor: ActorRef;
  basis: "explicit" | "observed" | "inferred";
  status: "proposed" | "active";
}): Record<string, never> & Record<string, unknown> {
  return sealProtocolEntity({
    schema: "afi.context_statement.v1",
    entity_type: "context_statement",
    entity_id: input.entity_id,
    owner_id: "user-tony",
    revision: 1,
    created_at: T0,
    updated_at: T0,
    created_by: input.actor,
    last_modified_by: input.actor,
    provenance: {
      basis: input.basis,
      evidence_refs: [],
      human_seed_refs: [],
      derived_from_refs: [],
      external_refs: [],
      ...(input.basis === "inferred" ? { confidence: 0.7 } : {}),
      recorded_at: T0,
    },
    retention: {
      classification: "private",
      mode: "durable",
      replication: "local_only",
      body_storage: "encrypted_object",
    },
    basis: input.basis,
    status: input.status,
    subject: "user-tony",
    predicate: "prefers",
    value: "low-noise agent assistance",
    scope: { kind: "global" },
  });
}

function sealProtocolEntity(
  entity: Record<string, unknown>,
): Record<string, never> & Record<string, unknown> {
  return {
    ...entity,
    record_hash: `sha256:${sha256(canonicalJson(entity))}`,
  } as never;
}

async function makeKernel(t: { after(fn: () => Promise<void>): void }): Promise<{ kernel: ContextKernel; root: string }> {
  const root = await makeTemp(t);
  const { kernel } = await initializeContextWorkspace(root, { owner_id: "user-tony", created_at: T0 });
  return { kernel, root };
}

async function makeTemp(t: { after(fn: () => Promise<void>): void }): Promise<string> {
  const root = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(join(tmpdir(), "afi-context-kernel-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof ContextKernelError && error.code === code;
}

async function filesUnder(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await filesUnder(path)));
    else output.push(path);
  }
  return output.sort();
}
