import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const commands = [
  {
    label: "Build the provider-neutral MCP bridge",
    command: "npm",
    args: ["--prefix", "services/mcp", "run", "build"],
  },
  {
    label: "Compile the in-memory Quiet Hub test target",
    command: "npm",
    args: [
      "--prefix",
      "services/mcp",
      "exec",
      "--",
      "tsc",
      "--project",
      "services/hub/tsconfig.test.json",
      "--typeRoots",
      "services/mcp/node_modules/@types",
    ],
  },
  {
    label: "Run the Quiet Desk integration contract",
    command: process.execPath,
    args: ["--test", "test/integration.test.mjs"],
  },
];

for (const { label, command, args } of commands) {
  process.stdout.write(`\n${label}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
