import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const SUPPORTED_FEEDS = new Set(["computer_history_today", "x_following"]);
const RECEIPT_SCHEMA = "afi.feed_connection_receipt.v1";
const CUE_SCHEMA = "afi.feed_cue.v1";
const PLAN_SCHEMA = "afi.feed_plan.v1";
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RECEIPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_SCOPES: Record<string, string> = {
  computer_history_today: "Current local day · recall cues only",
  x_following: "Following timeline only · bounded read",
};
const EXPECTED_BOUNDARIES: Record<string, "inside_recall" | "outside_input"> = {
  computer_history_today: "inside_recall",
  x_following: "outside_input",
};
const CUE_DIRECTORIES = {
  inside_recall: "inside-cues",
  outside_input: "outside-cues",
} as const;

export interface FeedPlanRow {
  id: string;
  isEnabled: boolean;
  accountIdentifier: string;
  permission: string;
}

export interface FeedPlanDocument {
  schema: typeof PLAN_SCHEMA;
  revision: number;
  updatedAt: string;
  planHash: string;
  plans: FeedPlanRow[];
}

export interface FeedConnectionCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface FeedConnectionReceiptInput {
  id?: string;
  feedID: string;
  planRevision: number;
  planHash: string;
  adapter: string;
  expectedIdentity: string;
  observedIdentity?: string;
  permission: string;
  scope: string;
  status: "verified" | "partial" | "unavailable";
  verifiedAt: string;
  expiresAt: string;
  lastSuccessfulReadAt?: string;
  checks: FeedConnectionCheck[];
  summary: string;
}

export interface FeedConnectionReceipt extends FeedConnectionReceiptInput {
  schema: typeof RECEIPT_SCHEMA;
  id: string;
}

export interface FeedCueInput {
  id?: string;
  feedID: string;
  boundary: "inside_recall" | "outside_input";
  planRevision: number;
  planHash: string;
  receiptID: string;
  minimizedCue: string;
  observedAt: string;
  recordedAt: string;
  expiresAt: string;
  sourceDoors: string[];
  uncertain: boolean;
  requiresCalibration: boolean;
}

export interface FeedCue extends FeedCueInput {
  schema: typeof CUE_SCHEMA;
  id: string;
}

export interface FeedCueListInput {
  boundary?: "inside_recall" | "outside_input";
  feedID?: string;
  limit?: number;
}

export interface FeedConnectionGateway {
  listConnections(now?: Date): Promise<unknown>;
  recordReceipt(input: FeedConnectionReceiptInput): Promise<FeedConnectionReceipt>;
  listCues(input?: FeedCueListInput, now?: Date): Promise<unknown>;
  recordCue(input: FeedCueInput): Promise<FeedCue>;
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "");
}

function requiredChecks(feedID: string): string[] {
  switch (feedID) {
    case "computer_history_today":
      return ["current_local_day", "segment_readable"];
    case "x_following":
      return ["account_visible", "account_matches", "following_selected", "bounded_read_completed"];
    default:
      return [];
  }
}

function maxReceiptTTL(feedID: string): number {
  return feedID === "computer_history_today" ? 15 * 60_000 : 60 * 60_000;
}

