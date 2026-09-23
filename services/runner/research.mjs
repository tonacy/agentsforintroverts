#!/usr/bin/env node
import { readArgs, requireDate, requireWorkspace } from "./src/args.mjs";
import { researchOutside } from "./src/outside-research.mjs";
try {
  const { values } = readArgs(process.argv.slice(2));
  let input = "";
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 10000) throw new Error("Research input is too large."); }
  const { topics } = JSON.parse(input);
  const result = await researchOutside({ workspace: requireWorkspace(values), date: requireDate(values), topics });
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
