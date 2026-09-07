#!/usr/bin/env node
import { readArgs, requireDate, requireWorkspace } from "./src/args.mjs";
import { runDay } from "./src/run-day.mjs";

try {
  const { values } = readArgs(process.argv.slice(2));
  const result = await runDay({
    workspace: requireWorkspace(values),
    date: requireDate(values),
    provider: values.provider,
    mode: values.mode,
    windowDays: Number(values["window-days"]) || 7,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.exitCode;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