function parseTime(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an RFC 3339 timestamp`);
  return parsed;
}

function assertPlanDocument(value: unknown): asserts value is FeedPlanDocument {
  if (!value || typeof value !== "object") throw new Error("Feed plan must be a JSON object");
  const plan = value as Partial<FeedPlanDocument>;
  if (plan.schema !== PLAN_SCHEMA) throw new Error("Unsupported feed-plan schema");
  if (!Number.isSafeInteger(plan.revision) || Number(plan.revision) < 1) throw new Error("Feed plan revision is invalid");
  if (typeof plan.updatedAt !== "string" || !Number.isFinite(Date.parse(plan.updatedAt))) {
    throw new Error("Feed plan updatedAt is invalid");
  }
  if (typeof plan.planHash !== "string" || !HASH_PATTERN.test(plan.planHash)) {
    throw new Error("Feed plan hash is invalid");
  }
  if (!Array.isArray(plan.plans)) throw new Error("Feed plan rows are missing");
  for (const row of plan.plans) {
    if (!row || typeof row !== "object") throw new Error("Feed plan contains an invalid row");
    if (typeof row.id !== "string" || typeof row.isEnabled !== "boolean"
      || typeof row.accountIdentifier !== "string" || typeof row.permission !== "string") {
      throw new Error("Feed plan row fields are invalid");
    }
  }
  const canonicalPlans = plan.plans.map((row) => ({
    accountIdentifier: row.accountIdentifier,
    id: row.id,
    isEnabled: row.isEnabled,
    permission: row.permission,
  }));
  const expectedHash = `sha256:${createHash("sha256").update(JSON.stringify(canonicalPlans)).digest("hex")}`;
  if (plan.planHash !== expectedHash) throw new Error("Feed plan hash does not match its rows");
}

function assertReceiptMatchesPlan(
  input: FeedConnectionReceiptInput,
  document: FeedPlanDocument,
  now: Date,
): FeedPlanRow {
  if (!SUPPORTED_FEEDS.has(input.feedID)) {
    throw new Error(`Feed receipts are not implemented for ${input.feedID}`);
  }
  const row = document.plans.find((candidate) => candidate.id === input.feedID);
  if (!row?.isEnabled) throw new Error(`Feed ${input.feedID} is not enabled in the user-authored plan`);
  if (input.planRevision !== document.revision || input.planHash !== document.planHash) {
    throw new Error("Feed receipt targets a stale plan revision or hash");
  }
  if (input.permission !== row.permission) throw new Error("Feed receipt permission does not match the saved plan");
  if (input.scope !== EXPECTED_SCOPES[input.feedID]) {
    throw new Error("Feed receipt scope does not match the bounded adapter scope");
  }
  if (input.adapter.length < 1 || input.adapter.length > 128) throw new Error("Feed adapter identity is invalid");
  if (input.summary.length < 1 || input.summary.length > 512 || /[\r\n]/.test(input.summary)) {
    throw new Error("Feed receipt summary must be one concise line");
  }

  const expected = row.accountIdentifier.trim();
  if (input.expectedIdentity.trim() !== expected) {
    throw new Error("Feed receipt expected identity does not exactly match the saved plan");
  }
  if (input.feedID === "x_following") {
    if (!input.observedIdentity || normalizeIdentity(input.observedIdentity) !== normalizeIdentity(expected)) {
      throw new Error("Visible X identity does not match the configured personal account");
    }
  }

  const verifiedAt = parseTime(input.verifiedAt, "verifiedAt");
  const expiresAt = parseTime(input.expiresAt, "expiresAt");
  if (verifiedAt > now.getTime() + 5 * 60_000) throw new Error("Feed receipt verification time is in the future");
  if (expiresAt <= verifiedAt) throw new Error("Feed receipt must expire after verification");
  if (expiresAt - verifiedAt > maxReceiptTTL(input.feedID)) {
    throw new Error("Feed receipt exceeds the maximum freshness window");
  }
  if (input.lastSuccessfulReadAt) {
    const readAt = parseTime(input.lastSuccessfulReadAt, "lastSuccessfulReadAt");
    if (readAt < verifiedAt - maxReceiptTTL(input.feedID) || readAt > now.getTime() + 5 * 60_000) {
      throw new Error("Feed read time falls outside the bounded verification window");
    }
  }

  const names = new Set<string>();
  for (const check of input.checks) {
    if (!check.name || names.has(check.name)) throw new Error("Feed receipt checks must have unique names");
    if (!check.detail || check.detail.length > 256 || /[\r\n]/.test(check.detail)) {
      throw new Error("Feed receipt check detail must be one concise line");
    }
    names.add(check.name);
  }
  if (input.status === "verified") {
    for (const required of requiredChecks(input.feedID)) {
      if (!input.checks.some((check) => check.name === required && check.passed)) {
        throw new Error(`Verified ${input.feedID} receipt is missing required check ${required}`);
      }
    }
    if (input.checks.some((check) => !check.passed)) {
      throw new Error("A verified feed receipt cannot contain a failed check");
    }
    if (input.feedID === "computer_history_today"
      && !input.checks.some((check) => ["history_running", "recent_segment"].includes(check.name) && check.passed)) {
      throw new Error("Verified Computer History receipt must prove a running service or recent segment");
    }
  }
  return row;
}

function receiptPhase(receipt: FeedConnectionReceipt | undefined, now: Date): string {
  if (!receipt) return "awaiting_verification";
  if (receipt.status !== "verified") return receipt.status;
  return Date.parse(receipt.expiresAt) > now.getTime() ? "connected" : "stale";
}

function safeSourceDoor(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Cue source doors must be absolute URLs");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Cue source doors must use HTTP or HTTPS without embedded credentials");
  }
  return url;
}

function assertCueMatchesPlan(
  input: FeedCueInput,
  document: FeedPlanDocument,
  receipt: FeedConnectionReceipt,
  now: Date,
  requireFreshReceipt: boolean,
): FeedPlanRow {
  if (!SUPPORTED_FEEDS.has(input.feedID)) throw new Error(`Feed cues are not implemented for ${input.feedID}`);
  const row = document.plans.find((candidate) => candidate.id === input.feedID);
  if (!row?.isEnabled) throw new Error(`Feed ${input.feedID} is not enabled in the user-authored plan`);
  if (row.permission !== "read_only") throw new Error("Feed cues require a read-only source plan");
  if (input.boundary !== EXPECTED_BOUNDARIES[input.feedID]) {
    throw new Error("Feed cue boundary does not match the selected source");
  }
  if (input.planRevision !== document.revision || input.planHash !== document.planHash) {
    throw new Error("Feed cue targets a stale plan revision or hash");
  }
  if (input.receiptID !== receipt.id || receipt.feedID !== input.feedID) {
    throw new Error("Feed cue does not reference its matching connection receipt");
  }

  const recordedAt = parseTime(input.recordedAt, "recordedAt");
  const observedAt = parseTime(input.observedAt, "observedAt");
  const expiresAt = parseTime(input.expiresAt, "expiresAt");
  const receiptVerifiedAt = parseTime(receipt.verifiedAt, "receipt.verifiedAt");
  const receiptExpiresAt = parseTime(receipt.expiresAt, "receipt.expiresAt");
  assertReceiptMatchesPlan(receipt, document, new Date(recordedAt));
  if (receipt.status !== "verified" || receipt.checks.some((check) => !check.passed)) {
    throw new Error("Feed cue requires a fully verified connection receipt");
  }
  if (recordedAt < receiptVerifiedAt || recordedAt > receiptExpiresAt) {
    throw new Error("Feed cue was not recorded during the receipt freshness window");
  }
  if (requireFreshReceipt && receiptExpiresAt <= now.getTime()) {
    throw new Error("The connection receipt expired before the cue was recorded");
  }
  if (recordedAt > now.getTime() + 5 * 60_000) throw new Error("Feed cue record time is in the future");
  if (observedAt > recordedAt + 5 * 60_000 || observedAt < receiptVerifiedAt - maxReceiptTTL(input.feedID)) {
    throw new Error("Feed cue observation falls outside the bounded read window");
  }
  if (expiresAt <= recordedAt || expiresAt - recordedAt > 24 * 60 * 60_000) {
    throw new Error("Feed cue must expire within 24 hours");
  }

  const minimized = input.minimizedCue.trim();
  if (!minimized || minimized.length > 512 || /[\r\n]/.test(minimized)) {
    throw new Error("Feed cue must be one minimized line of at most 512 characters");
  }
  if (!Array.isArray(input.sourceDoors) || input.sourceDoors.length > 3) {
    throw new Error("Feed cue may contain at most three source doors");
  }
  const sourceDoors = input.sourceDoors.map(safeSourceDoor);
  if (!input.uncertain || !input.requiresCalibration) {
    throw new Error("Feed cues must remain uncertain and require human calibration");
  }
  if (input.feedID === "computer_history_today" && sourceDoors.length !== 0) {
    throw new Error("Computer History recall cues cannot retain source doors");
  }
  if (input.feedID === "x_following") {
    if (sourceDoors.length === 0) throw new Error("X Following cues require a user-openable source door");
    if (sourceDoors.some((url) => url.hostname !== "x.com" && !url.hostname.endsWith(".x.com"))) {
      throw new Error("X Following cue source doors must stay on x.com");
    }
  }
  return row;
}

export class FileFeedConnectionGateway implements FeedConnectionGateway {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async listConnections(now = new Date()): Promise<unknown> {
    const document = await this.readPlan();
    if (!document) {
      return {
        configured: false,
        message: "No user-authored feed plan exists. Configure feeds in Quiet Desk first.",
        connections: [],
      };
    }

    const receipts = await this.readReceipts();
    const connections = document.plans.filter((plan) => plan.isEnabled).map((plan) => {
      const latest = receipts
        .filter((receipt) => receipt.feedID === plan.id
          && receipt.planRevision === document.revision
          && receipt.planHash === document.planHash
          && receipt.permission === plan.permission
          && receipt.expectedIdentity === plan.accountIdentifier.trim()
          && this.receiptMatchesPlan(receipt, document, now))
        .sort((left, right) => Date.parse(right.verifiedAt) - Date.parse(left.verifiedAt))[0];
      return {
        feed_id: plan.id,
        expected_identity: plan.accountIdentifier.trim(),
        permission: plan.permission,
        plan_revision: document.revision,
        plan_hash: document.planHash,
        phase: receiptPhase(latest, now),
        latest_receipt: latest ?? null,
      };
    });

    return {
      configured: true,
      schema: document.schema,
      revision: document.revision,
      plan_hash: document.planHash,
      updated_at: document.updatedAt,
      connections,
    };
  }

  async recordReceipt(input: FeedConnectionReceiptInput): Promise<FeedConnectionReceipt> {
    const document = await this.readPlan();
    if (!document) throw new Error("No user-authored feed plan exists");
    assertReceiptMatchesPlan(input, document, new Date());

    const id = input.id ?? randomUUID();
    if (!RECEIPT_ID_PATTERN.test(id)) throw new Error("Feed receipt ID must be a UUID");
    const receipt: FeedConnectionReceipt = {
      schema: RECEIPT_SCHEMA,
      ...input,
      id: id.toLowerCase(),
      expectedIdentity: input.expectedIdentity.trim(),
      ...(input.observedIdentity ? { observedIdentity: input.observedIdentity.trim() } : {}),
    };

    const receiptsRoot = join(this.root, "receipts");
    await mkdir(receiptsRoot, { recursive: true, mode: 0o700 });
    const destination = resolve(receiptsRoot, `${receipt.id}.json`);
    if (!destination.startsWith(`${resolve(receiptsRoot)}${sep}`)) throw new Error("Unsafe feed receipt path");
    const handle = await open(destination, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return receipt;
  }

  async listCues(input: FeedCueListInput = {}, now = new Date()): Promise<unknown> {
    const document = await this.readPlan();
    if (!document) {
      return {
        configured: false,
        message: "No user-authored feed plan exists. Configure feeds in Quiet Desk first.",
        cues: [],
      };
    }
    const receipts = await this.readReceipts();
    const receiptByID = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    const cues = (await this.readCues())
      .filter((cue) => {
        const receipt = receiptByID.get(cue.receiptID);
        if (!receipt || Date.parse(cue.expiresAt) <= now.getTime()) return false;
        try {
          assertCueMatchesPlan(cue, document, receipt, now, false);
          return (!input.boundary || cue.boundary === input.boundary)
            && (!input.feedID || cue.feedID === input.feedID);
        } catch {
          return false;
        }
      })
      .sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt))
      .slice(0, Math.min(Math.max(input.limit ?? 10, 1), 50));

    return {
      configured: true,
      revision: document.revision,
      plan_hash: document.planHash,
      active_count: cues.length,
      cues,
      retention: "Ephemeral only. These cues are not Context Kernel evidence, beliefs, or Places.",
    };
  }

  async recordCue(input: FeedCueInput): Promise<FeedCue> {
    const document = await this.readPlan();
    if (!document) throw new Error("No user-authored feed plan exists");
    const receipt = (await this.readReceipts()).find((candidate) => candidate.id === input.receiptID);
    if (!receipt) throw new Error("Feed cue requires a matching connection receipt");
    assertCueMatchesPlan(input, document, receipt, new Date(), true);

    const id = input.id ?? randomUUID();
    if (!RECEIPT_ID_PATTERN.test(id)) throw new Error("Feed cue ID must be a UUID");
    const cue: FeedCue = {
      schema: CUE_SCHEMA,
      ...input,
      id: id.toLowerCase(),
      minimizedCue: input.minimizedCue.trim(),
    };
    const cuesRoot = join(this.root, CUE_DIRECTORIES[cue.boundary]);
    await mkdir(cuesRoot, { recursive: true, mode: 0o700 });
    const destination = resolve(cuesRoot, `${cue.id}.json`);
    if (!destination.startsWith(`${resolve(cuesRoot)}${sep}`)) throw new Error("Unsafe feed cue path");
    const handle = await open(destination, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(cue, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return cue;
  }

  private async readPlan(): Promise<FeedPlanDocument | undefined> {
    try {
      const parsed: unknown = JSON.parse(await readFile(join(this.root, "plan.json"), "utf8"));
      assertPlanDocument(parsed);
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async readReceipts(): Promise<FeedConnectionReceipt[]> {
    const receiptsRoot = join(this.root, "receipts");
    let names: string[];
    try {
      names = await readdir(receiptsRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const receipts: FeedConnectionReceipt[] = [];
    for (const name of names.filter((candidate) => candidate.endsWith(".json"))) {
      try {
        const parsed = JSON.parse(await readFile(join(receiptsRoot, name), "utf8")) as FeedConnectionReceipt;
        if (parsed.schema === RECEIPT_SCHEMA && RECEIPT_ID_PATTERN.test(parsed.id)) receipts.push(parsed);
      } catch {
        // A malformed receipt never proves connection and is ignored by the read projection.
      }
    }
    return receipts;
  }

  private async readCues(): Promise<FeedCue[]> {
    const cues: FeedCue[] = [];
    for (const [boundary, directory] of Object.entries(CUE_DIRECTORIES)) {
      const cuesRoot = join(this.root, directory);
      let names: string[];
      try {
        names = await readdir(cuesRoot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      for (const name of names.filter((candidate) => candidate.endsWith(".json"))) {
        try {
          const parsed = JSON.parse(await readFile(join(cuesRoot, name), "utf8")) as FeedCue;
          if (parsed.schema === CUE_SCHEMA
            && RECEIPT_ID_PATTERN.test(parsed.id)
            && parsed.boundary === boundary
            && name === `${parsed.id}.json`) {
            cues.push(parsed);
          }
        } catch {
          // Malformed or misplaced cues never enter the Daily Conversation projection.
        }
      }
    }
    return cues;
  }

  private receiptMatchesPlan(
    receipt: FeedConnectionReceipt,
    document: FeedPlanDocument,
    now: Date,
  ): boolean {
    try {
      assertReceiptMatchesPlan(receipt, document, now);
      return true;
    } catch {
      return false;
    }
  }
}

export class UnavailableFeedConnectionGateway implements FeedConnectionGateway {
  async listConnections(): Promise<unknown> {
    return {
      configured: false,
      message: "The shared feed-state directory is not configured for this bridge.",
      connections: [],
    };
  }

  async recordReceipt(): Promise<FeedConnectionReceipt> {
    throw new Error("The shared feed-state directory is not configured for this bridge");
  }

  async listCues(): Promise<unknown> {
    return {
      configured: false,
      message: "The shared feed-state directory is not configured for this bridge.",
      cues: [],
    };
  }

  async recordCue(): Promise<FeedCue> {
    throw new Error("The shared feed-state directory is not configured for this bridge");
  }
}
