import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileFeedConnectionGateway,
  type FeedConnectionReceiptInput,
  type FeedCueInput,
} from "../feed-state.js";

const FIXTURE_PLANS = [
  { id: "x_following", isEnabled: true, accountIdentifier: "@tonylongname", permission: "read_only" },
  { id: "computer_history_today", isEnabled: true, accountIdentifier: "", permission: "read_only" },
];
const FIXTURE_PLAN_HASH = `sha256:${createHash("sha256").update(JSON.stringify(
  FIXTURE_PLANS.map((row) => ({
    accountIdentifier: row.accountIdentifier,
    id: row.id,
    isEnabled: row.isEnabled,
    permission: row.permission,
  })),
)).digest("hex")}`;

async function fixture(): Promise<{ root: string; gateway: FileFeedConnectionGateway; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "quiet-desk-feeds-"));
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "plan.json"), JSON.stringify({
    schema: "afi.feed_plan.v1",
    revision: 3,
    updatedAt: new Date().toISOString(),
    planHash: FIXTURE_PLAN_HASH,
    plans: FIXTURE_PLANS,
  }), { mode: 0o600 });
  return {
    root,
    gateway: new FileFeedConnectionGateway(root),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function xReceipt(overrides: Partial<FeedConnectionReceiptInput> = {}): FeedConnectionReceiptInput {
  const verifiedAt = new Date();
  return {
    feedID: "x_following",
    planRevision: 3,
    planHash: FIXTURE_PLAN_HASH,
    adapter: "x.safari-following.v1",
    expectedIdentity: "@tonylongname",
    observedIdentity: "@tonylongname",
    permission: "read_only",
    scope: "Following timeline only · bounded read",
    status: "verified",
    verifiedAt: verifiedAt.toISOString(),
    expiresAt: new Date(verifiedAt.getTime() + 60 * 60_000).toISOString(),
    lastSuccessfulReadAt: verifiedAt.toISOString(),
    checks: [
      { name: "account_visible", passed: true, detail: "The signed-in handle was visible." },
      { name: "account_matches", passed: true, detail: "The visible handle matched the plan." },
      { name: "following_selected", passed: true, detail: "Following was visibly selected." },
      { name: "bounded_read_completed", passed: true, detail: "The bounded read completed without writes." },
    ],
    summary: "Verified the personal X Following surface without retaining feed content.",
    ...overrides,
  };
}

function computerHistoryReceipt(
  overrides: Partial<FeedConnectionReceiptInput> = {},
): FeedConnectionReceiptInput {
  const verifiedAt = new Date();
  return {
    feedID: "computer_history_today",
    planRevision: 3,
    planHash: FIXTURE_PLAN_HASH,
    adapter: "computer-history.local-metadata.v1",
    expectedIdentity: "",
    permission: "read_only",
    scope: "Current local day · recall cues only",
    status: "verified",
    verifiedAt: verifiedAt.toISOString(),
    expiresAt: new Date(verifiedAt.getTime() + 15 * 60_000).toISOString(),
    lastSuccessfulReadAt: verifiedAt.toISOString(),
    checks: [
      { name: "current_local_day", passed: true, detail: "The segment belongs to the current local day." },
      { name: "segment_readable", passed: true, detail: "The referenced event stream is readable." },
      { name: "recent_segment", passed: true, detail: "The segment metadata is recent." },
    ],
    summary: "Verified current-day Computer History metadata without retaining activity content.",
    ...overrides,
  };
}

function feedCue(
  feedID: "x_following" | "computer_history_today",
  receiptID: string,
  overrides: Partial<FeedCueInput> = {},
): FeedCueInput {
  const recordedAt = new Date();
  const outside = feedID === "x_following";
  return {
    feedID,
    boundary: outside ? "outside_input" : "inside_recall",
    planRevision: 3,
    planHash: FIXTURE_PLAN_HASH,
    receiptID,
    minimizedCue: outside
      ? "Two views of agent orchestration may be worth discussing."
      : "It may have been a fragmented day across several work surfaces.",
    observedAt: recordedAt.toISOString(),
    recordedAt: recordedAt.toISOString(),
    expiresAt: new Date(recordedAt.getTime() + 6 * 60 * 60_000).toISOString(),
    sourceDoors: outside ? ["https://x.com/example/status/1"] : [],
    uncertain: true,
    requiresCalibration: true,
    ...overrides,
  };
}

test("a user-authored plan begins awaiting verification", async () => {
  const { gateway, cleanup } = await fixture();
  try {
    const state = await gateway.listConnections() as { configured: boolean; connections: Array<{ phase: string }> };
    assert.equal(state.configured, true);
    assert.deepEqual(state.connections.map((connection) => connection.phase), [
      "awaiting_verification",
      "awaiting_verification",
    ]);
  } finally {
    await cleanup();
  }
});

test("a plan whose rows changed without a new hash fails closed", async () => {
  const { root, gateway, cleanup } = await fixture();
  try {
    await writeFile(join(root, "plan.json"), JSON.stringify({
      schema: "afi.feed_plan.v1",
      revision: 3,
      updatedAt: new Date().toISOString(),
      planHash: FIXTURE_PLAN_HASH,
      plans: FIXTURE_PLANS.map((row) => row.id === "x_following"
        ? { ...row, accountIdentifier: "@thepeptideapp" }
        : row),
    }));
    await assert.rejects(() => gateway.listConnections(), /hash does not match/);
  } finally {
    await cleanup();
  }
});

test("a verified X receipt is create-only and becomes connected", async () => {
  const { root, gateway, cleanup } = await fixture();
  try {
    const receipt = await gateway.recordReceipt(xReceipt());
    assert.match(receipt.id, /^[0-9a-f-]{36}$/);
    const stored = JSON.parse(await readFile(join(root, "receipts", `${receipt.id}.json`), "utf8"));
    assert.equal(stored.schema, "afi.feed_connection_receipt.v1");

    const state = await gateway.listConnections() as {
      connections: Array<{ feed_id: string; phase: string; latest_receipt: { summary: string } | null }>;
    };
    const x = state.connections.find((connection) => connection.feed_id === "x_following");
    assert.equal(x?.phase, "connected");
    assert.match(x?.latest_receipt?.summary ?? "", /without retaining feed content/);

    await assert.rejects(() => gateway.recordReceipt({ ...xReceipt(), id: receipt.id }), /EEXIST/);
  } finally {
    await cleanup();
  }
});

test("a local Computer History receipt may prove activity with a recent segment", async () => {
  const { gateway, cleanup } = await fixture();
  try {
    await gateway.recordReceipt(computerHistoryReceipt());
    const state = await gateway.listConnections() as {
      connections: Array<{ feed_id: string; phase: string }>;
    };
    const history = state.connections.find((connection) => connection.feed_id === "computer_history_today");
    assert.equal(history?.phase, "connected");

    await assert.rejects(
      () => gateway.recordReceipt(computerHistoryReceipt({
        checks: computerHistoryReceipt().checks.filter((check) => check.name !== "recent_segment"),
      })),
      /running service or recent segment/,
    );
  } finally {
    await cleanup();
  }
});

test("receipt validation rejects identity drift, scope broadening, and incomplete proof", async () => {
  const { gateway, cleanup } = await fixture();
  try {
    await assert.rejects(
      () => gateway.recordReceipt(xReceipt({ observedIdentity: "@thepeptideapp" })),
      /does not match/,
    );
    await assert.rejects(
      () => gateway.recordReceipt(xReceipt({ scope: "All X surfaces" })),
      /bounded adapter scope/,
    );
    await assert.rejects(
      () => gateway.recordReceipt(xReceipt({
        checks: xReceipt().checks.filter((check) => check.name !== "following_selected"),
      })),
      /following_selected/,
    );
  } finally {
    await cleanup();
  }
});

test("receipt freshness is bounded and stale plan revisions fail closed", async () => {
  const { gateway, cleanup } = await fixture();
  try {
    const verifiedAt = new Date();
    await assert.rejects(
      () => gateway.recordReceipt(xReceipt({
        verifiedAt: verifiedAt.toISOString(),
        expiresAt: new Date(verifiedAt.getTime() + 61 * 60_000).toISOString(),
      })),
      /maximum freshness/,
    );
    await assert.rejects(
      () => gateway.recordReceipt(xReceipt({ planRevision: 2 })),
      /stale plan/,
    );
  } finally {
    await cleanup();
  }
});

test("a receipt file that bypassed the write boundary cannot prove connection", async () => {
  const { root, gateway, cleanup } = await fixture();
  try {
    const forged = {
      schema: "afi.feed_connection_receipt.v1",
      id: "e34ce089-83c2-4ce1-8cf6-93617ac392bf",
      ...xReceipt({
        observedIdentity: "@thepeptideapp",
        scope: "All X surfaces",
      }),
    };
    await mkdir(join(root, "receipts"), { recursive: true });
    await writeFile(join(root, "receipts", `${forged.id}.json`), JSON.stringify(forged));

    const state = await gateway.listConnections() as {
      connections: Array<{ feed_id: string; phase: string; latest_receipt: unknown }>;
    };
    const x = state.connections.find((connection) => connection.feed_id === "x_following");
    assert.equal(x?.phase, "awaiting_verification");
    assert.equal(x?.latest_receipt, null);
  } finally {
    await cleanup();
  }
});

test("feed cues are create-only, receipt-bound, and stored in literal boundary directories", async () => {
  const { root, gateway, cleanup } = await fixture();
  try {
    const x = await gateway.recordReceipt(xReceipt());
    const history = await gateway.recordReceipt(computerHistoryReceipt());
    const outside = await gateway.recordCue(feedCue("x_following", x.id));
    const inside = await gateway.recordCue(feedCue("computer_history_today", history.id));

    const storedOutside = JSON.parse(await readFile(
      join(root, "outside-cues", `${outside.id}.json`),
      "utf8",
    ));
    const storedInside = JSON.parse(await readFile(
      join(root, "inside-cues", `${inside.id}.json`),
      "utf8",
    ));
    assert.equal(storedOutside.boundary, "outside_input");
    assert.equal(storedInside.boundary, "inside_recall");
    assert.equal(storedInside.sourceDoors.length, 0);

    const listed = await gateway.listCues() as { active_count: number; cues: Array<{ id: string }> };
    assert.equal(listed.active_count, 2);
    assert.deepEqual(new Set(listed.cues.map((cue) => cue.id)), new Set([outside.id, inside.id]));
    await assert.rejects(
      () => gateway.recordCue({ ...feedCue("x_following", x.id), id: outside.id }),
      /EEXIST/,
    );
  } finally {
    await cleanup();
  }
});

test("cue validation blocks partition crossing, stale proof, private locators, and false certainty", async () => {
  const { gateway, cleanup } = await fixture();
  try {
    const x = await gateway.recordReceipt(xReceipt());
    const history = await gateway.recordReceipt(computerHistoryReceipt());

    await assert.rejects(
      () => gateway.recordCue(feedCue("x_following", x.id, { boundary: "inside_recall" })),
      /boundary does not match/,
    );
    await assert.rejects(
      () => gateway.recordCue(feedCue("computer_history_today", history.id, {
        sourceDoors: ["file:///private/history/events.jsonl"],
      })),
      /HTTP or HTTPS|cannot retain source doors/,
    );
    await assert.rejects(
      () => gateway.recordCue(feedCue("x_following", x.id, { uncertain: false })),
      /remain uncertain/,
    );
    await assert.rejects(
      () => gateway.recordCue(feedCue("x_following", x.id, {
        sourceDoors: ["https://example.com/not-x"],
      })),
      /stay on x.com/,
    );

    const expiredAt = new Date(Date.now() - 2 * 60_000);
    const expiredReceipt = await gateway.recordReceipt(xReceipt({
      verifiedAt: new Date(expiredAt.getTime() - 30 * 60_000).toISOString(),
      expiresAt: expiredAt.toISOString(),
      lastSuccessfulReadAt: new Date(expiredAt.getTime() - 30 * 60_000).toISOString(),
    }));
    await assert.rejects(
      () => gateway.recordCue(feedCue("x_following", expiredReceipt.id)),
      /expired before the cue was recorded|freshness window/,
    );
  } finally {
    await cleanup();
  }
});

test("expired, malformed, and misplaced cues are omitted from the read projection", async () => {
  const { root, gateway, cleanup } = await fixture();
  try {
    const receipt = await gateway.recordReceipt(xReceipt());
    const active = await gateway.recordCue(feedCue("x_following", receipt.id));
    const misplaced = {
      ...active,
      id: "e34ce089-83c2-4ce1-8cf6-93617ac392bf",
      boundary: "inside_recall",
    };
    await mkdir(join(root, "outside-cues"), { recursive: true });
    await writeFile(join(root, "outside-cues", `${misplaced.id}.json`), JSON.stringify(misplaced));
    await writeFile(join(root, "outside-cues", "broken.json"), "not-json");

    const future = new Date(Date.now() + 7 * 60 * 60_000);
    const listed = await gateway.listCues({}, future) as { active_count: number; cues: unknown[] };
    assert.equal(listed.active_count, 0);
    assert.deepEqual(listed.cues, []);
  } finally {
    await cleanup();
  }
});
