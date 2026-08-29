import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson, newId, sha256 } from "./canonical.js";
import { ContextKernelError } from "./errors.js";
import { pathExists, removeIfExists, syncDirectory, writeCreateOnly } from "./io.js";
import type { PrivateBodyRef } from "./types.js";
import type { WorkspacePaths } from "./workspace.js";

interface EncryptedEnvelope {
  v: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
}

export async function storePrivateBody(paths: WorkspacePaths, body: string): Promise<PrivateBodyRef> {
  const key = await readKey(paths);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(body, "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    v: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  const objectId = newId("body");
  await writeCreateOnly(privateObjectPath(paths, objectId), `${canonicalJson(envelope)}\n`);
  return {
    object_id: objectId,
    sha256: sha256(plaintext),
    bytes: plaintext.byteLength,
    algorithm: "aes-256-gcm",
  };
}

export async function readPrivateBody(paths: WorkspacePaths, ref: PrivateBodyRef): Promise<string | null> {
  const path = privateObjectPath(paths, ref.object_id);
  if (!(await pathExists(path))) return null;
  try {
    const envelope = JSON.parse(await readFile(path, "utf8")) as EncryptedEnvelope;
    if (envelope.v !== 1 || envelope.algorithm !== "aes-256-gcm") {
      throw new ContextKernelError("UNSUPPORTED_ENCRYPTION", `Unsupported object envelope for ${ref.object_id}`);
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await readKey(paths),
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    if (sha256(plaintext) !== ref.sha256 || plaintext.byteLength !== ref.bytes) {
      throw new ContextKernelError("OBJECT_INTEGRITY_ERROR", `Private object ${ref.object_id} failed integrity verification`);
    }
    return plaintext.toString("utf8");
  } catch (error) {
    if (error instanceof ContextKernelError) throw error;
    throw new ContextKernelError(
      "OBJECT_INTEGRITY_ERROR",
      `Private object ${ref.object_id} could not be authenticated`,
    );
  }
}

export async function deletePrivateBody(paths: WorkspacePaths, objectId: string): Promise<boolean> {
  const removed = await removeIfExists(privateObjectPath(paths, objectId));
  if (removed) await syncDirectory(paths.objects);
  return removed;
}

export async function listPrivateBodyFiles(paths: WorkspacePaths): Promise<string[]> {
  const entries = await readdir(paths.objects, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

export async function deletePrivateBodyFile(paths: WorkspacePaths, fileName: string): Promise<boolean> {
  // fileName originates from readdir on this kernel-owned directory.
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    throw new TypeError("private object file name is invalid");
  }
  const removed = await removeIfExists(join(paths.objects, fileName));
  if (removed) await syncDirectory(paths.objects);
  return removed;
}

export function privateObjectPath(paths: WorkspacePaths, objectId: string): string {
  return join(paths.objects, `${objectId}.enc`);
}

async function readKey(paths: WorkspacePaths): Promise<Buffer> {
  const key = await readFile(paths.key);
  if (key.byteLength !== 32) {
    throw new ContextKernelError("ENCRYPTION_KEY_INVALID", "Workspace key must be 32 bytes");
  }
  return key;
}
