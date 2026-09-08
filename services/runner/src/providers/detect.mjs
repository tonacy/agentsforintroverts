/**
 * Which providers this Mac can run the daily conversation through, and whether
 * each is signed in. Detection never reads a secret: it checks that a
 * credential exists (a keychain item, a file, an environment variable) and
 * stops there. The catalog is what the Mac app shows.
 */

import { execFile } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CATALOG_SCHEMA = "afi.provider_catalog.v1";
export const PROVIDER_IDS = ["claude", "codex", "anthropic", "fixture"];

const DEFINITIONS = {
  claude: {
    label: "Claude Code",
    kind: "harness",
    binary: "claude",
    sign_in_hint: "Open a terminal, run `claude`, then type /login.",
    models: [
      { id: null, label: "Default" },
      { id: "opus", label: "Opus" },
      { id: "sonnet", label: "Sonnet" },
      { id: "haiku", label: "Haiku" },
    ],
  },
  codex: {
    label: "Codex CLI",
    kind: "harness",
    binary: "codex",
    sign_in_hint: "Run `codex login` in a terminal.",
    models: [{ id: null, label: "Default" }],
  },
  anthropic: {
    label: "Anthropic account",
    kind: "sdk",
    binary: null,
    sign_in_hint:
      "brew install anthropics/tap/ant, then `ant auth login`; or export ANTHROPIC_API_KEY in the shell you launch the app from.",
    models: [
      { id: null, label: "Default (claude-opus-5)" },
      { id: "claude-sonnet-5", label: "Sonnet 5" },
    ],
  },
  fixture: {
    label: "Sample day (offline)",
    kind: "fixture",
    binary: null,
    sign_in_hint: null,
    models: [{ id: null, label: "Canned" }],
  },
};

async function defaultExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function defaultListDir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function defaultExecVersion(bin) {
  try {
    const { stdout } = await execFileAsync(bin, ["--version"], { timeout: 5000 });
    return String(stdout);
  } catch {
    return null;
  }
}

/** True when the macOS keychain holds an item with this service name. The secret is never read. */
async function defaultKeychainHas(service) {
  if (process.platform !== "darwin") throw new Error("keychain unavailable");
  try {
    await execFileAsync("security", ["find-generic-password", "-s", service], { timeout: 5000 });
    return true;
  } catch (error) {
    // Exit 44: item not found. Anything else means we could not check.
    if (error && typeof error.code === "number" && error.code === 44) return false;
    if (error && /could not be found/i.test(String(error.stderr ?? error.message))) return false;
    throw error;
  }
}

function versionOf(text) {
  const match = String(text ?? "").match(/\d+\.\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

async function binDirs({ env, home, listDir }) {
  const dirs = String(env.PATH ?? "").split(":").filter(Boolean);
  const extras = [join(home, ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  const nvmRoot = join(home, ".nvm", "versions", "node");
  const nvmVersions = (await listDir(nvmRoot)).sort().reverse();
  for (const version of nvmVersions) extras.push(join(nvmRoot, version, "bin"));
  return [...new Set([...dirs, ...extras])];
}

async function findBinary(name, dirs, exists) {
  for (const dir of dirs) {
    const candidate = join(dir, name);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export async function detectProviders(
  {
    env = process.env,
    home = homedir(),
    exists = defaultExists,
    listDir = defaultListDir,
    execVersion = defaultExecVersion,
    keychainHas = defaultKeychainHas,
    now = () => new Date(),
  } = {},
  { preference = null } = {},
) {
  const dirs = await binDirs({ env, home, listDir });
  const providers = [];

  for (const id of PROVIDER_IDS) {
    const def = DEFINITIONS[id];
    const entry = {
      id,
      label: def.label,
      kind: def.kind,
      installed: false,
      path: null,
      version: null,
      signed_in: false,
      sign_in_hint: def.sign_in_hint,
      models: def.models,
    };

    if (def.binary) {
      entry.path = await findBinary(def.binary, dirs, exists);
      entry.installed = entry.path !== null;
      if (entry.installed) entry.version = versionOf(await execVersion(entry.path));
    }

    if (id === "claude" && entry.installed) {
      try {
        entry.signed_in = (await keychainHas("Claude Code-credentials")) || (await exists(join(home, ".claude", ".credentials.json")));
      } catch {
        entry.signed_in = (await exists(join(home, ".claude", ".credentials.json"))) ? true : null;
      }
    } else if (id === "codex" && entry.installed) {
      entry.signed_in = await exists(join(home, ".codex", "auth.json"));
    } else if (id === "anthropic") {
      entry.installed = true;
      const profiles = await listDir(join(home, ".config", "anthropic", "credentials"));
      entry.signed_in = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) || profiles.length > 0;
    } else if (id === "fixture") {
      entry.installed = true;
      entry.signed_in = true;
    }

    providers.push(entry);
  }

  return {
    schema: CATALOG_SCHEMA,
    checked_at: now().toISOString(),
    preferred: preference?.provider ?? null,
    providers,
  };
}
