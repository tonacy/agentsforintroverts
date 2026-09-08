#!/usr/bin/env node
/** capture.mjs new --workspace DIR --date YYYY-MM-DD --json */
import { readArgs, requireDate, requireWorkspace } from "./src/args.mjs";
import { newCapture } from "./src/capture.mjs";

try {
  const { values, positionals } = readArgs(process.argv.slice(2));
  if ((positionals[0] ?? "new") !== "new") throw new Error(`Unknown command ${JSON.stringify(positionals[0])}. Expected new.`);
  const result = await newCapture({ workspace: requireWorkspace(values), date: requireDate(values) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
