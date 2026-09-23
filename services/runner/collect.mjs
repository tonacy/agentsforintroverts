#!/usr/bin/env node
import { readArgs, requireWorkspace } from "./src/args.mjs";
import { collect, prune } from "./src/collect.mjs";

try {
  const { values, positionals } = readArgs(process.argv.slice(2), { refresh: { type: "boolean", default: false } });
  const workspace = requireWorkspace(values);
  const result =
    positionals[0] === "prune"
      ? await prune({ workspace })
      : await collect({ workspace, max: Number(values.max) || 20, refresh: values.refresh });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
