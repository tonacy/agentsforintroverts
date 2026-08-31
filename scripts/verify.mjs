import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertReleaseNode } from "./site-release-utils.mjs";

assertReleaseNode();

const root = fileURLToPath(new URL("../", import.meta.url));
const checks = [
  "test:agents",
  "test:protocol",
  "test:context",
  "test:hub",
  "test:mcp",
  "test:integration",
  "test:mac",
  "lint",
  "build",
  "verify:site",
];

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  throw new Error("npm_execpath is unavailable. Run this verifier with `npm run verify`.");
}

for (const check of checks) {
  process.stdout.write(`\n=== npm run ${check} ===\n`);
  const result = spawnSync(process.execPath, [npmExecPath, "run", check], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
