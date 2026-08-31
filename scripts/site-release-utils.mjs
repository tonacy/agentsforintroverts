import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../", import.meta.url));
export const requiredNodeRange = ">=22.23.2 <23";

export function assertReleaseNode() {
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  const supported =
    major === 22 && (minor > 23 || (minor === 23 && patch >= 2));

  if (!supported) {
    throw new Error(
      `Release tooling requires Node ${requiredNodeRange}; running ${process.version}. Run \`nvm use\` first.`,
    );
  }
}

export function run(command, args, options = {}) {
  const capture = options.capture ?? false;
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture
      ? [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
      : "";
    throw new Error(
      `Command failed (${result.status ?? "unknown"}): ${command} ${args.join(" ")}${detail ? `\n${detail}` : ""}`,
    );
  }

  return capture ? result.stdout.trim() : undefined;
}

export function git(args) {
  return run("git", args, { capture: true });
}

export function getSourceState() {
  const commitSha = git(["rev-parse", "--verify", "HEAD"]);
  const branch = git(["branch", "--show-current"]) || "detached";
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]);

  return {
    commitSha,
    branch,
    sourceTree: status ? "dirty" : "clean",
    status,
  };
}

export function assertFullCommitSha(value, label = "commit SHA") {
  if (!/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be a full lowercase 40-character Git SHA.`);
  }
}

export function runNpmScript(script, forwardedArgs = []) {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error(
      "npm_execpath is unavailable. Run release tooling through an npm script.",
    );
  }

  const args = [npmExecPath, "run", script];
  if (forwardedArgs.length > 0) args.push("--", ...forwardedArgs);
  return run(process.execPath, args);
}

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
