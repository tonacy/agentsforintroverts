import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertIsoDate, assertSortableId, newId, safeSegment } from "./canonical.js";
import { ContextKernelError } from "./errors.js";
import { ensurePrivateDirectory, pathExists, readJson, writeCreateOnly, writeJsonCreateOnly } from "./io.js";
import { WORKSPACE_SCHEMA, type WorkspaceInitInput, type WorkspaceManifest } from "./types.js";

export interface WorkspacePaths {
  root: string;
  manifest: string;
  ledger: string;
  events: string;
  idempotency: string;
  locks: string;
  objects: string;
  key: string;
  projections: string;
  scratch: string;
  cache: string;
  sqlite: string;
}

export function workspacePaths(root: string): WorkspacePaths {
  const absolute = resolve(root);
  return {
    root: absolute,
    manifest: join(absolute, "context-workspace.json"),
    ledger: join(absolute, "ledger"),
    events: join(absolute, "ledger", "events"),
    idempotency: join(absolute, "ledger", "idempotency"),
    locks: join(absolute, "ledger", "locks"),
    objects: join(absolute, "objects", "private"),
    key: join(absolute, ".secrets", "context.key"),
    projections: join(absolute, "projections"),
    scratch: join(absolute, "scratch"),
    cache: join(absolute, "cache"),
    sqlite: join(absolute, "cache", "context.sqlite3"),
  };
}

export async function initializeWorkspace(
  root: string,
  input: WorkspaceInitInput,
): Promise<{ manifest: WorkspaceManifest; created: boolean; paths: WorkspacePaths }> {
  const paths = workspacePaths(root);
  if (await pathExists(paths.manifest)) {
    const manifest = await readJson<WorkspaceManifest>(paths.manifest);
    validateManifest(manifest);
    if (manifest.owner_id !== input.owner_id) {
      throw new ContextKernelError("OWNER_MISMATCH", "Workspace belongs to a different owner", {
        expected: manifest.owner_id,
        received: input.owner_id,
      });
    }
    await ensureLayout(paths);
    return { manifest, created: false, paths };
  }

  const createdAt = assertIsoDate(input.created_at ?? new Date().toISOString(), "created_at");
  const manifest: WorkspaceManifest = {
    schema: WORKSPACE_SCHEMA,
    workspace_id: input.workspace_id
      ? assertSortableId(input.workspace_id, "workspace_id")
      : newId("workspace"),
    owner_id: safeSegment(input.owner_id, "owner_id"),
    created_at: createdAt,
    encryption: { algorithm: "aes-256-gcm", key_file: ".secrets/context.key" },
    paths: {
      ledger: "ledger/events",
      private_objects: "objects/private",
      projections: "projections",
      scratch: "scratch",
      cache: "cache/context.sqlite3",
    },
  };

  await ensureLayout(paths);
  await writeCreateOnly(paths.key, randomBytes(32), 0o600).catch(async (error: unknown) => {
    if (error instanceof ContextKernelError && error.code === "ALREADY_EXISTS") return;
    throw error;
  });
  await writeJsonCreateOnly(paths.manifest, manifest);
  return { manifest, created: true, paths };
}

export async function openWorkspace(root: string): Promise<{ manifest: WorkspaceManifest; paths: WorkspacePaths }> {
  const paths = workspacePaths(root);
  if (!(await pathExists(paths.manifest))) {
    throw new ContextKernelError("WORKSPACE_NOT_INITIALIZED", `No context workspace at ${paths.root}`);
  }
  const manifest = await readJson<WorkspaceManifest>(paths.manifest);
  validateManifest(manifest);
  await ensureLayout(paths);
  const key = await readFile(paths.key).catch(() => null);
  if (!key || key.byteLength !== 32) {
    throw new ContextKernelError("ENCRYPTION_KEY_MISSING", "Workspace encryption key is missing or invalid");
  }
  return { manifest, paths };
}

async function ensureLayout(paths: WorkspacePaths): Promise<void> {
  // mkdir is intentionally non-mutating when the caller-owned root already exists.
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await Promise.all([
    ensurePrivateDirectory(paths.events),
    ensurePrivateDirectory(paths.idempotency),
    ensurePrivateDirectory(paths.locks),
    ensurePrivateDirectory(paths.objects),
    ensurePrivateDirectory(paths.projections),
    ensurePrivateDirectory(paths.scratch),
    ensurePrivateDirectory(paths.cache),
    ensurePrivateDirectory(join(paths.root, ".secrets")),
  ]);
  await mkdir(join(paths.projections, "entities"), { recursive: true, mode: 0o700 });
}

function validateManifest(manifest: WorkspaceManifest): void {
  if (manifest.schema !== WORKSPACE_SCHEMA) {
    throw new ContextKernelError("UNSUPPORTED_WORKSPACE", `Unsupported workspace schema: ${String(manifest.schema)}`);
  }
  assertSortableId(manifest.workspace_id, "workspace_id");
  safeSegment(manifest.owner_id, "owner_id");
  assertIsoDate(manifest.created_at, "created_at");
}
