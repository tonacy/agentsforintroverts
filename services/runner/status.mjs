#!/usr/bin/env node
import { readArgs, requireDate, requireWorkspace } from "./src/args.mjs";
import { dayStatus } from "./src/status.mjs";

try {
  const { values } = readArgs(process.argv.slice(2));
  const status = await dayStatus({
    workspace: requireWorkspace(values),
    date: requireDate(values),
    windowDays: Number(values["window-days"]) || 7,
  });
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
