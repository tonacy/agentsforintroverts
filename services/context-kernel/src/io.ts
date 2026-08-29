import { constants } from "node:fs";
import { access, chmod, link, mkdir, open, readFile, rename, rm, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalJson, newId } from "./canonical.js";
import { ContextKernelError, isErrno } from "./errors.js";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function writeCreateOnly(path: string, data: string | Uint8Array, mode = 0o600): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(directory, `.${newId("tmp")}`);
  const handle = await open(temporaryPath, "wx", mode);
  try {
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  try {
    await link(temporaryPath, path);
  } catch (error) {
    if (isErrno(error, "EEXIST")) {
      throw new ContextKernelError("ALREADY_EXISTS", `Create-only target already exists: ${path}`);
    }
    throw error;
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
  await syncDirectory(directory);
}

export async function writeJsonCreateOnly(path: string, value: unknown): Promise<void> {
  await writeCreateOnly(path, `${canonicalJson(value)}\n`);
}

export async function writeDerivedAtomic(path: string, data: string | Uint8Array, mode = 0o600): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(directory, `.${newId("tmp")}`);
  const handle = await open(temporaryPath, "wx", mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
  await syncDirectory(directory);
}

export async function writeJsonDerived(path: string, value: unknown): Promise<void> {
  await writeDerivedAtomic(path, `${canonicalJson(value)}\n`);
}

export async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

export async function removeIfExists(path: string): Promise<boolean> {
  try {
    await rm(path, { force: false });
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

export async function syncDirectory(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    // Some filesystems/platforms do not support fsync on directory handles.
    if (!["EINVAL", "ENOTSUP", "EOPNOTSUPP", "EBADF", "EPERM"].some((code) => isErrno(error, code))) {
      throw error;
    }
  } finally {
    await handle?.close();
  }
}
