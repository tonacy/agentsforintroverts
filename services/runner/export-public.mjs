#!/usr/bin/env node
import { readArgs, requireDate, requireWorkspace } from "./src/args.mjs";
import { exportPublic } from "./src/export-public.mjs";

try {
  const { values } = readArgs(process.argv.slice(2));
  const result = await exportPublic({
    workspace: requireWorkspace(values),
    date: requireDate(values),
    approve: values.approve,
    includeInside: values["include-inside"],
    out: values.out,
  });
  if (result.exitCode !== 0) {
    process.stderr.write(`${result.error}\n`);
  } else {
    process.stdout.write(`${JSON.stringify({ path: result.paths.public, out: result.paths.out ?? null, paths: result.paths, places: result.day.places.length, outside: result.day.outside.length }, null, 2)}\n`);
  }
  process.exitCode = result.exitCode;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
