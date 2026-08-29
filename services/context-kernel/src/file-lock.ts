import { open, stat, unlink } from "node:fs/promises";
import { canonicalJson, newId } from "./canonical.js";
import { ContextKernelError, isErrno } from "./errors.js";

interface LockRecord {
  token: string;
  pid: number;
  acquired_at: string;
}

interface LockIdentity {
  token: string;
  dev: number;
  ino: number;
}

export interface FileLockOptions {
  timeout_ms: number;
  stale_ms: number;
  busy_code: string;
  busy_message: string;
  poll_ms?: number;
}

/**
 * A dependency-free cross-process lock for short, local filesystem mutations.
 *
 * Stale recovery never steals from a live PID. Both recovery and release bind
 * themselves to the acquired inode and random token so an old owner does not
 * remove a replacement lock after its pathname has been reused.
 */
export async function withFileLock<T>(
  lockPath: string,
  options: FileLockOptions,
  work: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  const pollMs = options.poll_ms ?? 20;
  for (;;) {
    const token = newId("lock");
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
      if (await recoverAbandonedLock(lockPath, options.stale_ms)) continue;
      if (Date.now() - started >= options.timeout_ms) {
        throw new ContextKernelError(options.busy_code, options.busy_message);
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }
    let identity: LockIdentity | undefined;
    try {
      const info = await handle.stat();
      identity = { token, dev: info.dev, ino: info.ino };
      const record: LockRecord = {
        token,
        pid: process.pid,
        acquired_at: new Date().toISOString(),
      };
      await handle.writeFile(`${canonicalJson(record)}\n`);
      await handle.sync();
      return await work();
    } finally {
      try {
        await handle.close();
      } finally {
        if (identity) await releaseOwnedLock(lockPath, identity);
      }
    }
  }
}

async function releaseOwnedLock(lockPath: string, identity: LockIdentity): Promise<void> {
  const candidate = await inspectLock(lockPath);
  if (
    !candidate
    || candidate.info.dev !== identity.dev
    || candidate.info.ino !== identity.ino
    || (candidate.record !== null && candidate.record.token !== identity.token)
  ) return;
  await unlink(lockPath).catch((error: unknown) => {
    if (!isErrno(error, "ENOENT")) throw error;
  });
}

async function recoverAbandonedLock(lockPath: string, staleMs: number): Promise<boolean> {
  const candidate = await inspectLock(lockPath);
  if (!candidate) return true;
  if (candidate.record) {
    if (processIsAlive(candidate.record.pid)) return false;
  } else if (Date.now() - Number(candidate.info.mtimeMs) <= staleMs) {
    return false;
  }

  // Re-check the pathname immediately before removal. A different inode or
  // token means another process already recovered and acquired the lock.
  const current = await inspectLock(lockPath);
  if (!current) return true;
  if (current.info.dev !== candidate.info.dev || current.info.ino !== candidate.info.ino) return false;
  if ((current.record?.token ?? null) !== (candidate.record?.token ?? null)) return false;
  try {
    await unlink(lockPath);
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return true;
    throw error;
  }
}

async function inspectLock(lockPath: string): Promise<{
  info: Awaited<ReturnType<typeof stat>>;
  record: LockRecord | null;
} | null> {
  let handle;
  try {
    handle = await open(lockPath, "r");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return null;
    throw error;
  }
  try {
    const info = await handle.stat();
    let record: LockRecord | null = null;
    const text = await handle.readFile("utf8");
    try {
      const parsed = JSON.parse(text) as Partial<LockRecord>;
      if (
        typeof parsed.token === "string"
        && Number.isSafeInteger(parsed.pid)
        && typeof parsed.acquired_at === "string"
      ) {
        record = parsed as LockRecord;
      }
    } catch {
      // Read locks written by the initial v0 implementation so a live process
      // running during an upgrade is not mistaken for an abandoned owner.
      const [legacyPid, legacyDate] = text.trim().split(/\s+/);
      const pid = Number(legacyPid);
      if (Number.isSafeInteger(pid) && legacyDate && Number.isFinite(Date.parse(legacyDate))) {
        record = {
          token: `legacy-${String(info.dev)}-${String(info.ino)}`,
          pid,
          acquired_at: new Date(Date.parse(legacyDate)).toISOString(),
        };
      }
    }
    return { info, record };
  } finally {
    await handle.close();
  }
}

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrno(error, "ESRCH")) return false;
    // EPERM and unknown platform errors do not prove that the owner is dead.
    return true;
  }
}
