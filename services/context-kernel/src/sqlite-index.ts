import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "./canonical.js";
import { ContextKernelError } from "./errors.js";
import { withFileLock } from "./file-lock.js";
import { syncDirectory } from "./io.js";
import { replayLedger } from "./projector.js";
import type { SearchHit, SearchInput } from "./types.js";
import type { WorkspacePaths } from "./workspace.js";

export async function rebuildSqliteIndex(paths: WorkspacePaths): Promise<{ indexed: number; database: string }> {
  return withIndexLock(paths, () => rebuildSqliteIndexUnlocked(paths));
}

export async function rebuildAndSearchSqlite(paths: WorkspacePaths, input: SearchInput): Promise<SearchHit[]> {
  return withIndexLock(paths, async () => {
    await rebuildSqliteIndexUnlocked(paths);
    return searchSqliteUnlocked(paths, input);
  });
}

async function rebuildSqliteIndexUnlocked(paths: WorkspacePaths): Promise<{ indexed: number; database: string }> {
  const replay = await replayLedger(paths, { writeProjections: false });
  await invalidateSqliteIndexUnlocked(paths);
  const statements = [
    ".bail on",
    "PRAGMA journal_mode=WAL;",
    "PRAGMA synchronous=FULL;",
    "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    "CREATE TABLE records (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, revision INTEGER NOT NULL, basis TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, payload TEXT NOT NULL, event_id TEXT NOT NULL, PRIMARY KEY(entity_type, entity_id));",
    "CREATE VIRTUAL TABLE records_fts USING fts5(entity_type UNINDEXED, entity_id UNINDEXED, revision UNINDEXED, basis UNINDEXED, status UNINDEXED, title, body, payload, event_id UNINDEXED, tokenize='unicode61');",
    "BEGIN IMMEDIATE;",
    `INSERT INTO metadata(key,value) VALUES('watermark',${sqlQuote(canonicalJson(replay.watermark))});`,
  ];
  for (const record of replay.records) {
    const title = typeof record.payload.title === "string"
      ? record.payload.title
      : `${record.entity_type} ${record.entity_id}`;
    const values = [
      record.entity_type,
      record.entity_id,
      record.revision,
      record.basis,
      record.status,
      title,
      record.body ?? "",
      canonicalJson(record.payload),
      record.event_id,
    ].map(sqlValue).join(",");
    statements.push(`INSERT INTO records VALUES(${values});`);
    statements.push(`INSERT INTO records_fts VALUES(${values});`);
  }
  statements.push("COMMIT;", "PRAGMA wal_checkpoint(TRUNCATE);");
  await runSqlite(paths.sqlite, statements.join("\n"));
  await syncDirectory(paths.cache);
  return { indexed: replay.records.length, database: paths.sqlite };
}

export async function invalidateSqliteIndex(paths: WorkspacePaths): Promise<void> {
  await withIndexLock(paths, () => invalidateSqliteIndexUnlocked(paths));
}

async function invalidateSqliteIndexUnlocked(paths: WorkspacePaths): Promise<void> {
  await Promise.all([
    rm(paths.sqlite, { force: true }),
    rm(`${paths.sqlite}-wal`, { force: true }),
    rm(`${paths.sqlite}-shm`, { force: true }),
  ]);
  await syncDirectory(paths.cache);
}

async function searchSqliteUnlocked(paths: WorkspacePaths, input: SearchInput): Promise<SearchHit[]> {
  const limit = normalizeLimit(input.limit);
  const filters = [
    input.entity_type ? `entity_type=${sqlQuote(input.entity_type)}` : null,
    input.basis ? `basis=${sqlQuote(input.basis)}` : null,
    input.include_deleted ? null : "status='active'",
  ].filter((part): part is string => Boolean(part));
  const query = ftsQuery(input.query);
  const rows = query
    ? await runSqliteJson(paths.sqlite, [
      "SELECT entity_type,entity_id,CAST(revision AS INTEGER) AS revision,basis,status,title,",
      "snippet(records_fts,6,'[',']',' … ',24) AS snippet,bm25(records_fts) AS rank,event_id",
      `FROM records_fts WHERE records_fts MATCH ${sqlQuote(query)}`,
      filters.length > 0 ? `AND ${filters.join(" AND ")}` : "",
      "ORDER BY rank ASC, entity_type ASC, entity_id ASC",
      `LIMIT ${limit};`,
    ].join(" "))
    : await runSqliteJson(paths.sqlite, [
      "SELECT entity_type,entity_id,revision,basis,status,title,",
      "substr(CASE WHEN body='' THEN payload ELSE body END,1,240) AS snippet,0 AS rank,event_id",
      "FROM records",
      filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "",
      "ORDER BY entity_type ASC, entity_id ASC",
      `LIMIT ${limit};`,
    ].join(" "));
  return rows.map((row) => ({
    entity_type: String(row.entity_type),
    entity_id: String(row.entity_id),
    revision: Number(row.revision),
    basis: row.basis as SearchHit["basis"],
    status: row.status as SearchHit["status"],
    title: String(row.title),
    snippet: String(row.snippet ?? ""),
    rank: Number(row.rank ?? 0),
    event_id: String(row.event_id),
  }));
}

export async function ensureSqliteAvailable(): Promise<string> {
  return (await runProcess(["--version"])).stdout.trim();
}

function normalizeLimit(limit: number | undefined): number {
  const value = limit ?? 20;
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new TypeError("search limit must be an integer between 1 and 200");
  }
  return value;
}

function ftsQuery(value: string): string {
  const tokens = value.normalize("NFKC").match(/[\p{L}\p{N}_-]+/gu) ?? [];
  return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND ");
}

function sqlValue(value: string | number): string {
  return typeof value === "number" ? String(value) : sqlQuote(value);
}

function sqlQuote(value: string): string {
  if (value.includes("\u0000")) throw new TypeError("SQLite values cannot contain NUL bytes");
  return `'${value.replaceAll("'", "''")}'`;
}

async function runSqlite(database: string, sql: string): Promise<string> {
  return (await runProcess([database], sql)).stdout;
}

async function runSqliteJson(database: string, sql: string): Promise<Record<string, unknown>[]> {
  const output = (await runProcess(["-json", database, sql])).stdout.trim();
  if (!output) return [];
  return JSON.parse(output) as Record<string, unknown>[];
}

async function runProcess(args: string[], stdin?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", args, { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      reject(new ContextKernelError("SQLITE_UNAVAILABLE", `Unable to start sqlite3: ${error.message}`));
    });
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolve(result);
      else reject(new ContextKernelError("SQLITE_ERROR", result.stderr.trim() || `sqlite3 exited ${code}`));
    });
    if (stdin !== undefined) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

const INDEX_LOCK_TIMEOUT_MS = 30_000;
const INDEX_LOCK_STALE_MS = 120_000;

async function withIndexLock<T>(paths: WorkspacePaths, work: () => Promise<T>): Promise<T> {
  const lockPath = join(paths.locks, "sqlite-index.lock");
  return withFileLock(lockPath, {
    timeout_ms: INDEX_LOCK_TIMEOUT_MS,
    stale_ms: INDEX_LOCK_STALE_MS,
    busy_code: "INDEX_BUSY",
    busy_message: "Timed out waiting for SQLite index lock",
  }, work);
}
