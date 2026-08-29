import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
];

for (const check of checks) {
  process.stdout.write(`\n=== npm run ${check} ===\n`);
  const result = spawnSync("npm", ["run", check], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
