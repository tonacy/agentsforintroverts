#!/usr/bin/env node
import { readArgs, requireDate, requireWorkspace } from "./src/args.mjs";
import { prepareCheckIn, readCheckIn, calibrateCheckIn } from "./src/check-in.mjs";
try {
  const { values, positionals } = readArgs(process.argv.slice(2));
  const options = { workspace: requireWorkspace(values), date: requireDate(values) };
  let input = "";
  if (positionals[0] !== "read") {
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 30000) throw new Error("Check-in input is too large."); }
  }
  const request = input ? JSON.parse(input) : {};
  const actions = { prepare: prepareCheckIn, read: readCheckIn, calibrate: calibrateCheckIn };
  const action = actions[positionals[0]];
  if (!action) throw new Error("Expected prepare, read, or calibrate.");
  process.stdout.write(JSON.stringify(await action({ ...request, ...options })) + "\n");
} catch (error) {
  process.stderr.write(error.message + "\n"); process.exitCode = 1;
}
