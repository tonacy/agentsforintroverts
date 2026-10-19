#!/usr/bin/env node
import { readArgs, requireWorkspace } from "./src/args.mjs";
import { launchdPlist, runWeekly } from "./src/weekly.mjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

try {
  const { values, positionals } = readArgs(process.argv.slice(2), {
    "dry-run": { type: "boolean", default: false },
    hour: { type: "string", default: "8" },
  });
  const workspace = resolve(requireWorkspace(values));
  if (values.date && !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) throw new Error("--date must be YYYY-MM-DD.");

  if (positionals[0] === "schedule") {
    // Prints a launchd agent for Mondays; installing it is Tony's step.
    process.stdout.write(
      launchdPlist({
        script: fileURLToPath(new URL("./weekly.mjs", import.meta.url)),
        workspace,
        provider: values.provider ?? "claude",
        hour: Number(values.hour) || 8,
      }),
    );
  } else {
    const result = await runWeekly({
      workspace,
      date: values.date,
      provider: values.provider,
      model: values.model,
      dryRun: values["dry-run"],
      out: values.out ? resolve(values.out) : null,
    });
    const { files, ...summary } = result;
    process.stdout.write(`${JSON.stringify(values.json && files ? { ...summary, files } : summary, null, 2)}\n`);
    process.exitCode = result.exitCode;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
